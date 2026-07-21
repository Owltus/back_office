/*
 * Roulement (report) calculé des chambres bloquées — métier pur, aucun stockage.
 * Une chambre « Bloquée » (`non_nettoyee`) doit rester signalée les jours suivants
 * (liseré « bloquée la veille ») jusqu'à ce qu'elle soit résolue, y compris à
 * travers une clôture. On le DÉRIVE en relisant une fenêtre bornée de jours
 * précédents (pas de propagation en base).
 *
 * ORIGINE : une chambre marquée « Bloquée » (`non_nettoyee`) un jour donné — un
 * geste DÉLIBÉRÉ qui pose une ligne — roule le(s) jour(s) suivant(s), que ce jour
 * soit clôturé ou non, jusqu'à résolution.
 *
 * RÉSOLUTION : une chambre roule TANT QU'elle porte explicitement une ligne
 * `non_nettoyee`. Dès qu'un jour ultérieur ne la montre PLUS bloquée, elle cesse
 * de rouler — que ce soit parce qu'on l'a repassée au vert (ligne effacée →
 * défaut « nettoyée »), passée hors charge (`refus`/`noshow`), ou que le client
 * est parti (plus de ligne). La convention « absence de ligne = nettoyée par
 * défaut » vaut donc résolution : on NE regarde PAS l'occupation PDJ (une chambre
 * repassée au vert un jour est résolue, occupée ou non). C'était le bug : exiger
 * une trace stockée du nettoyage faisait rouler indéfiniment une bloquée
 * simplement repassée au vert (le clic « nettoyer » EFFACE la ligne, cf.
 * `clearRoom`).
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
 * défaut). L'occupation PDJ n'entre PAS dans le roulement (cf. en-tête). */
export interface DaySnapshot {
  statuses: ReadonlyMap<number, RoomStatus>
}

/** Une chambre est « résolue » (cesse de rouler) un jour donné dès qu'elle n'est
 * plus explicitement bloquée : seul `non_nettoyee` roule. Tout le reste — ligne
 * `nettoyee`/`refus`/`noshow` OU absence de ligne (défaut « nettoyée ») — résout. */
function isResolved(
  statuses: ReadonlyMap<number, RoomStatus>,
  room: number,
): boolean {
  return statuses.get(room) !== 'non_nettoyee'
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
 * Chambres reportées au jour courant. Origine : toute chambre EXPLICITEMENT
 * bloquée (`non_nettoyee`) un jour antérieur roule tant qu'elle n'est pas résolue
 * sur un jour INTERMÉDIAIRE (cf. `isResolved` : elle n'est plus bloquée ce
 * jour-là). On NE regarde PAS le statut du jour courant : le liseré « bloquée la
 * veille » est un fait sur la veille — il reste présent aujourd'hui QUEL QUE SOIT
 * le statut du jour (nettoyée, refus…) et même après un reset de la case. `past` =
 * instantanés du plus ancien au plus récent (< J).
 */
export function carryOver(past: DaySnapshot[]): Set<number> {
  const carried = new Set<number>()
  // Résolue sur un jour INTERMÉDIAIRE (entre l'origine et J-1) : la chambre a été
  // traitée entre-temps, elle cesse de rouler. Le jour COURANT n'entre pas dans
  // `past` → le liseré ne dépend jamais du statut du jour courant.
  const resolvedSince = (room: number, from: number): boolean => {
    for (let i = from; i < past.length; i++) {
      if (isResolved(past[i].statuses, room)) return true
    }
    return false
  }
  past.forEach((snap, i) => {
    for (const [room, status] of snap.statuses) {
      if (status !== 'non_nettoyee') continue
      if (!resolvedSince(room, i + 1)) carried.add(room)
    }
  })
  return carried
}
