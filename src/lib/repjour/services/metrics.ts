import { supabase } from '#/lib/supabase.ts'
import type { ComparisonMetricRow } from '#/lib/repjour/parse/metrics.ts'

/*
 * Persistance des métriques brutes du CSV Comparison (table `pms_daily_metrics`,
 * NOUVELLE, propre au back-office — les tables repjour partagées restent
 * intouchées). Aucun fichier n'est stocké : le CSV devient de la donnée.
 *
 * `report_date` est la date des DONNÉES (J-1 du nom de fichier, cf. parse/date.ts),
 * la même que `daily_reports.date` : les deux tables se joignent directement.
 *
 * Écriture réservée aux rôles d'import par la RLS (super_utilisateur / admin).
 */

export const PMS_METRICS_TABLE = 'pms_daily_metrics'

/**
 * Enregistre toutes les lignes d'un Comparison pour une date. Idempotent : un
 * réimport écrase les lignes existantes (clé `report_date, line_no`).
 *
 * L'upsert précède la purge, jamais l'inverse : un échec au milieu laisse la
 * date complète plutôt qu'amputée. La purge ne sert qu'au cas où le PMS
 * livrerait un fichier plus COURT qu'un import précédent — sans elle, les lignes
 * du bas de l'ancien fichier survivraient en fantômes.
 */
export async function upsertDailyMetrics(
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

  const { error } = await supabase
    .from(PMS_METRICS_TABLE)
    .upsert(payload, { onConflict: 'report_date,line_no' })
  if (error) throw error

  const { error: purgeError } = await supabase
    .from(PMS_METRICS_TABLE)
    .delete()
    .eq('report_date', reportDate)
    .gt('line_no', rows.length)
  if (purgeError) throw purgeError
}
