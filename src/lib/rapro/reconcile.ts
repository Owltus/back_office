/*
 * Réconciliation comptable d'un jour de ménage — métier pur (sans React ni
 * Supabase). Sur les chambres DUES (occupées ∪ reportées « bloquées la veille »),
 * on répartit en trois familles : fait (`nettoyee`), hors charge (`refus`, aucun
 * ménage dû) et dû non fait (« Bloquée », OU une reportée laissée grise = pas
 * encore faite). La balance = le dû non fait ; « à zéro » = plus aucune chambre
 * due ne reste à nettoyer.
 *
 * Une chambre VENDUE sans couleur est nettoyée PAR DÉFAUT (fait). Une chambre
 * seulement REPORTÉE (non vendue, sans couleur posée) est au contraire un dû non
 * encore fait : le paramètre `sold` sépare ces deux « sans couleur ».
 *
 * Calqué sur `isBalanced` de la caisse (prédicat pur consommé par l'UI), sans
 * EPSILON : ici tout est entier.
 */

import { JUSTIFIED_STATUSES, statusOf } from '#/lib/rapro/constants.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

export interface Reconciliation {
  /** Chambres dues = occupées ∪ reportées (`due.size`). */
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

/**
 * Réconcilie un jour sur les chambres DUES (`due` = occupées ∪ reportées). `sold`
 * = les seules chambres vendues (PDJ) : sert à trancher le cas « sans couleur »
 * — une vendue est nettoyée par défaut (fait), une reportée grise est un dû non
 * fait (pending).
 */
export function reconcile(
  statuses: ReadonlyMap<number, RoomStatus>,
  due: ReadonlySet<number>,
  sold: ReadonlySet<number>,
): Reconciliation {
  let clean = 0
  let settled = 0
  for (const room of due) {
    const s = statusOf(statuses, room) // 'nettoyee' si aucune couleur
    const hasColor = statuses.has(room)
    if (isSettled(s)) settled++
    else if (s === 'non_nettoyee') {
      // dû non fait → pending (compté par soustraction)
    } else {
      // s === 'nettoyee' ou 'rattrapage' : ménage FAIT dès qu'une couleur est
      // posée (vert explicite ou rattrapage d'une reportée), OU aucune couleur sur
      // une chambre VENDUE (nettoyée par défaut). Une reportée grise (non vendue,
      // sans couleur) reste un dû non fait → pending.
      if (hasColor || sold.has(room)) clean++
    }
  }
  const dueCount = due.size
  return { due: dueCount, clean, settled, pending: dueCount - clean - settled }
}

/** Balance à zéro : toute chambre due est nettoyée ou hors charge. */
export function isReconciled(r: Reconciliation): boolean {
  return r.pending === 0
}
