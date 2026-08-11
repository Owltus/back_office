/* --------------------------------------------------------------------------
 * Rapprochement (ménage) — synthèse d'un jour pour une vue TRANSVERSE (RepJour).
 *
 * Reproduit À L'IDENTIQUE les compteurs du board `/rapro` (Vendues / Nettoyées /
 * Refus / Bloquées du jour / Bloquées de la veille) en réutilisant `countStats`
 * (donc la convention « absence de ligne = nettoyée par défaut »). Le `carried`
 * (roulement) est passé PAR L'APPELANT, calculé exactement comme le board :
 * `carryOver(fenêtre de jours passés)` ∪ liseré manuel du jour. Aucune règle de
 * décompte n'est réécrite ici — c'est le miroir de RaproBoard (l.256-290).
 * ------------------------------------------------------------------------ */

import { countStats } from '#/lib/rapro/constants.ts'
import type { RaproOccupancyRow } from '#/lib/rapro/service.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Synthèse condensée du ménage d'un jour. */
export interface RaproDaySummary {
  /** Chambres vendues effectives (occupées ∪ corrections, hors « non vendue »
   * et hors reportées). */
  vendues: number
  /** Nettoyées (défaut inclus) + rattrapages. */
  nettoyees: number
  /** Refus de service. */
  refus: number
  /** Bloquées du jour (utilisées non nettoyées, reportées à demain). */
  bloqueesJour: number
  /** Bloquées de la veille (roulement : `carried.size`). */
  bloqueesVeille: number
}

/**
 * Synthèse ménage d'un jour — calque de RaproBoard. `effectiveSold` = occupation
 * ∪ chambres à couleur explicite (hors « non vendue »), diminuée des reportées
 * (`carried`). Partition via `countStats`, plus les rattrapages (ménages faits
 * sur des reportées non vendues, hors de l'occupation).
 */
export function raproDaySummary(
  occupancy: RaproOccupancyRow[],
  statuses: ReadonlyMap<number, RoomStatus>,
  carried: ReadonlySet<number>,
): RaproDaySummary {
  const occupied = new Set(occupancy.map((r) => r.room))

  const effectiveSold = new Set(occupied)
  for (const [room, s] of statuses) {
    if (s === 'non_vendue') effectiveSold.delete(room)
    else if (!carried.has(room)) effectiveSold.add(room)
  }

  const stats = countStats(statuses, effectiveSold)
  let rattrapages = 0
  for (const [room, s] of statuses) {
    if (s === 'rattrapage' && !effectiveSold.has(room)) rattrapages++
  }

  return {
    vendues: effectiveSold.size,
    nettoyees: stats.clean + rattrapages,
    refus: stats.refus,
    bloqueesJour: stats.todo,
    bloqueesVeille: carried.size,
  }
}
