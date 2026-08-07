/*
 * Inventaire des chambres (OKKO Nantes) — COPIE autonome (Deno) de
 * `src/lib/hotel/rooms.ts`, plus la nature du séjour `stayKind` recopiée de
 * `src/lib/pdj/csv.ts`. Aucun import `#/` : ce module tourne dans l'Edge
 * Function, hors du graphe client.
 *
 * 80 chambres sur 6 étages ; le numéro encode l'étage (centaine). Les étages 1
 * et 6 sont partiels (pas de 101, étage 6 en 621-631).
 */

const range = (start: number, end: number): number[] =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i)

export const ALL_ROOMS = [
  ...range(102, 114), // étage 1 (13)
  ...range(201, 214), // étage 2 (14)
  ...range(301, 314), // étage 3 (14)
  ...range(401, 414), // étage 4 (14)
  ...range(501, 514), // étage 5 (14)
  ...range(621, 631), // étage 6 (11)
]

/** Ensemble des chambres de l'inventaire (test d'appartenance en O(1)). Sert à
 * écarter les lignes hors inventaire (salle de séminaire, « 0 », faute PMS) qui
 * ne sont dessinées dans aucun étage : sinon les tuiles de stats compteraient une
 * chambre absente de la grille (PDF incohérent) et divergeraient de la feuille
 * imprimée côté client. */
export const KNOWN_ROOMS = new Set<number>(ALL_ROOMS)

/** Étage d'une chambre (centaine du numéro). */
export const floorOf = (room: number): number => Math.floor(room / 100)

/** Nature du séjour d'après le statut PMS — SOURCE UNIQUE de la règle : recouche
 * (IN HOUSE), départ (DUE OUT = va partir, ou CHECKED OUT = déjà parti ce matin),
 * ou null (autre). Recopie EXACTE de `src/lib/pdj/csv.ts`. */
export function stayKind(status: string): 'staying' | 'departing' | null {
  if (status.includes('IN HOUSE')) return 'staying'
  if (status.includes('DUE OUT') || status.includes('CHECKED OUT'))
    return 'departing'
  return null
}

/** Chambres groupées par étage, dans l'ordre de l'inventaire. */
export function floorsOf(): { floor: number; rooms: number[] }[] {
  const map = new Map<number, number[]>()
  for (const room of ALL_ROOMS) {
    const floor = floorOf(room)
    const list = map.get(floor)
    if (list) list.push(room)
    else map.set(floor, [room])
  }
  return [...map.entries()].map(([floor, rooms]) => ({ floor, rooms }))
}
