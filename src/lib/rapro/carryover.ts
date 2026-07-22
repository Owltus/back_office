/*
 * Roulement (report) calculé des chambres bloquées — métier pur, aucun stockage.
 * Une chambre due mais non résolue doit rester signalée les jours suivants
 * (liseré « bloquée la veille ») jusqu'à résolution, y compris à travers une
 * clôture. On le DÉRIVE en relisant une fenêtre bornée de jours précédents.
 *
 * DEUX ORIGINES de roulement :
 *  - une chambre EXPLICITEMENT bloquée (`non_nettoyee`) un jour donné ;
 *  - une chambre marquée « bloquée la veille » À LA MAIN (`carriedManual`, double-
 *    clic) — cas d'un report tardif après clôture, posé directement sur le jour
 *    courant sans rouvrir le passé. Orthogonal à la couleur : la chambre garde
 *    son statut (nettoyée/refus/bloquée), mais roule comme un blocage.
 *
 * RÉSOLUTION : une chambre roule tant qu'elle reste un dû-non-fait — bloquée OU
 * marquée à la main. Dès qu'un jour intermédiaire elle n'est plus ni l'un ni
 * l'autre (nettoyée par défaut/explicite, ou hors charge), elle cesse de rouler.
 * Le nettoyage par défaut (occupée sans exception) vaut donc résolution ; on NE
 * regarde PAS l'occupation PDJ.
 *
 * Les statuts par jour sont lus côté composant via les queries existantes (mêmes
 * clés → cache partagé) ; ici on ne manipule que les instantanés déjà chargés.
 */

import { addDays } from '#/lib/rapro/day.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Profondeur maximale du roulement (jours). Borne les lectures et évite une
 * traîne infinie (D4) ; la clôture n'interrompt PAS le roulement (D7). */
export const CARRYOVER_WINDOW_DAYS = 7

/** Instantané d'un jour : statuts par chambre (absence de ligne = nettoyée par
 * défaut) + chambres portant le sur-statut « bloquée la veille » posé à la main.
 * Les deux sont des origines de roulement ; l'occupation PDJ n'entre pas en jeu. */
export interface DaySnapshot {
  statuses: ReadonlyMap<number, RoomStatus>
  carriedManual: ReadonlySet<number>
}

/** Une chambre est « résolue » (cesse de rouler) un jour donné si elle n'est plus
 * un dû-non-fait : ni bloquée (`non_nettoyee`), ni marquée « bloquée la veille » à
 * la main. Tout le reste — nettoyée par défaut/explicite, refus — résout. */
function isResolved(snap: DaySnapshot, room: number): boolean {
  if (snap.carriedManual.has(room)) return false
  return snap.statuses.get(room) !== 'non_nettoyee'
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
 * Chambres reportées au jour courant. Origines (un jour antérieur) : chambre
 * EXPLICITEMENT bloquée (`non_nettoyee`) OU marquée « bloquée la veille » à la
 * main (`carriedManual`). Chacune roule tant qu'elle n'est pas résolue sur un
 * jour INTERMÉDIAIRE (cf. `isResolved`). On NE regarde PAS le statut du jour
 * courant : le liseré est un fait sur la veille — il reste présent aujourd'hui
 * quel que soit le statut du jour. `past` = instantanés du plus ancien au plus
 * récent (< J). NB : le flag manuel du jour COURANT lui-même (liseré posé
 * aujourd'hui) est ajouté côté composant, PAS ici.
 */
export function carryOver(past: DaySnapshot[]): Set<number> {
  const carried = new Set<number>()
  // Résolue sur un jour INTERMÉDIAIRE (entre l'origine et J-1) : la chambre a été
  // traitée entre-temps, elle cesse de rouler. Le jour COURANT n'entre pas dans
  // `past` → le liseré ne dépend jamais du statut du jour courant.
  const resolvedSince = (room: number, from: number): boolean => {
    for (let i = from; i < past.length; i++) {
      if (isResolved(past[i], room)) return true
    }
    return false
  }
  past.forEach((snap, i) => {
    // Origines du jour : bloquées explicites + marquées « la veille » à la main.
    const origins = new Set<number>(snap.carriedManual)
    for (const [room, status] of snap.statuses) {
      if (status === 'non_nettoyee') origins.add(room)
    }
    for (const room of origins) {
      if (!resolvedSince(room, i + 1)) carried.add(room)
    }
  })
  return carried
}
