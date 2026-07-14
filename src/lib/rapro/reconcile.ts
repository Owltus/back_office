/*
 * Réconciliation comptable d'un jour de ménage — métier pur (sans React ni
 * Supabase). Sur les chambres DUES (occupées, reprises du PDJ), on répartit en
 * trois familles : fait (`nettoyee`), hors charge (`refus`, aucun ménage dû) et
 * dû non fait (la « Bloquée » = utilisée mais non nettoyée). La balance = le dû
 * non fait ; « à zéro » = plus aucune chambre due ne reste à nettoyer.
 *
 * Calqué sur `isBalanced` de la caisse (prédicat pur consommé par l'UI), sans
 * EPSILON : ici tout est entier.
 */

import { JUSTIFIED_STATUSES, statusOf } from '#/lib/rapro/constants.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

export interface Reconciliation {
  /** Chambres dues (occupées) = `occupied.size`. */
  due: number
  /** Nettoyées parmi les dues (fait). */
  clean: number
  /** Hors charge (`refus`) parmi les dues. */
  settled: number
  /** Reste à nettoyer = `due − clean − settled` (la balance ; roule). */
  pending: number
}

const isSettled = (s: RoomStatus): boolean =>
  (JUSTIFIED_STATUSES as readonly string[]).includes(s)

/** Réconcilie un jour : ne raisonne que sur les chambres DUES (occupées PDJ). */
export function reconcile(
  statuses: ReadonlyMap<number, RoomStatus>,
  occupied: ReadonlySet<number>,
): Reconciliation {
  let clean = 0
  let settled = 0
  for (const room of occupied) {
    const s = statusOf(statuses, room)
    if (s === 'nettoyee') clean++
    else if (isSettled(s)) settled++
  }
  const due = occupied.size
  return { due, clean, settled, pending: due - clean - settled }
}

/** Balance à zéro : toute chambre due est nettoyée ou hors charge. */
export function isReconciled(r: Reconciliation): boolean {
  return r.pending === 0
}
