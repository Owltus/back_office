/*
 * Roulement (report) calculé des chambres non faites — métier pur, aucun
 * stockage. Une chambre « Bloquée » (due mais non résolue) doit rester due les
 * jours suivants jusqu'à résolution (nettoyée ou passée hors charge), y compris
 * à travers une clôture. On le DÉRIVE en relisant une fenêtre bornée de jours
 * précédents (pas de propagation en base). Résolu = `nettoyee` OU hors charge
 * (`refus`/`noshow`) ; tout le reste roule.
 *
 * ANTI-CHAOS : seuls les jours dont le rapprochement est VERROUILLÉ (clôturé)
 * comptent pour le roulement. Un jour non clôturé (en cours, ou jamais rempli
 * avant qu'on commence à utiliser l'outil) est ignoré → aucune fausse reportée,
 * plus d'ambiguïté. Concrètement : une chambre bloquée ne « roule » qu'une fois
 * son jour clôturé.
 *
 * Les lectures elles-mêmes (statuts rapro + occupation PDJ par jour) sont faites
 * côté composant via les queries existantes (mêmes clés → cache partagé) ; ici on
 * ne manipule que les instantanés déjà chargés.
 */

import { JUSTIFIED_STATUSES, statusOf } from '#/lib/rapro/constants.ts'
import { addDays } from '#/lib/rapro/day.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Profondeur maximale du roulement (jours). Borne les lectures et évite une
 * traîne infinie (D4) ; la clôture n'interrompt PAS le roulement (D7). */
export const CARRYOVER_WINDOW_DAYS = 7

/** Instantané d'un jour : statuts par chambre + occupation (dû) reprise du PDJ. */
export interface DaySnapshot {
  statuses: ReadonlyMap<number, RoomStatus>
  occupied: ReadonlySet<number>
  /** Le rapprochement de ce jour est-il verrouillé (clôturé) ? Seuls les jours
   * clôturés originent des chambres reportées. */
  closed: boolean
}

/** Une chambre est « résolue » (cesse de rouler) si son statut de base est
 * nettoyée ou hors charge (`refus`/`noshow`). Seule `non_nettoyee` (« Bloquée »)
 * roule. Le sur-statut n'entre pas en compte (orthogonal). */
function isResolved(status: RoomStatus): boolean {
  return (
    status === 'nettoyee' ||
    (JUSTIFIED_STATUSES as readonly string[]).includes(status)
  )
}

/**
 * Jours à relire pour le roulement, du plus ANCIEN au plus récent (`start … J-1`).
 * Borné à `windowDays` jours en arrière ET à `lowerBound` (jour le plus ancien
 * disponible) : on prend la borne la plus récente des deux.
 */
export function carryoverWindow(
  current: string,
  lowerBound: string,
  windowDays = CARRYOVER_WINDOW_DAYS,
): string[] {
  const floor = addDays(current, -windowDays)
  const start = floor > lowerBound ? floor : lowerBound
  const days: string[] = []
  for (let d = start; d < current; d = addDays(d, 1)) days.push(d)
  return days
}

/**
 * Chambres reportées au jour courant : dues (occupées) un jour antérieur de la
 * fenêtre, non résolues ce jour-là ET jamais résolues depuis (jusqu'au jour
 * courant inclus). Seuls les jours CLÔTURÉS originent des reportées (un jour non
 * clôturé est ignoré). `past` = instantanés du plus ancien au plus récent (< J).
 */
export function carryOver(
  past: DaySnapshot[],
  current: DaySnapshot,
): Set<number> {
  const carried = new Set<number>()
  const resolvedSince = (room: number, from: number): boolean => {
    for (let i = from; i < past.length; i++) {
      if (isResolved(statusOf(past[i].statuses, room))) return true
    }
    return isResolved(statusOf(current.statuses, room))
  }
  past.forEach((snap, i) => {
    // Seuls les jours CLÔTURÉS originent des reportées (anti-chaos, cf. en-tête).
    if (!snap.closed) return
    for (const room of snap.occupied) {
      if (isResolved(statusOf(snap.statuses, room))) continue
      if (!resolvedSince(room, i + 1)) carried.add(room)
    }
  })
  return carried
}
