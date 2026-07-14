/*
 * Récap ménage (facturable ELIOR) — métier + accès Supabase en LECTURE. On
 * compte les LIGNES stockées : les jours clôturés matérialisent une ligne
 * `nettoyee` par chambre vendue facturée (cf. `materializeCleaned`). La
 * facturation suit le statut `nettoyee`. L'agrégation « par jour / par mois » se
 * fait côté client.
 */

import { supabase } from '#/lib/supabase.ts'

/** Décompte des statuts « traités » d'un jour (nettoyée / refus / no-show, hors
 * occupation PDJ). */
export interface DayStatusCounts {
  nettoyee: number
  refus: number
  noshow: number
}

const emptyCounts = (): DayStatusCounts => ({ nettoyee: 0, refus: 0, noshow: 0 })

/**
 * Comptage par jour des statuts nettoyee / refus / noshow sur `[from, to]`.
 * PAGINÉ jusqu'au count exact (un mois plein peut dépasser le plafond de 1000
 * lignes de l'API), en avançant du nombre de lignes réellement renvoyées.
 */
export async function fetchStatusCountsByRange(
  from: string,
  to: string,
): Promise<Map<string, DayStatusCounts>> {
  const byDay = new Map<string, DayStatusCounts>()
  const PAGE = 1000
  let offset = 0
  let expected = Infinity
  while (offset < expected) {
    const { data, error, count } = await supabase
      .from('rapro_rooms')
      .select('report_date, status', { count: 'exact' })
      .in('status', ['nettoyee', 'refus', 'noshow'])
      .gte('report_date', from)
      .lte('report_date', to)
      .order('report_date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (count != null) expected = count
    const rows = (data ?? []) as { report_date: string; status: string }[]
    if (rows.length === 0) break
    for (const r of rows) {
      const c = byDay.get(r.report_date) ?? emptyCounts()
      // Facturable = statut `nettoyee`.
      if (r.status === 'nettoyee') c.nettoyee++
      else if (r.status === 'refus') c.refus++
      else if (r.status === 'noshow') c.noshow++
      byDay.set(r.report_date, c)
    }
    offset += rows.length
  }
  return byDay
}

/** Somme des décomptes d'un ensemble de jours. */
export function sumCounts(byDay: Map<string, DayStatusCounts>): DayStatusCounts {
  const t = emptyCounts()
  for (const c of byDay.values()) {
    t.nettoyee += c.nettoyee
    t.refus += c.refus
    t.noshow += c.noshow
  }
  return t
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

export interface MonthlyRow extends DayStatusCounts {
  /** 'YYYY-MM-DD'. */
  date: string
  /** Jour du mois (1..N). */
  day: number
}

/** Une ligne par jour du mois (trous à 0) + totaux du mois. */
export function monthlyRows(
  year: number,
  month: number,
  byDay: Map<string, DayStatusCounts>,
): { rows: MonthlyRow[]; totals: DayStatusCounts } {
  const days = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const rows: MonthlyRow[] = []
  const totals = emptyCounts()
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    const c = byDay.get(date) ?? emptyCounts()
    totals.nettoyee += c.nettoyee
    totals.refus += c.refus
    totals.noshow += c.noshow
    rows.push({ date, day: d, ...c })
  }
  return { rows, totals }
}
