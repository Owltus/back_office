import { ALL_ROOMS, floorOf } from '#/lib/hotel/rooms.ts'

/** Un étage et la liste de ses numéros de chambre (triés croissant). */
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
