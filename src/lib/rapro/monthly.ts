/*
 * Récap mensuel des chambres NETTOYÉES (facturable ELIOR) — métier + accès
 * Supabase en LECTURE. Les nettoyées sont stockées dans rapro_rooms
 * (`status='nettoyee'`) → une requête par plage de dates suffit (rapro_rooms n'a
 * que `report_date`, d'où le filtre `.gte/.lte`, pas `.eq('year'/'month')`).
 * L'agrégation « chaque jour du mois + trous à 0 » se fait côté client.
 */

import { supabase } from '#/lib/supabase.ts'

export interface MonthlyRow {
  /** 'YYYY-MM-DD'. */
  date: string
  /** Jour du mois (1..N). */
  day: number
  /** Nombre de chambres nettoyées ce jour (facturable). */
  cleaned: number
}

/** Nombre de chambres nettoyées par jour sur `[from, to]` (bornes incluses). */
export async function fetchCleanedByRange(
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('rapro_rooms')
    .select('report_date')
    .eq('status', 'nettoyee')
    .gte('report_date', from)
    .lte('report_date', to)
  if (error) throw error
  const byDay = new Map<string, number>()
  for (const r of (data ?? []) as { report_date: string }[]) {
    byDay.set(r.report_date, (byDay.get(r.report_date) ?? 0) + 1)
  }
  return byDay
}

/** Premier et dernier jour du mois, en 'YYYY-MM-DD'. */
export function monthBounds(
  year: number,
  month: number,
): { from: string; to: string } {
  const days = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(days).padStart(2, '0')}`,
  }
}

/** Une ligne par jour du mois (trous à 0) + total du mois. */
export function monthlyRows(
  year: number,
  month: number,
  byDay: Map<string, number>,
): { rows: MonthlyRow[]; total: number } {
  const days = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const rows: MonthlyRow[] = []
  let total = 0
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    const cleaned = byDay.get(date) ?? 0
    total += cleaned
    rows.push({ date, day: d, cleaned })
  }
  return { rows, total }
}
