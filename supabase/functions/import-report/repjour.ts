// Portage AUTONOME (Deno) de la logique d'import RepJour côté navigateur vers
// l'Edge Function « import-report », pour l'import AUTOMATIQUE déclenché par e-mail.
//
// Ce fichier NE dépend PAS de src/lib/repjour/** (pas d'alias `#/` en Deno) : les
// constantes et helpers utiles y sont RECOPIÉS à l'identique. Il reproduit :
//   - importComparison  ← processComparisonOnly (orchestrator.ts) : Comparison SEUL
//   - importForecast    ← importForecastDays + validation de preValidateForecast
//
// Les deux fonctions renvoient le nombre de lignes importées et LÈVENT une Error
// sur erreur BLOQUANTE de validation (le message est renvoyé tel quel au client).
// `admin` est un client service_role (bypass RLS) fourni par l'appelant.

import Papa from 'npm:papaparse@5'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// --- Constantes recopiées de src/lib/repjour/constants.ts ---------------------
const TOTAL_ROOMS = 80 // 80 chambres (hôtel unique)
const VAT_RATE = 10 // TVA hébergement France
const VAT_FACTOR = 1 + VAT_RATE / 100 // = 1,10

/** HT → TTC. */
function toTTC(ht: number): number {
  return ht * VAT_FACTOR
}
/** TTC → HT. */
function fromTTC(ttc: number): number {
  return ttc / VAT_FACTOR
}

// Mois en français, index 1-12 (recopié de lib/shared/dates.ts), pour le message
// « aucun objectif défini pour <mois> <année> ».
const MONTHS = [
  '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

// Identité système « StayNTouch (PMS) » : les imports robot sont estampillés avec
// cet UUID fixe (cf. étape 1, SQL d'identité système).
const SYSTEM_IMPORTER_ID = '11111111-1111-1111-1111-111111111111'

// --- Types minimaux (recopiés de src/lib/repjour/types.ts) --------------------
interface Alert {
  type: 'error' | 'warning'
  message: string
}

interface KPIBlock {
  nuitees: number
  to: number
  pm: number
  revpar: number
  roomRevenue: number
}

interface ReportDate {
  dayOfMonth: number
  month: number
  year: number
  daysInMonth: number
}

interface ComparisonData {
  today: {
    occupiedRoomsExclComp: number
    totalRevenueHT: number
    totalRevenueTTC: number
    vat: number
  }
  mtd: {
    occupiedRoomsExclComp: number
    totalRevenueHT: number
    totalRevenueTTC: number
  }
}

interface ForecastRow {
  date: string
  month: number
  year: number
  occ: number
  revHT: number
  revTTC: number
}

interface ComparisonMetricRow {
  lineNo: number
  section: string
  today: number | null
  mtd: number | null
  lastYearMtd: number | null
  mtdVariance: number | null
  ytd: number | null
  lastYearYtd: number | null
  ytdVariance: number | null
  raw: Record<string, string>
}

interface TvaRef {
  adrTTC: number
  throughDay: number
}

// =============================================================================
// parse/date.ts — extractReportDate (J-1)
// =============================================================================
//
// La date du NOM de fichier est la date d'export (aujourd'hui) ; les données
// couvrent la VEILLE → on soustrait 1 jour. Découpage SÛR : on part des
// composantes AAAAMMJJ du nom, jamais de `new Date()` dépendant du fuseau serveur,
// et l'arithmétique J-1 se fait en UTC (déterministe, indépendante de DST/UTC/Paris).
function extractReportDate(filename: string | undefined): ReportDate {
  const match = filename?.match(/(\d{4})(\d{2})(\d{2})/)
  if (!match) {
    throw new Error(
      "Impossible de lire la date dans le nom du fichier. Garde le nom d'origine donné par ton logiciel, il contient la date.",
    )
  }

  const y = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const d = parseInt(match[3], 10)

  // UTC pur : construit à partir des composantes, décrémenté d'un jour, relu en UTC.
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - 1) // J-1 : données de la veille

  if (isNaN(date.getTime())) {
    throw new Error(
      "La date lue dans le nom du fichier n'est pas valide. Vérifie que c'est bien le fichier du jour.",
    )
  }

  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1 // 1-12
  const dayOfMonth = date.getUTCDate()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  return { dayOfMonth, month, year, daysInMonth }
}

// =============================================================================
// parse/comparison.ts — parseComparison (les 3 lignes clés pour les KPI)
// =============================================================================
function parseComparison(csvText: string): ComparisonData {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  if (!result.data || result.data.length === 0) {
    throw new Error(
      "Le fichier des chiffres du jour est vide ou illisible. Recommence l'export.",
    )
  }

  const headerRow = result.data[0]
  let todayIndex = -1
  let mtdIndex = -1
  for (let i = 0; i < headerRow.length; i++) {
    const val = headerRow[i]?.trim().toUpperCase()
    if (val === 'TODAY') todayIndex = i
    if (val === 'MTD') mtdIndex = i
  }

  if (todayIndex === -1 || mtdIndex === -1) {
    throw new Error(
      "Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier des chiffres du jour (Comparison By Date).",
    )
  }

  let occExclCompToday = 0
  let occExclCompMTD = 0
  let totalRevenueHTToday = 0
  let totalRevenueHTMTD = 0
  let vatToday = 0

  for (const row of result.data.slice(1)) {
    const section = (row[0] || '').trim()
    if (section === 'Occupied Rooms') {
      occExclCompToday = parseFloat(row[todayIndex]) || 0
      occExclCompMTD = parseFloat(row[mtdIndex]) || 0
    } else if (section === 'ROOM REVENUE') {
      totalRevenueHTToday = parseFloat(row[todayIndex]) || 0
      totalRevenueHTMTD = parseFloat(row[mtdIndex]) || 0
    } else if (section === 'VAT') {
      vatToday = parseFloat(row[todayIndex]) || 0
    }
  }

  return {
    today: {
      occupiedRoomsExclComp: occExclCompToday,
      totalRevenueHT: totalRevenueHTToday,
      totalRevenueTTC: toTTC(totalRevenueHTToday),
      vat: vatToday,
    },
    mtd: {
      occupiedRoomsExclComp: occExclCompMTD,
      totalRevenueHT: totalRevenueHTMTD,
      totalRevenueTTC: toTTC(totalRevenueHTMTD),
    },
  }
}

// =============================================================================
// parse/metrics.ts — parseComparisonMetrics (TOUT le CSV, ligne à ligne)
// =============================================================================
const METRIC_COLUMNS = [
  ['today', 'TODAY'],
  ['mtd', 'MTD'],
  ['lastYearMtd', 'LAST YEAR MTD'],
  ['mtdVariance', 'MTD VARIANCE'],
  ['ytd', 'YTD'],
  ['lastYearYtd', 'LAST YEAR YTD'],
  ['ytdVariance', 'YTD VARIANCE'],
] as const

/** Nombre strict ou `null`. Le `%` est retiré ; « 82 / 0 » n'est PAS un nombre. */
function toNumber(value: string | undefined): number | null {
  const s = (value ?? '').trim().replace(/%$/, '').replace(/\s/g, '')
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseComparisonMetrics(csvText: string): ComparisonMetricRow[] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })
  const data = result.data ?? []
  if (data.length === 0) {
    throw new Error(
      "Le fichier des chiffres du jour est vide ou illisible. Recommence l'export.",
    )
  }

  const header = data[0].map((h) => (h ?? '').trim().toUpperCase())
  const index = Object.fromEntries(
    METRIC_COLUMNS.map(([key, label]) => [key, header.indexOf(label)]),
  ) as Record<(typeof METRIC_COLUMNS)[number][0], number>

  if (index.today === -1) {
    throw new Error(
      "Ce fichier n'a pas le bon format. Vérifie le fichier des chiffres du jour (Comparison By Date).",
    )
  }

  const rows: ComparisonMetricRow[] = []
  for (const row of data.slice(1)) {
    const section = (row[0] ?? '').trim()
    if (!section) continue

    const raw: Record<string, string> = {}
    for (const [key] of METRIC_COLUMNS) {
      const i = index[key]
      const value = i === -1 ? '' : (row[i] ?? '').trim()
      if (value) raw[key] = value
    }

    rows.push({
      lineNo: rows.length + 1,
      section,
      today: toNumber(row[index.today]),
      mtd: toNumber(row[index.mtd]),
      lastYearMtd: toNumber(row[index.lastYearMtd]),
      mtdVariance: toNumber(row[index.mtdVariance]),
      ytd: toNumber(row[index.ytd]),
      lastYearYtd: toNumber(row[index.lastYearYtd]),
      ytdVariance: toNumber(row[index.ytdVariance]),
      raw,
    })
  }

  return rows
}

// =============================================================================
// parse/forecast.ts — parseForecastAll (toutes les lignes, REV = TTC)
// =============================================================================
function parseForecastAll(csvText: string): ForecastRow[] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  if (!result.data || result.data.length < 3) {
    throw new Error(
      "Le fichier des prévisions est vide ou incomplet. Recommence l'export.",
    )
  }

  const headers = result.data[1]
  const dateHeader = (headers[0] || '').trim().toUpperCase()
  const occHeader = (headers[3] || '').trim().toUpperCase()
  const revHeader = (headers[7] || '').trim().toUpperCase()

  if (dateHeader !== 'DATE' || occHeader !== 'OCC' || revHeader !== 'REV') {
    console.error(
      `Forecast : en-têtes inattendus "${headers[0]?.trim()}" / "${headers[3]?.trim()}" / "${headers[7]?.trim()}" (attendus DATE / OCC / REV)`,
    )
    throw new Error(
      "Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier des prévisions (Forecast By Date Range).",
    )
  }

  const rows: ForecastRow[] = []
  for (const row of result.data.slice(2)) {
    const dateStr = (row[0] || '').trim()
    if (dateStr.toUpperCase() === 'TOTALS' || dateStr === '') continue

    const dateParts = dateStr.split('-')
    if (dateParts.length !== 3) continue

    const day = parseInt(dateParts[0], 10)
    const month = parseInt(dateParts[1], 10)
    const year = parseInt(dateParts[2], 10)
    if (isNaN(day) || isNaN(month) || isNaN(year)) continue

    const occ = parseInt(row[3], 10) || 0
    const revTTC = parseFloat(row[7]) || 0
    const revHT = fromTTC(revTTC) // REV du forecast est déjà TTC

    rows.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      month,
      year,
      occ,
      revHT,
      revTTC,
    })
  }

  return rows
}

// =============================================================================
// calc/kpi.ts — realiseJour / realiseMTD (TTC, base 80)
// =============================================================================
function computeRealiseJour(comparison: ComparisonData): KPIBlock {
  const nuitees = comparison.today.occupiedRoomsExclComp
  const roomRevenue = comparison.today.totalRevenueTTC
  return {
    nuitees,
    roomRevenue,
    to: (nuitees / TOTAL_ROOMS) * 100,
    pm: nuitees > 0 ? roomRevenue / nuitees : 0,
    revpar: roomRevenue / TOTAL_ROOMS,
  }
}

function computeRealiseMTD(comparison: ComparisonData, dayOfMonth: number): KPIBlock {
  const nuitees = comparison.mtd.occupiedRoomsExclComp
  const roomRevenue = comparison.mtd.totalRevenueTTC
  return {
    nuitees,
    roomRevenue,
    to: dayOfMonth > 0 ? (nuitees / (TOTAL_ROOMS * dayOfMonth)) * 100 : 0,
    pm: nuitees > 0 ? roomRevenue / nuitees : 0,
    revpar: dayOfMonth > 0 ? roomRevenue / (TOTAL_ROOMS * dayOfMonth) : 0,
  }
}

// =============================================================================
// calc/validate.ts — TvaRef, validateForecast, validateCoherence
// =============================================================================
/** Jours réalisés minimum pour qu'un ADR MTD fasse foi. */
const SEUIL_JOURS_REF = 5

function buildTvaRefFrom(
  roomRevenueTTC: number,
  nuitees: number,
  throughDay: number,
): TvaRef | null {
  if (nuitees >= SEUIL_JOURS_REF && roomRevenueTTC > 0 && throughDay > 0) {
    return { adrTTC: roomRevenueTTC / nuitees, throughDay }
  }
  return null
}

/** Référence TTC depuis le dernier daily_report du mois (jour le plus avancé). */
function buildTvaRef(latestReport: {
  rmtd_room_revenue: number
  rmtd_nuitees: number
  day_of_month: number
} | null): TvaRef | null {
  if (!latestReport) return null
  return buildTvaRefFrom(
    latestReport.rmtd_room_revenue,
    latestReport.rmtd_nuitees,
    latestReport.day_of_month,
  )
}

// Messages de validation — sans chiffres, constants (source unique).
const MSG = {
  empty: "Ce fichier ne contient aucun jour. Vérifie le mois que tu as exporté.",
  incomplete:
    "Il manque des jours dans le fichier. Réexporte le mois entier (normal si le mois n'est pas encore fini).",
  impossible:
    'Le fichier contient des chiffres impossibles. Il a mal été exporté, recommence.',
  occNoRev:
    'Sur certains jours, des chambres sont occupées mais leur montant est à zéro. Vérifie le fichier.',
  adrWeird:
    "Le prix moyen par chambre est anormal. Vérifie que c'est le bon fichier.",
  tvaMissing:
    "Ce forecast est en HT (montants trop bas d'environ 10%) : la TVA n'a pas été incluse à l'export. Réexporte-le en cochant « Include Tax ».",
  realNegatives:
    'Le fichier contient des chiffres négatifs. Il a mal été exporté, recommence.',
  tooManyRooms:
    "Le fichier compte plus de chambres vendues que l'hôtel n'en a. Vérifie le fichier.",
  roomNoRevenue:
    'Des chambres sont vendues mais leur montant est à zéro. Vérifie le fichier.',
  revenueNoRoom:
    'Il y a un montant mais aucune chambre vendue. Vérifie le fichier.',
} as const

function validateForecast(
  rows: ForecastRow[],
  daysInMonth: number,
  ref: TvaRef | null,
): Alert[] {
  const alerts: Alert[] = []

  if (rows.length === 0) {
    alerts.push({ type: 'error', message: MSG.empty })
    return alerts
  }

  if (rows.length < daysInMonth) {
    alerts.push({ type: 'warning', message: MSG.incomplete })
  }

  const hasImpossible = rows.some(
    (r) => r.occ < 0 || r.revTTC < 0 || (r.occ === 0 && r.revTTC > 0),
  )
  if (hasImpossible) {
    alerts.push({ type: 'error', message: MSG.impossible })
  }

  const hasOccNoRev = rows.some((r) => r.occ > 0 && r.revTTC === 0)
  if (hasOccNoRev) {
    alerts.push({ type: 'warning', message: MSG.occNoRev })
  }

  const totalOcc = rows.reduce((s, r) => s + r.occ, 0)
  const totalRev = rows.reduce((s, r) => s + r.revTTC, 0)
  const avgADR = totalOcc > 0 ? totalRev / totalOcc : 0
  if (avgADR > 0 && (avgADR < 30 || avgADR > 300)) {
    alerts.push({ type: 'warning', message: MSG.adrWeird })
  }

  // Détection « forecast en HT » : comparaison à périmètre égal (jours ≤ throughDay)
  // à l'ADR réalisé TTC ; bande tolérante 0,83–0,93 → ERROR bloquante.
  if (ref && ref.adrTTC > 0) {
    let occPast = 0
    let revPast = 0
    for (const r of rows) {
      const day = parseInt(r.date.slice(8, 10), 10)
      if (day <= ref.throughDay) {
        occPast += r.occ
        revPast += r.revTTC
      }
    }
    const adrPast = occPast > 0 ? revPast / occPast : 0
    if (adrPast > 0) {
      const ratio = adrPast / ref.adrTTC
      if (ratio > 0.83 && ratio < 0.93) {
        alerts.push({ type: 'error', message: MSG.tvaMissing })
      }
    }
  }

  return alerts
}

function validateCoherence(realiseJour: KPIBlock): Alert[] {
  const alerts: Alert[] = []

  if (realiseJour.nuitees < 0 || realiseJour.roomRevenue < 0) {
    alerts.push({ type: 'error', message: MSG.realNegatives })
  }
  if (realiseJour.nuitees > TOTAL_ROOMS) {
    alerts.push({ type: 'error', message: MSG.tooManyRooms })
  }
  if (realiseJour.nuitees > 0 && realiseJour.roomRevenue === 0) {
    alerts.push({ type: 'warning', message: MSG.roomNoRevenue })
  }
  if (realiseJour.nuitees === 0 && realiseJour.roomRevenue > 0) {
    alerts.push({ type: 'warning', message: MSG.revenueNoRoom })
  }

  return alerts
}

// =============================================================================
// services/metrics.ts — upsertDailyMetrics (upsert AVANT purge)
// =============================================================================
const PMS_METRICS_TABLE = 'pms_daily_metrics'

/**
 * Écrit toutes les lignes du Comparison pour une date (clé report_date,line_no).
 * Idempotent. L'upsert PRÉCÈDE la purge (un échec au milieu laisse la date
 * complète plutôt qu'amputée). `imported_by` n'est PAS forcé : un trigger le pose.
 */
async function upsertDailyMetrics(
  admin: SupabaseClient,
  reportDate: string,
  rows: ComparisonMetricRow[],
): Promise<void> {
  if (rows.length === 0) return

  const payload = rows.map((r) => ({
    report_date: reportDate,
    line_no: r.lineNo,
    section: r.section,
    today: r.today,
    mtd: r.mtd,
    last_year_mtd: r.lastYearMtd,
    mtd_variance: r.mtdVariance,
    ytd: r.ytd,
    last_year_ytd: r.lastYearYtd,
    ytd_variance: r.ytdVariance,
    raw: r.raw,
  }))

  const { error } = await admin
    .from(PMS_METRICS_TABLE)
    .upsert(payload, { onConflict: 'report_date,line_no' })
  if (error) throw error

  const { error: purgeError } = await admin
    .from(PMS_METRICS_TABLE)
    .delete()
    .eq('report_date', reportDate)
    .gt('line_no', rows.length)
  if (purgeError) throw purgeError
}

// =============================================================================
// IMPORTEURS PUBLICS
// =============================================================================

/**
 * Import du Comparison SEUL — porte `processComparisonOnly` (orchestrator.ts).
 * Le Forecast arrive dans un autre e-mail : le projeté (pm_*) est calculé à partir
 * des `forecast_days` DÉJÀ en base, pas du fichier.
 *
 * Renvoie le nombre de lignes de détail écrites (pms_daily_metrics), au moins 1.
 * Lève une Error sur validation bloquante (négatifs, nuitées > 80) ou budget absent.
 */
export async function importComparison(
  admin: SupabaseClient,
  csv: string,
  filename: string,
): Promise<number> {
  const reportDate = extractReportDate(filename)
  const comparison = parseComparison(csv)

  const alerts: Alert[] = []

  const realiseJour = computeRealiseJour(comparison)
  const realiseMTD = computeRealiseMTD(comparison, reportDate.dayOfMonth)

  // Budget du mois : OBLIGATOIRE (comme l'orchestrateur).
  const { data: budget, error: budgetError } = await admin
    .from('budget')
    .select('*')
    .eq('year', reportDate.year)
    .eq('month', reportDate.month)
    .single()

  if (budgetError || !budget) {
    throw new Error(
      `Aucun objectif n'est défini pour ${MONTHS[reportDate.month]} ${reportDate.year}. Ajoute-le dans la gestion budgétaire avant d'importer.`,
    )
  }

  // Projeté du mois (pm_*) depuis les forecast_days déjà importés.
  const { data: existingForecasts, error: forecastErr } = await admin
    .from('forecast_days')
    .select('*')
    .eq('year', reportDate.year)
    .eq('month', reportDate.month)

  // Lecture en échec : on NE PEUT PAS calculer le projeté → on échoue clairement
  // plutôt que d'écrire des zéros dans pm_* (qui écraseraient un projeté correct).
  if (forecastErr) {
    throw new Error(
      "Impossible de lire les prévisions du mois pour l'instant. Réessaie dans un instant.",
    )
  }

  let projeteMois: KPIBlock = {
    nuitees: 0,
    to: 0,
    pm: 0,
    revpar: 0,
    roomRevenue: 0,
  }
  if (existingForecasts && existingForecasts.length > 0) {
    const totalOCC = existingForecasts.reduce(
      (s: number, f: { occ: number }) => s + f.occ,
      0,
    )
    const totalRevTTC = existingForecasts.reduce(
      (s: number, f: { rev_ttc: number }) => s + f.rev_ttc,
      0,
    )
    projeteMois = {
      nuitees: totalOCC,
      roomRevenue: totalRevTTC,
      to: (totalOCC / (TOTAL_ROOMS * reportDate.daysInMonth)) * 100,
      pm: totalOCC > 0 ? totalRevTTC / totalOCC : 0,
      revpar: totalRevTTC / (TOTAL_ROOMS * reportDate.daysInMonth),
    }
  } else {
    alerts.push({
      type: 'warning',
      message:
        "Aucune prévision n'a encore été chargée pour ce mois : les chiffres prévus ne peuvent pas s'afficher.",
    })
  }

  // Cohérence du réalisé : une impossibilité PHYSIQUE bloque l'import.
  const coherenceAlerts = validateCoherence(realiseJour)
  alerts.push(...coherenceAlerts)
  const coherenceErrors = coherenceAlerts.filter((a) => a.type === 'error')
  if (coherenceErrors.length > 0) {
    throw new Error(
      `Ce rapport ne peut pas être enregistré :\n${coherenceErrors.map((a) => `• ${a.message}`).join('\n')}`,
    )
  }

  const dateStr = `${reportDate.year}-${String(reportDate.month).padStart(2, '0')}-${String(reportDate.dayOfMonth).padStart(2, '0')}`

  // Détail brut du CSV → pms_daily_metrics. NON BLOQUANT (comme saveComparisonMetrics) :
  // un échec ajoute une alerte persistée AVEC le rapport, sans faire échouer l'import.
  let metrics: ComparisonMetricRow[] = []
  try {
    metrics = parseComparisonMetrics(csv)
    await upsertDailyMetrics(admin, dateStr, metrics)
  } catch (err) {
    console.error(
      'Archivage du détail du rapport échoué :',
      err instanceof Error ? err.message : String(err),
    )
    alerts.push({
      type: 'warning',
      message:
        "Le détail du rapport n'a pas pu être enregistré, mais ton rapport du jour est bien sauvegardé.",
    })
  }

  // UPSERT daily_reports (toutes les colonnes) + identité système StayNTouch.
  const reportData = {
    date: dateStr,
    month: reportDate.month,
    year: reportDate.year,
    day_of_month: reportDate.dayOfMonth,
    days_in_month: reportDate.daysInMonth,
    rj_nuitees: realiseJour.nuitees,
    rj_to: realiseJour.to,
    rj_pm: realiseJour.pm,
    rj_revpar: realiseJour.revpar,
    rj_room_revenue: realiseJour.roomRevenue,
    rmtd_nuitees: realiseMTD.nuitees,
    rmtd_to: realiseMTD.to,
    rmtd_pm: realiseMTD.pm,
    rmtd_revpar: realiseMTD.revpar,
    rmtd_room_revenue: realiseMTD.roomRevenue,
    pm_nuitees: projeteMois.nuitees,
    pm_to: projeteMois.to,
    pm_pm: projeteMois.pm,
    pm_revpar: projeteMois.revpar,
    pm_room_revenue: projeteMois.roomRevenue,
    imported_by: SYSTEM_IMPORTER_ID,
    alerts,
  }

  const { error: upsertError } = await admin
    .from('daily_reports')
    .upsert(reportData, { onConflict: 'date' })

  if (upsertError) {
    console.error('Sauvegarde du rapport échouée :', upsertError.message)
    throw new Error(
      "Le rapport n'a pas pu être enregistré. Réessaie dans un instant.",
    )
  }

  // Nombre de lignes importées : les lignes de détail, sinon 1 (le rapport lui-même).
  return metrics.length || 1
}

/**
 * Import STANDALONE d'un Forecast — porte `importForecastDays` (orchestrator.ts)
 * en y intégrant la validation de `preValidateForecast` (les deux étapes que l'UI
 * manuelle enchaîne). Écrit TOUTES les lignes du CSV dans `forecast_days` (plusieurs
 * mois / années possibles), idempotent par la clé `date`. Ne touche NI daily_reports
 * NI budget.
 *
 * Renvoie le nombre de jours (lignes) écrits. Lève une Error sur validation
 * bloquante (fichier vide, chiffres impossibles, forecast en HT).
 */
export async function importForecast(
  admin: SupabaseClient,
  csv: string,
  _filename: string,
): Promise<number> {
  const rows = parseForecastAll(csv)
  if (rows.length === 0) {
    throw new Error(
      'Ce fichier de prévisions est vide. Vérifie que tu as exporté le bon fichier.',
    )
  }

  // Grouper par {year, month} pour valider chaque mois avec SA référence réalisée.
  const monthGroups = new Map<string, ForecastRow[]>()
  for (const row of rows) {
    const key = `${row.year}-${row.month}`
    if (!monthGroups.has(key)) monthGroups.set(key, [])
    monthGroups.get(key)!.push(row)
  }

  // Référence TTC = RÉALISÉ des années concernées (daily_reports). Si pas de réalisé
  // pour un mois → pas de référence → pas de détection HT (comme le source).
  const years = [...new Set(rows.map((r) => r.year))]
  const { data: reportsAll, error: reportsErr } = await admin
    .from('daily_reports')
    .select('year, month, day_of_month, rmtd_room_revenue, rmtd_nuitees')
    .in('year', years)

  if (reportsErr) {
    throw new Error(
      "Impossible de lire le réalisé du mois pour l'instant. Réessaie dans un instant.",
    )
  }

  // Dernier rapport (jour le plus avancé) par {year, month} → porte le MTD réalisé.
  const latestByMonth = new Map<
    string,
    { year: number; month: number; day_of_month: number; rmtd_room_revenue: number; rmtd_nuitees: number }
  >()
  for (const r of reportsAll ?? []) {
    const key = `${r.year}-${r.month}`
    const cur = latestByMonth.get(key)
    if (!cur || r.day_of_month > cur.day_of_month) latestByMonth.set(key, r)
  }

  // Valider chaque mois ; collecter les erreurs bloquantes (dédoublonnées).
  const allErrors: Alert[] = []
  for (const [key, monthRows] of monthGroups) {
    const [yearStr, monthStr] = key.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const ref = buildTvaRef(latestByMonth.get(key) ?? null)
    allErrors.push(
      ...validateForecast(monthRows, daysInMonth, ref).filter(
        (a) => a.type === 'error',
      ),
    )
  }

  const seen = new Set<string>()
  const blockingErrors = allErrors.filter((a) => {
    if (seen.has(a.message)) return false
    seen.add(a.message)
    return true
  })
  if (blockingErrors.length > 0) {
    throw new Error(
      `Ces prévisions ne peuvent pas être enregistrées :\n${blockingErrors.map((a) => `• ${a.message}`).join('\n')}`,
    )
  }

  // UPSERT forecast_days (pas de colonne imported_by).
  const data = rows.map((r) => ({
    date: r.date,
    month: r.month,
    year: r.year,
    occ: r.occ,
    rev_ht: r.revHT,
    rev_ttc: r.revTTC,
    adr_ttc: r.occ > 0 ? r.revTTC / r.occ : 0,
    occ_percent: (r.occ / TOTAL_ROOMS) * 100,
  }))

  const { error } = await admin
    .from('forecast_days')
    .upsert(data, { onConflict: 'date' })
  if (error) {
    console.error('Sauvegarde des prévisions échouée :', error.message)
    throw new Error(
      "Les prévisions n'ont pas pu être enregistrées. Réessaie dans un instant.",
    )
  }

  return rows.length
}
