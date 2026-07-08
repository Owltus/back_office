/*
 * Roulement (report) calculé des chambres non faites — métier pur, aucun
 * stockage. Une chambre « Bloquée » (due mais non résolue) doit rester due les
 * jours suivants jusqu'à résolution (nettoyée ou passée hors charge), y compris
 * à travers une clôture. On le DÉRIVE en relisant une fenêtre bornée de jours
 * précédents (pas de propagation en base). Résolu = `nettoyee` OU hors charge
 * (`refus`/`noshow`) ; tout le reste roule.
 *
 * Un jour SANS aucune saisie rapro (aucun statut enregistré) est traité comme
 * « pas de données », PAS comme « tout bloqué » : il est ignoré du roulement.
 * Sinon tout jour antérieur non suivi (avant qu'on commence à saisir) ferait
 * rouler toutes ses chambres occupées → faux reportées en masse.
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
}

/** Une chambre est « résolue » (cesse de rouler) si elle est nettoyée ou hors
 * charge (`refus`/`noshow`). */
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
 * courant inclus). Les jours sans aucune saisie rapro sont ignorés (pas de
 * données ≠ tout bloqué). `past` = instantanés du plus ancien au plus récent (< J).
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
    // Jour non suivi (aucun statut saisi) = pas de données → ignoré, sinon toutes
    // ses chambres occupées rouleraient à tort (chaos en phase d'exportation).
    if (snap.statuses.size === 0) return
    for (const room of snap.occupied) {
      if (isResolved(statusOf(snap.statuses, room))) continue
      if (!resolvedSince(room, i + 1)) carried.add(room)
    }
  })
  return carried
}
