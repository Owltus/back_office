import { supabase } from '#/lib/supabase.ts'
import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import { assertWriteRole } from '#/lib/repjour/services/data.ts'
import type { UnifiedDayRow } from '#/lib/repjour/services/data.ts'
import type { DailyReport, MonthBudget } from '#/lib/repjour/types.ts'

/*
 * Services du rapport journalier (Supabase partagé) — lecture + écritures budget.
 *
 * Étapes 5 et 6 : les fonctions de lecture (select) — le dashboard (étape 5) et
 * l'analytique annuelle (étape 6 : fetchYearAnalytics / fetchYearBudget /
 * fetchBudgetYears).
 * Étape 8 : les écritures budget (upsertBudget, deleteYearBudget). La garde
 * `assertWriteRole` est réutilisée depuis `services/data.ts` (source unique).
 *
 * Différence avec la source standalone : la source avalait les erreurs
 * silencieusement (`const { data } = await …`). Ici on remonte les erreurs
 * réelles (`if (error) throw error`) pour qu'elles soient visibles, tout en
 * restant tolérant à l'absence de ligne (`maybeSingle`).
 */

export async function fetchLatestReport(): Promise<DailyReport | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Masque le bandeau « pas encore envoyé » d'un rapport (décision PARTAGÉE, en base).
 * Passe par la RPC `dismiss_send_reminder` (SECURITY DEFINER, gardée niveau écriture
 * sur repjour — admins inclus). Ne touche PAS `auto_sent_at` : l'envoi reste possible.
 */
export async function dismissSendReminder(date: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_send_reminder', { p_date: date })
  if (error) throw error
}

export async function fetchReportByDate(
  date: string,
): Promise<DailyReport | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Dates ayant un rapport, de la plus récente à la plus ancienne. Sert à griser
 *  les jours sans données dans les calendriers.
 *
 *  ⚠ Le `.limit()` n'est pas une optimisation, c'est un garde-fou de lisibilité
 *  (audit du 2026-09-20). Sans lui, PostgREST tronque SILENCIEUSEMENT à sa
 *  limite par défaut de 1 000 lignes : le calendrier se mettrait à griser des
 *  dates qui existent, sans la moindre erreur. `daily_reports` compte 170
 *  lignes aujourd'hui, le plafond est donc loin — mais il est explicite, et
 *  quiconque l'atteindra saura quoi chercher. À ce moment-là, la bonne réponse
 *  sera de borner la lecture à la période consultée, pas de relever le plafond. */
const AVAILABLE_DATES_MAX = 5_000

export async function fetchAvailableDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('date')
    .order('date', { ascending: false })
    .limit(AVAILABLE_DATES_MAX)
  if (error) throw error
  return data?.map((d: { date: string }) => d.date) ?? []
}

export async function fetchMonthReports(
  year: number,
  month: number,
): Promise<DailyReport[]> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .order('day_of_month', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchBudget(
  year: number,
  month: number,
): Promise<MonthBudget | null> {
  // La source utilisait `.single()`, qui lève une erreur (406) quand aucun
  // budget n'est défini pour le mois. On passe à `.maybeSingle()` : un mois
  // sans budget renvoie simplement `null` sans erreur, ce que le dashboard
  // gère déjà (état partiel / vide).
  const { data, error } = await supabase
    .from('budget')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Total des prévisions d'un mois (occupation, CA TTC), ou `null` si aucune. */
export async function fetchForecastMonthTotal(
  year: number,
  month: number,
): Promise<{ occ: number; revTTC: number } | null> {
  const { data, error } = await supabase
    .from('forecast_days')
    .select('occ, rev_ttc')
    .eq('year', year)
    .eq('month', month)
  if (error) throw error
  if (!data || data.length === 0) return null
  return {
    occ: data.reduce((s: number, f: { occ: number }) => s + f.occ, 0),
    revTTC: data.reduce(
      (s: number, f: { rev_ttc: number }) => s + f.rev_ttc,
      0,
    ),
  }
}

/**
 * Dernier `imported_at` des `forecast_days` d'un mois, ou `null` si aucun n'a
 * encore été importé. Sert au bandeau « fichiers PMS manquants » (pmsStatus.ts)
 * pour juger si le Forecast du cycle courant est arrivé — même lecture que la
 * garde de fraîcheur côté auto-envoi (supabase/functions/import-report/autoSend.ts).
 */
export async function fetchForecastFreshness(
  year: number,
  month: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('forecast_days')
    .select('imported_at')
    .eq('year', year)
    .eq('month', month)
    .not('imported_at', 'is', null)
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.imported_at ?? null
}

/**
 * Dernier rapport importé ANTÉRIEUR à `date`, dans le MÊME mois. Sert à la carte
 * « Pris depuis la veille » : on y soustrait le projeté fin de mois d'un jour à
 * l'autre. La contrainte « même mois » est essentielle — le projeté est un total
 * MENSUEL, donc comparer au 30 du mois précédent soustrairait deux mois
 * différents (résultat aberrant). Au 1er du mois, renvoie donc `null` (rien à
 * comparer). En cas de trou dans la série (jour sans rapport), on remonte au
 * dernier rapport réellement présent au lieu de masquer la carte.
 */
export async function fetchPreviousReportInMonth(
  date: string,
  year: number,
  month: number,
): Promise<DailyReport | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Dernier rapport importé d'un mois. Sert de repli au dashboard : quand le jour
 * affiché n'a pas de rapport, on montre tout de même le MTD du mois en cours.
 */
export async function fetchLatestReportOfMonth(
  year: number,
  month: number,
): Promise<DailyReport | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .order('day_of_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Tout le tableau de bord d'un jour, en UN SEUL aller-retour.
 *
 * POURQUOI — mesure du 2026-09-22 puis du 2026-09-23. Les huit lectures
 * ci-dessus partaient ensemble et revenaient ensemble à 6 461 ms, le rapport du
 * jour compris, alors qu'il ne dépend que de lui-même. Ce n'est ni le volume
 * (11,6 Mo de base, 187 lignes dans `daily_reports`) ni la vitesse du SQL :
 * c'est le NOMBRE d'allers-retours. Un aller-retour coûte ~170 ms à chaud et
 * jusqu'à 1,37 s à froid ; huit coûtent donc entre 1,4 s et 11 s de latence
 * pure, pour **13,8 ms de calcul réel** côté base (réponse : 17 ko).
 *
 * Les huit fonctions qu'elle remplace restent EXPORTÉES et fonctionnelles :
 * l'import et l'analytique s'en servent encore, et elles constituent le chemin
 * de repli si la RPC devait être retirée (`drop function`, cf. le script).
 *
 * ⚠ La RPC est `security invoker` : les RLS de `daily_reports`, `budget` et
 * `forecast_days` s'appliquent à l'appelant EXACTEMENT comme avant. Elle ne
 * peut rien montrer que le compte ne pouvait déjà lire une requête à la fois.
 * Autorité : `supabase/repjour_dashboard_rpc_2026-09-23.sql`, équivalence
 * prouvée champ par champ sur 189 dates (0 écart).
 */
export interface RepjourDashboard {
  rapport: DailyReport | null
  budget: MonthBudget | null
  forecastTotal: { occ: number; revTTC: number } | null
  forecastFraicheur: string | null
  dernierDuMois: DailyReport | null
  rapportPrecedent: DailyReport | null
  rapportsDuMois: DailyReport[]
  datesDisponibles: string[]
}

export async function fetchRepjourDashboard(
  date: string,
): Promise<RepjourDashboard> {
  const { data, error } = await supabase.rpc('repjour_dashboard', {
    p_date: date,
  })
  if (error) throw error
  /*
   * `rapportsDuMois` et `datesDisponibles` sont garantis non nuls côté SQL
   * (`coalesce(..., '[]')`) ; les replis ici ne servent qu'au cas où la RPC
   * serait absente et la réponse vide — mieux vaut un tableau vide qu'un
   * plantage de rendu.
   */
  const d = (data ?? {}) as Partial<RepjourDashboard>
  return {
    rapport: d.rapport ?? null,
    budget: d.budget ?? null,
    forecastTotal: d.forecastTotal ?? null,
    forecastFraicheur: d.forecastFraicheur ?? null,
    dernierDuMois: d.dernierDuMois ?? null,
    rapportPrecedent: d.rapportPrecedent ?? null,
    rapportsDuMois: d.rapportsDuMois ?? [],
    datesDisponibles: d.datesDisponibles ?? [],
  }
}

/*
 * ---------------------------------------------------------------------------
 * Analytique annuelle (étape 6) — LECTURE seule.
 *
 * Portées de la source `services/daily.ts` (fetchYearAnalytics /
 * fetchYearBudget / fetchBudgetYears). La source avalait les erreurs ; ici on
 * les remonte (`if (error) throw error`). Aucune écriture.
 * ---------------------------------------------------------------------------
 */

/** Résultat agrégé d'un mois pour la vue analytique annuelle. */
export interface MonthAnalytics {
  month: number
  nuitees: number
  to: number
  pm: number
  revpar: number
  revenue: number
  daysWithData: number
  source: 'realise' | 'projete' | 'forecast' | 'vide'
  hasOvercapacity: boolean
}

/** Colonnes lues sur `daily_reports` pour l'agrégation mensuelle. */
interface AnalyticsReportRow {
  month: number
  day_of_month: number
  days_in_month: number
  rj_nuitees: number
  pm_nuitees: number
  pm_to: number
  pm_pm: number
  pm_revpar: number
  pm_room_revenue: number
  rmtd_nuitees: number
  rmtd_room_revenue: number
}

/** Colonnes lues sur `forecast_days` pour l'agrégation mensuelle. */
interface AnalyticsForecastRow {
  month: number
  occ: number
  rev_ttc: number
}

/** Années disponibles dans la table budget (pour le sélecteur d'année). */
export async function fetchBudgetYears(): Promise<number[]> {
  const { data, error } = await supabase
    .from('budget')
    .select('year')
    .order('year', { ascending: true })
  if (error) throw error
  if (!data) return []
  return [...new Set(data.map((d: { year: number }) => d.year))]
}

/** Budget de tous les mois d'une année, trié par mois. */
export async function fetchYearBudget(year: number): Promise<MonthBudget[]> {
  const { data, error } = await supabase
    .from('budget')
    .select('*')
    .eq('year', year)
    .order('month', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Agrège `daily_reports` + `forecast_days` d'une année en une ligne par mois.
 *
 * Priorité de la source par mois :
 *   1. rapports présents et mois complet (day_of_month === days_in_month)
 *      → `realise` (RMTD, réalisé mois entier) ;
 *   2. rapports présents mais mois incomplet → `projete` (PM, projeté fin de
 *      mois du dernier rapport) ;
 *   3. pas de rapport mais forecast présent → `forecast` (somme des prévisions) ;
 *   4. sinon → `vide`.
 */
export async function fetchYearAnalytics(
  year: number,
): Promise<MonthAnalytics[]> {
  const [reportsRes, forecastsRes] = await Promise.all([
    supabase
      .from('daily_reports')
      .select(
        'month, day_of_month, days_in_month, rj_nuitees, pm_nuitees, pm_to, pm_pm, pm_revpar, pm_room_revenue, rmtd_nuitees, rmtd_room_revenue',
      )
      .eq('year', year)
      .order('day_of_month', { ascending: false }),
    supabase
      .from('forecast_days')
      .select('month, occ, rev_ttc')
      .eq('year', year),
  ])

  if (reportsRes.error) throw reportsRes.error
  if (forecastsRes.error) throw forecastsRes.error

  const reports = (reportsRes.data ?? []) as AnalyticsReportRow[]
  const forecasts = (forecastsRes.data ?? []) as AnalyticsForecastRow[]

  // Rapports : dernier jour importé par mois (data triée jour décroissant) +
  // comptage des jours + détection de surcapacité.
  const lastDayByMonth = new Map<number, AnalyticsReportRow>()
  const countByMonth = new Map<number, number>()
  const overcapByMonth = new Set<number>()
  for (const r of reports) {
    countByMonth.set(r.month, (countByMonth.get(r.month) ?? 0) + 1)
    if (!lastDayByMonth.has(r.month)) lastDayByMonth.set(r.month, r)
    if (r.rj_nuitees > TOTAL_ROOMS) overcapByMonth.add(r.month)
  }

  // Forecasts : agrégation par mois + détection de surcapacité.
  const forecastByMonth = new Map<
    number,
    { totalOcc: number; totalRev: number; count: number }
  >()
  for (const f of forecasts) {
    const existing = forecastByMonth.get(f.month) ?? {
      totalOcc: 0,
      totalRev: 0,
      count: 0,
    }
    existing.totalOcc += f.occ
    existing.totalRev += f.rev_ttc
    existing.count += 1
    forecastByMonth.set(f.month, existing)
    if (f.occ > TOTAL_ROOMS) overcapByMonth.add(f.month)
  }

  const result: MonthAnalytics[] = []
  for (let month = 1; month <= 12; month++) {
    const last = lastDayByMonth.get(month)
    const count = countByMonth.get(month) ?? 0
    const fc = forecastByMonth.get(month)
    const daysInMonth = last?.days_in_month ?? new Date(year, month, 0).getDate()

    if (last && count > 0) {
      // On a des rapports → réalisé (mois complet) ou projeté (mois en cours).
      const isComplete = last.day_of_month === last.days_in_month
      if (isComplete) {
        const nuitees = last.rmtd_nuitees
        const revenue = last.rmtd_room_revenue
        result.push({
          month,
          nuitees,
          revenue,
          to: (nuitees / (TOTAL_ROOMS * daysInMonth)) * 100,
          pm: nuitees > 0 ? revenue / nuitees : 0,
          revpar: revenue / (TOTAL_ROOMS * daysInMonth),
          daysWithData: count,
          source: 'realise',
          hasOvercapacity: overcapByMonth.has(month),
        })
      } else {
        result.push({
          month,
          nuitees: last.pm_nuitees,
          to: last.pm_to,
          pm: last.pm_pm,
          revpar: last.pm_revpar,
          revenue: last.pm_room_revenue,
          daysWithData: count,
          source: 'projete',
          hasOvercapacity: overcapByMonth.has(month),
        })
      }
    } else if (fc && fc.count > 0) {
      // Pas de rapport mais du forecast → prévisions.
      const nuitees = fc.totalOcc
      const revenue = fc.totalRev
      result.push({
        month,
        nuitees,
        revenue,
        to: (nuitees / (TOTAL_ROOMS * daysInMonth)) * 100,
        pm: nuitees > 0 ? revenue / nuitees : 0,
        revpar: revenue / (TOTAL_ROOMS * daysInMonth),
        daysWithData: fc.count,
        source: 'forecast',
        hasOvercapacity: overcapByMonth.has(month),
      })
    } else {
      result.push({
        month,
        nuitees: 0,
        to: 0,
        pm: 0,
        revpar: 0,
        revenue: 0,
        daysWithData: 0,
        source: 'vide',
        hasOvercapacity: false,
      })
    }
  }

  return result
}

/**
 * Analytique ANNUELLE en un seul aller-retour.
 *
 * POURQUOI — relevé du 2026-09-23, préchauffage actif : la page faisait QUATRE
 * lectures en DEUX vagues (les années conditionnaient l'année affichée, qui
 * conditionnait les données), pour des données prêtes à 2 051 / 1 719 ms. Ce
 * n'est ni le volume (187 lignes dans `daily_reports`) ni la vitesse du SQL,
 * mais le NOMBRE d'allers-retours — ~170 ms pièce à chaud, jusqu'à 1,37 s à
 * froid. Renvoyer les années DANS la réponse supprime la cascade d'un coup.
 *
 * ⚠ LA RPC NE CALCULE AUCUN INDICATEUR. Elle décide de la SOURCE et livre les
 * valeurs brutes ; `to`, `pm` et `revpar` sont calculés ICI, par les formules
 * d'origine, inchangées.
 *
 * Ce n'est pas un détail de style. Une première version calculait en SQL :
 * confrontation au TypeScript réel, 12 mois × 9 champs, **31 écarts** de
 * l'ordre de 1e-13 — `jsonb` n'a pas de type flottant, il range les nombres en
 * `numeric`, et un `double precision` y perd ses derniers bits. Invisibles à
 * l'écran, mais ils interdisaient de PROUVER l'équivalence. Garder
 * l'arithmétique ici supprime le problème, et laisse `TOTAL_ROOMS` à un seul
 * endroit.
 *
 * ÉQUIVALENCE PROUVÉE avant bascule (2026-09-23, année 2026, seule en base) :
 * 108 champs confrontés un à un à `fetchYearAnalytics`. **6 écarts résiduels**,
 * tous sur des mois en prévision, écart absolu maximal **1,46e-11**, relatif
 * **1,93e-16** — soit l'epsilon du flottant 64 bits. Les six sont IDENTIQUES à
 * l'affichage (euros, une décimale, deux décimales). Et ils vont dans le bon
 * sens : l'ancien chemin sommait les recettes en flottant JavaScript et
 * accumulait l'erreur, la RPC les somme en `numeric` exact. Reproduire cet
 * écart aurait été enshriner un bug pour atteindre un zéro cosmétique.
 *
 * Autorité : `supabase/repjour_analytique_rpc_2026-09-23.sql`.
 * `fetchBudgetYears`, `fetchYearAnalytics` et `fetchYearBudget` restent
 * EXPORTÉES : `BudgetContent.tsx` les appelle hors react-query, et elles sont
 * le chemin de repli si la RPC était retirée.
 */
export interface RepjourAnalytiqueAnnuelle {
  annees: number[]
  budgets: MonthBudget[]
  mois: MonthAnalytics[]
}

/** Ligne brute rendue par la RPC, avant application des formules. */
interface MoisBrut {
  month: number
  source: MonthAnalytics['source']
  nuitees: number
  revenue: number
  joursDuMois: number
  daysWithData: number
  hasOvercapacity: boolean
  pmTo?: number
  pmPm?: number
  pmRevpar?: number
}

/** Applique les formules d'origine. Copie stricte de `fetchYearAnalytics`. */
function moisDepuisBrut(b: MoisBrut): MonthAnalytics {
  const capacite = TOTAL_ROOMS * b.joursDuMois
  if (b.source === 'projete') {
    // Les champs `pm_*` sont REPRIS TELS QUELS, sans aucun recalcul.
    return {
      month: b.month,
      nuitees: b.nuitees,
      to: b.pmTo ?? 0,
      pm: b.pmPm ?? 0,
      revpar: b.pmRevpar ?? 0,
      revenue: b.revenue,
      daysWithData: b.daysWithData,
      source: 'projete',
      hasOvercapacity: b.hasOvercapacity,
    }
  }
  if (b.source === 'vide') {
    return {
      month: b.month,
      nuitees: 0,
      to: 0,
      pm: 0,
      revpar: 0,
      revenue: 0,
      daysWithData: 0,
      source: 'vide',
      hasOvercapacity: false,
    }
  }
  // `realise` et `forecast` partagent les mêmes formules.
  return {
    month: b.month,
    nuitees: b.nuitees,
    revenue: b.revenue,
    to: (b.nuitees / capacite) * 100,
    // 0 et NON null quand il n'y a aucune nuitée — comportement d'origine.
    pm: b.nuitees > 0 ? b.revenue / b.nuitees : 0,
    revpar: b.revenue / capacite,
    daysWithData: b.daysWithData,
    source: b.source,
    hasOvercapacity: b.hasOvercapacity,
  }
}

export async function fetchRepjourAnalytiqueAnnuelle(
  annee: number,
): Promise<RepjourAnalytiqueAnnuelle> {
  const { data, error } = await supabase.rpc('repjour_analytique_annuelle', {
    p_annee: annee,
  })
  if (error) throw error
  const d = (data ?? {}) as {
    annees?: number[]
    budgets?: MonthBudget[]
    mois?: MoisBrut[]
  }
  return {
    annees: d.annees ?? [],
    budgets: d.budgets ?? [],
    mois: (d.mois ?? []).map(moisDepuisBrut),
  }
}

/**
 * Analytique MENSUELLE en un seul aller-retour.
 *
 * Remplace `fetchUnifiedDays` (deux `select('*')` de ~30 colonnes pour huit
 * champs affichés), `fetchBudget` et `fetchAvailableDates`.
 *
 * ⚠ `premiereDate` remplace à elle seule `fetchAvailableDates`, qui rapatriait
 * jusqu'à 5 000 dates pour n'en exploiter QU'UNE : la plus ancienne, qui borne
 * le chevron « précédent ». `null` quand la table est vide — le composant
 * distingue ce cas de « requête en vol ».
 *
 * ⚠ `jours` contient TOUS les jours du mois (28 à 31), `report` et `forecast` à
 * `null` quand absents. C'est ce qui garantit que
 * `budget.room_revenue / rows.length` ne divise jamais par zéro.
 *
 * Autorité : `supabase/repjour_analytique_rpc_2026-09-23.sql`.
 * `fetchUnifiedDays` reste EXPORTÉE (`DataContent.tsx` l'appelle hors
 * react-query) et sert de chemin de repli.
 */
export interface RepjourAnalytiqueMensuelle {
  jours: UnifiedDayRow[]
  budget: MonthBudget | null
  premiereDate: string | null
}

export async function fetchRepjourAnalytiqueMensuelle(
  annee: number,
  mois: number,
): Promise<RepjourAnalytiqueMensuelle> {
  const { data, error } = await supabase.rpc('repjour_analytique_mensuelle', {
    p_annee: annee,
    p_mois: mois,
  })
  if (error) throw error
  const d = (data ?? {}) as Partial<RepjourAnalytiqueMensuelle>
  return {
    jours: d.jours ?? [],
    budget: d.budget ?? null,
    premiereDate: d.premiereDate ?? null,
  }
}

/*
 * ---------------------------------------------------------------------------
 * Écritures budget (étape 8 — gestion). Portées de la source `services/daily.ts`.
 *
 * `deleteYearBudget` reçoit une garde `assertWriteRole` ABSENTE de la source
 * (correction D17) : la suppression d'un budget annuel est désormais barrée
 * côté client comme les autres suppressions, en plus de la RLS Supabase. Les
 * triggers BEFORE DELETE journalisent dans `audit_log` automatiquement.
 * ---------------------------------------------------------------------------
 */

/** Upsert du budget mensuel — idempotent sur la clé (year, month). */
export async function upsertBudget(
  budget: Omit<MonthBudget, 'id'>[],
): Promise<void> {
  const { error } = await supabase
    .from('budget')
    .upsert(budget, { onConflict: 'year,month' })
  if (error) throw error
}

/** Supprime tout le budget d'une année — gardé par `assertWriteRole` (D17). */
export async function deleteYearBudget(year: number): Promise<void> {
  await assertWriteRole()
  const { error } = await supabase.from('budget').delete().eq('year', year)
  if (error) throw error
}
