/* --------------------------------------------------------------------------
 * Modèle métier du planning parking (pur : sans React ni présentation).
 *
 * Modèle "hôtel" : arrivée à 14h (après-midi), départ à 12h (matin).
 * Chaque jour est coupé en 2 demi-journées (SLOTS_PER_DAY).
 * ------------------------------------------------------------------------ */

export const SPOTS = 14
export const FIRST_STAFF_SPOT = 13 // places 13 & 14 = "personnel"
export const SPOTS_LIST = Array.from({ length: SPOTS }, (_, i) => i + 1)
export const SLOTS_PER_DAY = 2 // chaque jour = 2 demi-journées (matin / après-midi)

export type Status = 'confirme' | 'attente' | 'annule'

export interface Reservation {
  id: string
  client: string
  spot: number // 1..14
  startDay: number // décalage absolu (jours) depuis le lundi de référence
  nights: number // >= 1
  status: Status
  comment: string
}

export type Mode = 'move' | 'resize-left' | 'resize-right'

// Modèle demi-journées : arrivée = après-midi (slot impair), départ = matin (slot pair).
export const arrivalSlot = (startDay: number) => startDay * SLOTS_PER_DAY + 1
export const departureSlot = (startDay: number, nights: number) =>
  (startDay + nights) * SLOTS_PER_DAY

// Chevauchement : arrivée = après-midi, départ = matin (mêmes demi-journées).
export function hasOverlap(
  reservations: Reservation[],
  spot: number,
  startDay: number,
  nights: number,
  ignoreId?: string,
): boolean {
  const start = arrivalSlot(startDay)
  const end = departureSlot(startDay, nights)
  return reservations.some(
    (r) =>
      r.id !== ignoreId &&
      r.spot === spot &&
      arrivalSlot(r.startDay) <= end &&
      start <= departureSlot(r.startDay, r.nights),
  )
}
