/*
 * Roulement (report) calculé des chambres non faites — métier pur, aucun
 * stockage. Une chambre « Bloquée » (due mais non résolue) doit rester due les
 * jours suivants jusqu'à résolution (nettoyée ou passée hors charge), y compris
 * à travers une clôture. On le DÉRIVE en relisant une fenêtre bornée de jours
 * précédents (pas de propagation en base). Résolu = `nettoyee` OU hors charge
 * (`refus`) ; tout le reste roule.
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

import { JUSTIFIED_STATUSES } from '#/lib/rapro/constants.ts'
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

/** Une chambre est « résolue » (cesse de rouler) si elle a été EXPLICITEMENT
 * traitée : une VRAIE ligne stockée qui est nettoyée ou hors charge (`refus`).
 * L'ABSENCE de ligne (chambre non touchée) ne résout PAS — une bloquée de la
 * veille non touchée continue de rouler jusqu'à ce qu'on la traite. (Les jours
 * clôturés ont toutes leurs occupées matérialisées, donc une ligne ; seul le jour
 * courant a des chambres sans ligne.) */
function isResolved(
  statuses: ReadonlyMap<number, RoomStatus>,
  room: number,
): boolean {
  const s = statuses.get(room)
  return (
    s !== undefined &&
    (s === 'nettoyee' || (JUSTIFIED_STATUSES as readonly string[]).includes(s))
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
 * Chambres reportées au jour courant : bloquées (`non_nettoyee`) un jour clôturé
 * antérieur de la fenêtre, et jamais résolues sur un jour INTERMÉDIAIRE clôturé
 * depuis. On NE regarde PAS le statut du jour courant : le liseré « bloquée la
 * veille » est un fait sur la veille — il reste présent aujourd'hui QUEL QUE SOIT
 * le statut du jour (nettoyée, refus…) et même après un reset de la case. Seuls
 * les jours CLÔTURÉS originent des reportées. `past` = instantanés du plus ancien
 * au plus récent (< J).
 */
export function carryOver(past: DaySnapshot[]): Set<number> {
  const carried = new Set<number>()
  // Résolu sur un jour INTERMÉDIAIRE clôturé (entre l'origine et J-1) : la chambre
  // a été traitée entre-temps, elle cesse de rouler. Le jour COURANT n'entre pas
  // dans ce test (cf. doc) → le liseré ne dépend jamais du statut du jour.
  const resolvedSince = (room: number, from: number): boolean => {
    for (let i = from; i < past.length; i++) {
      if (isResolved(past[i].statuses, room)) return true
    }
    return false
  }
  past.forEach((snap, i) => {
    // Seuls les jours CLÔTURÉS originent des reportées (anti-chaos, cf. en-tête).
    if (!snap.closed) return
    for (const room of snap.occupied) {
      // Origine = chambre bloquée ce jour-là (ligne `non_nettoyee`, non résolue).
      if (isResolved(snap.statuses, room)) continue
      if (!resolvedSince(room, i + 1)) carried.add(room)
    }
  })
  return carried
}
