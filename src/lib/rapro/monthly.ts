/*
 * Récap ménage (facturable ELIOR) — métier + accès Supabase en LECTURE. On
 * compte les LIGNES stockées : les jours clôturés matérialisent une ligne
 * `nettoyee` par chambre vendue facturée (cf. `materializeCleaned`). La
 * facturation suit le statut `nettoyee`. L'agrégation « par jour / par mois » se
 * fait côté client.
 *
 * SEULS LES JOURS CLÔTURÉS COMPTENT : l'analytique n'agrège que les
 * rapprochements validés (cf. `fetchValidatedDays`). Un jour en brouillon a des
 * statuts encore provisoires (occupées non matérialisées, exceptions non figées)
 * qui fausseraient le récap ; on l'ignore tant qu'il n'est pas clôturé.
 */

import { supabase } from '#/lib/supabase.ts'
import { RAPRO_AGG_VIEW } from '#/lib/rapro/service.ts'

/** Décompte des statuts stockés d'un jour (nettoyée / rattrapage / bloquée /
 * refus, hors occupation PDJ) — mêmes catégories que la grille du rapprochement.
 * `nettoyee` = ménage d'une chambre VENDUE (défaut inclus, matérialisé à la
 * clôture) ; `rattrapage` = ménage d'une chambre REPORTÉE non vendue (facturable
 * mais PAS une vente du jour) — compté à part pour ne pas gonfler les vendues. */
export interface DayStatusCounts {
  nettoyee: number
  rattrapage: number
  bloquee: number
  refus: number
}

const emptyCounts = (): DayStatusCounts => ({
  nettoyee: 0,
  rattrapage: 0,
  bloquee: 0,
  refus: 0,
})

/**
 * Décomptes par jour (nettoyee / rattrapage / bloquee / refus) sur `[from, to]`,
 * lus depuis la VUE `rapro_daily_agg` : une ligne par jour CLÔTURÉ, déjà agrégée
 * côté base (le JOIN sur rapro_sheets validated y remplace l'ancien filtrage des
 * jours clôturés). Bornes 'YYYY-MM-DD' incluses. Paginé (défensif : ≤ 366 lignes/an).
 * Renvoie la même Map que consommaient les analytiques (monthlyRows / sumCounts).
 */
export async function fetchRaproDailyAgg(
  from: string,
  to: string,
): Promise<Map<string, DayStatusCounts>> {
  const byDay = new Map<string, DayStatusCounts>()
  const PAGE = 1000
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(RAPRO_AGG_VIEW)
      .select('*')
      .gte('report_date', from)
      .lte('report_date', to)
      .order('report_date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as (DayStatusCounts & { report_date: string })[]
    for (const r of rows) {
      byDay.set(r.report_date, {
        nettoyee: r.nettoyee,
        rattrapage: r.rattrapage,
        bloquee: r.bloquee,
        refus: r.refus,
      })
    }
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return byDay
}

/** Chambres VENDUES d'un décompte = chambres occupées ce jour-là (nettoyée =
 * vendue facturée, bloquée = à nettoyer, refus = client présent). Le `rattrapage`
 * en est EXCLU : c'est un ménage fait sur une chambre reportée non vendue (vendue
 * la veille, pas aujourd'hui) — l'inclure double-compterait l'occupation. */
export function vendues(c: DayStatusCounts): number {
  return c.nettoyee + c.bloquee + c.refus
}

/** Ménages FACTURABLES ELIOR d'un décompte = nettoyées (chambres vendues) +
 * rattrapages (reportées non vendues enfin nettoyées). C'est le total de la
 * facture ménage, distinct des vendues (occupation). */
export function cleaned(c: DayStatusCounts): number {
  return c.nettoyee + c.rattrapage
}

/** Somme des décomptes d'un ensemble de jours. */
export function sumCounts(byDay: Map<string, DayStatusCounts>): DayStatusCounts {
  const t = emptyCounts()
  for (const c of byDay.values()) {
    t.nettoyee += c.nettoyee
    t.rattrapage += c.rattrapage
    t.bloquee += c.bloquee
    t.refus += c.refus
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
    totals.rattrapage += c.rattrapage
    totals.bloquee += c.bloquee
    totals.refus += c.refus
    rows.push({ date, day: d, ...c })
  }
  return { rows, totals }
}
