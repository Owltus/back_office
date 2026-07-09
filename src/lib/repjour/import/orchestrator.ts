import { supabase } from '#/lib/supabase.ts'
import { TOTAL_ROOMS, MONTHS } from '#/lib/repjour/constants.ts'
import { parseComparison } from '#/lib/repjour/parse/comparison.ts'
import { parseComparisonMetrics } from '#/lib/repjour/parse/metrics.ts'
import { parseForecast, parseForecastAll } from '#/lib/repjour/parse/forecast.ts'
import { extractReportDate } from '#/lib/repjour/parse/date.ts'
import { detectFileType } from '#/lib/repjour/parse/detect.ts'
import { upsertDailyMetrics } from '#/lib/repjour/services/metrics.ts'
import {
  computeRealiseJour,
  computeRealiseMTD,
  computeProjeteMois,
} from '#/lib/repjour/calc/kpi.ts'
import { computeEcart } from '#/lib/repjour/calc/ecart.ts'
import {
  validateCoherence,
  validateForecast,
} from '#/lib/repjour/calc/validate.ts'
import type {
  Alert,
  ForecastDay,
  KPIBlock,
  MonthBudget,
  Ecart,
  ReportDate,
} from '#/lib/repjour/types.ts'

export interface ImportResult {
  success: boolean
  reportDate: ReportDate
  realiseJour: KPIBlock
  realiseMTD: KPIBlock
  projeteMois: KPIBlock
  budget: MonthBudget
  ecart: Ecart
  alerts: Alert[]
  error?: string
}

export interface PreValidationResult {
  errors: Alert[]
  warnings: Alert[]
}

/**
 * Pré-valide un fichier Forecast SANS écrire en base.
 * Compare avec les données existantes pour détecter les anomalies TTC/HT.
 */
export async function preValidateForecast(
  forecastFile: File,
): Promise<PreValidationResult> {
  const text = await forecastFile.text()
  const allRows = parseForecastAll(text)

  if (allRows.length === 0) {
    return {
      errors: [
        { type: 'error', message: 'Aucune donnée forecast dans le fichier' },
      ],
      warnings: [],
    }
  }

  // Grouper par {year, month}
  const monthGroups = new Map<string, typeof allRows>()
  for (const row of allRows) {
    const key = `${row.year}-${row.month}`
    if (!monthGroups.has(key)) monthGroups.set(key, [])
    monthGroups.get(key)!.push(row)
  }

  // Fetch données existantes et budgets pour les années concernées
  const years = [...new Set(allRows.map((r) => r.year))]

  const [{ data: existingAll }, { data: budgetsAll }] = await Promise.all([
    supabase.from('forecast_days').select('*').in('year', years),
    supabase.from('budget').select('*').in('year', years),
  ])

  // Indexer par {year, month}
  const existingMap = new Map<string, ForecastDay[]>()
  for (const day of (existingAll || []) as ForecastDay[]) {
    const key = `${day.year}-${day.month}`
    if (!existingMap.has(key)) existingMap.set(key, [])
    existingMap.get(key)!.push(day)
  }

  const budgetMap = new Map<string, MonthBudget>()
  for (const b of (budgetsAll || []) as MonthBudget[]) {
    budgetMap.set(`${b.year}-${b.month}`, b)
  }

  const multiMonth = monthGroups.size > 1
  const allAlerts: Alert[] = []

  for (const [key, rows] of monthGroups) {
    const [yearStr, monthStr] = key.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)
    const daysInMonth = new Date(year, month, 0).getDate()
    const existing = existingMap.get(key) || null
    const budget = budgetMap.get(key) || null

    const monthAlerts = validateForecast(rows, budget, daysInMonth, existing)

    // Préfixer avec le mois si multi-mois
    if (multiMonth) {
      const prefix = `[${MONTHS[month]} ${year}]`
      for (const alert of monthAlerts) {
        allAlerts.push({ type: alert.type, message: `${prefix} ${alert.message}` })
      }
    } else {
      allAlerts.push(...monthAlerts)
    }
  }

  return {
    errors: allAlerts.filter((a) => a.type === 'error'),
    warnings: allAlerts.filter((a) => a.type === 'warning'),
  }
}

/**
 * Convertit tout le CSV Comparison en lignes de `pms_daily_metrics` (aucun
 * fichier stocké). Volontairement NON BLOQUANT : l'import du rapport journalier
 * reste la fonction critique et doit aboutir même si la table n'est pas encore
 * déployée. L'échec remonte en alerte visible — pas en silence, contrairement à
 * l'archivage Storage historique dont le bucket n'a jamais existé.
 */
async function saveComparisonMetrics(
  comparisonText: string,
  dateStr: string,
  alerts: Alert[],
): Promise<void> {
  try {
    await upsertDailyMetrics(dateStr, parseComparisonMetrics(comparisonText))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    alerts.push({
      type: 'warning',
      message: `Métriques PMS non enregistrées (non bloquant) : ${reason}`,
    })
  }
}

export async function processComparisonOnly(
  comparisonFile: File,
  userId: string,
): Promise<ImportResult> {
  const comparisonText = await comparisonFile.text()
  const reportDate = extractReportDate(comparisonFile.name)
  const comparison = parseComparison(comparisonText)

  const alerts: Alert[] = []

  const realiseJour = computeRealiseJour(comparison)
  const realiseMTD = computeRealiseMTD(comparison, reportDate.dayOfMonth)

  // Pas de forecast → projeté à zéro
  const projeteMois: KPIBlock = {
    nuitees: 0,
    to: 0,
    pm: 0,
    revpar: 0,
    roomRevenue: 0,
  }

  // Fetch budget
  const { data: budget, error: budgetError } = await supabase
    .from('budget')
    .select('*')
    .eq('year', reportDate.year)
    .eq('month', reportDate.month)
    .single()

  if (budgetError || !budget) {
    throw new Error(
      `Budget introuvable pour ${reportDate.month}/${reportDate.year}`,
    )
  }

  // Essayer de récupérer le projeté depuis un import forecast existant
  const { data: existingForecasts } = await supabase
    .from('forecast_days')
    .select('*')
    .eq('year', reportDate.year)
    .eq('month', reportDate.month)

  let finalProjeteMois = projeteMois
  if (existingForecasts && existingForecasts.length > 0) {
    const totalOCC = existingForecasts.reduce(
      (s: number, f: { occ: number }) => s + f.occ,
      0,
    )
    const totalRevTTC = existingForecasts.reduce(
      (s: number, f: { rev_ttc: number }) => s + f.rev_ttc,
      0,
    )
    finalProjeteMois = {
      nuitees: totalOCC,
      roomRevenue: totalRevTTC,
      to: (totalOCC / (TOTAL_ROOMS * reportDate.daysInMonth)) * 100,
      pm: totalOCC > 0 ? totalRevTTC / totalOCC : 0,
      revpar: totalRevTTC / (TOTAL_ROOMS * reportDate.daysInMonth),
    }
  } else {
    alerts.push({
      type: 'warning',
      message: 'Pas de Forecast importé — projeté mois non disponible',
    })
  }

  const ecart = computeEcart(finalProjeteMois, budget)
  const coherenceAlerts = validateCoherence(realiseJour)
  alerts.push(...coherenceAlerts)

  const dateStr = `${reportDate.year}-${String(reportDate.month).padStart(2, '0')}-${String(reportDate.dayOfMonth).padStart(2, '0')}`

  // Avant l'upsert du rapport : une alerte éventuelle est ainsi persistée avec lui.
  await saveComparisonMetrics(comparisonText, dateStr, alerts)

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
    pm_nuitees: finalProjeteMois.nuitees,
    pm_to: finalProjeteMois.to,
    pm_pm: finalProjeteMois.pm,
    pm_revpar: finalProjeteMois.revpar,
    pm_room_revenue: finalProjeteMois.roomRevenue,
    imported_by: userId,
    alerts,
  }

  const { error: upsertError } = await supabase
    .from('daily_reports')
    .upsert(reportData, { onConflict: 'date' })

  if (upsertError)
    throw new Error(`Erreur sauvegarde rapport : ${upsertError.message}`)

  try {
    await supabase.storage
      .from('csv-archive')
      .upload(`${dateStr}/comparison.csv`, comparisonFile, { upsert: true })
  } catch {
    alerts.push({
      type: 'warning',
      message: 'Erreur archivage CSV (non bloquant)',
    })
  }

  return {
    success: true,
    reportDate,
    realiseJour,
    realiseMTD,
    projeteMois: finalProjeteMois,
    budget,
    ecart,
    alerts,
  }
}

export async function processImport(
  file1: File,
  file2: File,
  userId: string,
): Promise<ImportResult> {
  // Lire les contenus
  const text1 = await file1.text()
  const text2 = await file2.text()

  // Détecter les types
  const type1 = detectFileType(file1.name, text1)
  const type2 = detectFileType(file2.name, text2)

  let comparisonText: string
  let comparisonFilename: string
  let forecastText: string

  if (type1 === 'comparison' && type2 === 'forecast') {
    comparisonText = text1
    comparisonFilename = file1.name
    forecastText = text2
  } else if (type1 === 'forecast' && type2 === 'comparison') {
    comparisonText = text2
    comparisonFilename = file2.name
    forecastText = text1
  } else {
    throw new Error(
      'Impossible de détecter les types de fichiers. ' +
        'Un fichier Comparison By Date et un Forecast By Date Range sont requis.',
    )
  }

  // Extraire la date du rapport
  const reportDate = extractReportDate(comparisonFilename)

  // Parser les CSV
  const comparison = parseComparison(comparisonText)
  const forecastRows = parseForecast(
    forecastText,
    reportDate.month,
    reportDate.year,
  )

  const alerts: Alert[] = []

  // Calculer les KPI
  const realiseJour = computeRealiseJour(comparison)
  const realiseMTD = computeRealiseMTD(comparison, reportDate.dayOfMonth)
  const projeteMois = computeProjeteMois(forecastRows, reportDate.daysInMonth)

  // Fetch budget
  const { data: budget, error: budgetError } = await supabase
    .from('budget')
    .select('*')
    .eq('year', reportDate.year)
    .eq('month', reportDate.month)
    .single()

  if (budgetError || !budget) {
    throw new Error(
      `Budget introuvable pour ${reportDate.month}/${reportDate.year}`,
    )
  }

  // Écart
  const ecart = computeEcart(projeteMois, budget)

  // Contrôles de cohérence — réalisé
  const coherenceAlerts = validateCoherence(realiseJour)
  alerts.push(...coherenceAlerts)

  // Contrôles de cohérence — forecast
  const forecastAlerts = validateForecast(
    forecastRows,
    budget,
    reportDate.daysInMonth,
  )
  const blockingErrors = forecastAlerts.filter((a) => a.type === 'error')
  if (blockingErrors.length > 0) {
    throw new Error(
      `Données forecast invalides :\n${blockingErrors.map((a) => `• ${a.message}`).join('\n')}`,
    )
  }
  alerts.push(...forecastAlerts)

  // Formater la date en YYYY-MM-DD
  const dateStr = `${reportDate.year}-${String(reportDate.month).padStart(2, '0')}-${String(reportDate.dayOfMonth).padStart(2, '0')}`

  // Avant l'upsert du rapport : une alerte éventuelle est ainsi persistée avec lui.
  await saveComparisonMetrics(comparisonText, dateStr, alerts)

  // UPSERT daily_report
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
    imported_by: userId,
    alerts,
  }

  const { error: upsertError } = await supabase
    .from('daily_reports')
    .upsert(reportData, { onConflict: 'date' })

  if (upsertError)
    throw new Error(`Erreur sauvegarde rapport : ${upsertError.message}`)

  // UPSERT forecast_days
  const forecastData = forecastRows.map((r) => ({
    date: r.date,
    month: r.month,
    year: r.year,
    occ: r.occ,
    rev_ht: r.revHT,
    rev_ttc: r.revTTC,
    adr_ttc: r.occ > 0 ? r.revTTC / r.occ : 0,
    occ_percent: (r.occ / TOTAL_ROOMS) * 100,
  }))

  if (forecastData.length > 0) {
    const { error: forecastError } = await supabase
      .from('forecast_days')
      .upsert(forecastData, { onConflict: 'date' })

    if (forecastError) {
      alerts.push({
        type: 'warning',
        message: `Erreur sauvegarde forecast : ${forecastError.message}`,
      })
    }
  }

  // Archiver les CSV
  try {
    const compFile = type1 === 'comparison' ? file1 : file2
    const foreFile = type1 === 'forecast' ? file1 : file2
    await supabase.storage
      .from('csv-archive')
      .upload(`${dateStr}/comparison.csv`, compFile, { upsert: true })
    await supabase.storage
      .from('csv-archive')
      .upload(`${dateStr}/forecast.csv`, foreFile, { upsert: true })
  } catch {
    alerts.push({
      type: 'warning',
      message: 'Erreur archivage CSV (non bloquant)',
    })
  }

  return {
    success: true,
    reportDate,
    realiseJour,
    realiseMTD,
    projeteMois,
    budget,
    ecart,
    alerts,
  }
}
