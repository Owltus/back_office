import { ALL_ROOMS, floorOf } from '#/lib/hotel/rooms.ts'
import type { DbHotelRoom } from '#/lib/literie/types.ts'

/** Un étage et la liste de ses numéros de chambre (triés croissant). Même
 * regroupement que `lib/rapro/rooms.ts` (FLOORS), dupliqué à dessein plutôt
 * qu'importé : literie et rapro sont deux features indépendantes, chacune
 * consomme la SOURCE canonique (`ALL_ROOMS`/`floorOf`), pas l'autre feature. */
export interface Floor {
  floor: number
  rooms: number[]
}

/** Étages ordonnés (1 → 6), chacun avec ses chambres — trame de la grille. */
export const FLOORS: Floor[] = (() => {
  const byFloor = new Map<number, number[]>()
  for (const room of ALL_ROOMS) {
    const f = floorOf(room)
    const list = byFloor.get(f) ?? []
    list.push(room)
    byFloor.set(f, list)
  }
  return [...byFloor.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floor, rooms]) => ({
      floor,
      rooms: [...rooms].sort((a, b) => a - b),
    }))
})()

/**
 * Regroupe les lignes `hotel_rooms` en Map room → synthétique (true/false).
 * Chaque chambre de `ALL_ROOMS` reçoit une entrée par défaut à `false` (plume)
 * AVANT d'appliquer les lignes reçues : une chambre absente de la table (ne
 * devrait pas arriver, seed des 80 chambres à l'étape 1) reste donc « plume »
 * plutôt que de disparaître de la grille.
 */
export function beddingMap(rows: DbHotelRoom[]): Map<number, boolean> {
  const map = new Map<number, boolean>()
  for (const room of ALL_ROOMS) map.set(room, false)
  for (const r of rows) map.set(r.room, r.literie_synthetique)
  return map
}
