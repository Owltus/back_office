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

/**
 * Nombre de chambres nettoyées par jour sur `[from, to]` (bornes incluses).
 * PAGINÉ : une ligne = une chambre nettoyée, un mois plein peut dépasser 2000
 * lignes (80 chambres × ~31 j), au-delà du plafond « Max rows » de l'API
 * Supabase (1000 par défaut). On boucle jusqu'au `count` exact, en avançant du
 * nombre de lignes réellement renvoyées (robuste même si le plafond est < PAGE).
 */
export async function fetchCleanedByRange(
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const byDay = new Map<string, number>()
  const PAGE = 1000
  let offset = 0
  let expected = Infinity
  while (offset < expected) {
    const { data, error, count } = await supabase
      .from('rapro_rooms')
      .select('report_date', { count: 'exact' })
      .eq('status', 'nettoyee')
      .gte('report_date', from)
      .lte('report_date', to)
      .order('report_date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (count != null) expected = count
    const rows = (data ?? []) as { report_date: string }[]
    if (rows.length === 0) break
    for (const r of rows) {
      byDay.set(r.report_date, (byDay.get(r.report_date) ?? 0) + 1)
    }
    offset += rows.length
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
