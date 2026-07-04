import { supabase } from '#/lib/supabase.ts'
import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import { assertWriteRole } from '#/lib/repjour/services/data.ts'
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

export async function fetchAvailableDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('date')
    .order('date', { ascending: false })
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
