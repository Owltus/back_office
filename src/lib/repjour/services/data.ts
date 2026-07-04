import { supabase } from '#/lib/supabase.ts'
import type { DailyReport, ForecastDay, UserRole } from '#/lib/repjour/types.ts'

/*
 * Vue unifiée jour par jour (rapport réalisé + prévision) d'un mois donné, plus
 * les écritures/suppressions de la gestion des données (étape 8).
 *
 * Étape 5 : la LECTURE (`fetchUnifiedDays`) et son type de ligne.
 * Étape 8 : les écritures (updateReport, updateForecast), les suppressions
 * (deleteReport, deleteDayData, deleteMonthData) et le garde-fou
 * `assertWriteRole`. La vraie protection reste les RLS Supabase ; les triggers
 * BEFORE DELETE journalisent automatiquement dans `audit_log`.
 */

export interface UnifiedDayRow {
  date: string
  month: number
  year: number
  report: DailyReport | null
  forecast: ForecastDay | null
}

/**
 * Génère TOUS les jours du mois demandé, chaque ligne portant le rapport
 * réalisé et/ou la prévision du jour lorsqu'ils existent (sinon `null`).
 */
export async function fetchUnifiedDays(monthFilter: {
  year: number
  month: number
}): Promise<UnifiedDayRow[]> {
  const { year, month } = monthFilter

  const [reportsRes, forecastsRes] = await Promise.all([
    supabase
      .from('daily_reports')
      .select('*')
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('forecast_days')
      .select('*')
      .eq('year', year)
      .eq('month', month),
  ])

  if (reportsRes.error) throw reportsRes.error
  if (forecastsRes.error) throw forecastsRes.error

  const reports = (reportsRes.data ?? []) as DailyReport[]
  const forecasts = (forecastsRes.data ?? []) as ForecastDay[]

  // Indexer par date
  const reportMap = new Map(reports.map((r) => [r.date, r]))
  const forecastMap = new Map(forecasts.map((f) => [f.date, f]))

  // Générer tous les jours du mois
  const daysInMonth = new Date(year, month, 0).getDate()
  const rows: UnifiedDayRow[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(
      day,
    ).padStart(2, '0')}`
    rows.push({
      date: dateStr,
      month,
      year,
      report: reportMap.get(dateStr) ?? null,
      forecast: forecastMap.get(dateStr) ?? null,
    })
  }

  return rows
}

/*
 * ---------------------------------------------------------------------------
 * Écritures & suppressions (étape 8 — gestion des données).
 *
 * Portées à l'identique de la source `services/data.ts`. `assertWriteRole` est
 * un filet de sécurité côté client (le vrai contrôle est la RLS Supabase) et
 * est ré-exporté pour être réutilisé par `services/daily.ts` (garde budget).
 *
 * Différence de forme (cohérence avec les lectures ci-dessus) : les
 * suppressions groupées remontent désormais les erreurs Supabase
 * (`if (error) throw error`) au lieu de les avaler — aucune opération DB
 * supplémentaire n'est introduite.
 * ---------------------------------------------------------------------------
 */

/** Rôles habilités à écrire/supprimer (identique à la source). */
export const WRITE_ROLES: UserRole[] = ['super_utilisateur', 'admin']

/**
 * Lève une erreur si l'utilisateur courant n'a pas un rôle d'écriture.
 * Filet de sécurité ergonomique — la protection réelle est la RLS Supabase.
 */
export async function assertWriteRole(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()
  if (!data || !WRITE_ROLES.includes(data.role as UserRole)) {
    throw new Error('Accès refusé : rôle insuffisant pour cette opération')
  }
}

// ── Édition d'un rapport / d'une prévision ──

export async function updateReport(
  id: number,
  updates: Partial<DailyReport>,
): Promise<void> {
  const { error } = await supabase
    .from('daily_reports')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function updateForecast(
  id: number,
  updates: {
    occ: number
    rev_ht: number
    rev_ttc: number
    adr_ttc: number
    occ_percent: number
  },
): Promise<void> {
  const { error } = await supabase
    .from('forecast_days')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

// ── Suppressions (toutes gardées par assertWriteRole) ──

/** Supprime le rapport réalisé d'une date. */
export async function deleteReport(date: string): Promise<void> {
  await assertWriteRole()
  const { error } = await supabase
    .from('daily_reports')
    .delete()
    .eq('date', date)
  if (error) throw error
}

/** Supprime toutes les données (rapport + prévision) d'une date. */
export async function deleteDayData(date: string): Promise<void> {
  await assertWriteRole()
  const [reportsRes, forecastsRes] = await Promise.all([
    supabase.from('daily_reports').delete().eq('date', date),
    supabase.from('forecast_days').delete().eq('date', date),
  ])
  if (reportsRes.error) throw reportsRes.error
  if (forecastsRes.error) throw forecastsRes.error
}

/** Supprime toutes les données (rapports + prévisions) d'un mois. */
export async function deleteMonthData(
  year: number,
  month: number,
): Promise<void> {
  await assertWriteRole()
  const [reportsRes, forecastsRes] = await Promise.all([
    supabase
      .from('daily_reports')
      .delete()
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('forecast_days')
      .delete()
      .eq('year', year)
      .eq('month', month),
  ])
  if (reportsRes.error) throw reportsRes.error
  if (forecastsRes.error) throw forecastsRes.error
}
