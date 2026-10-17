// Inventaire des chambres et validation d'une ligne client (Deno).
//
// MIROIR de `src/lib/hotel/rooms.ts` (ALL_ROOMS) et de `lireChambre` /
// `lireOccupants` de `src/lib/pdj/csv.ts` : les Edge Functions ne peuvent pas
// importer `src/` (alias `#/`). `src/lib/pdj/chambresEdge.sync.test.ts`
// échoue au premier écart ; reporter toute modification des deux côtés.
//
// Audit du 2026-10-17 (F2) : l'import In-House acceptait tout ce que
// `Number()` sait lire (« -7 », « 0x10 » → 16, « 1e3 » → 1000, « 9001 ») et un
// nombre d'occupants arbitraire (30 000), écrits tels quels en base.

const plage = (debut: number, fin: number) =>
  Array.from({ length: fin - debut + 1 }, (_, i) => debut + i)

/** Les 80 chambres de l'hôtel (miroir de src/lib/hotel/rooms.ts). */
export const ALL_ROOMS: readonly number[] = [
  ...plage(102, 114),
  ...plage(201, 214),
  ...plage(301, 314),
  ...plage(401, 414),
  ...plage(501, 514),
  ...plage(621, 631),
]

const CHAMBRES = new Set(ALL_ROOMS)

/** Plafond d'adultes (et, séparément, d'enfants) sur une ligne. Une chambre de
 *  l'hôtel en loge 4 au plus (maximum observé en base : 3-4) ; 20 laisse une
 *  large marge à une saisie PMS atypique tout en refusant l'absurde. */
export const MAX_OCCUPANTS = 20

/** Numéro de chambre d'une cellule CSV : 1 à 4 chiffres ET chambre de l'hôtel,
 *  sinon null (ligne à écarter). */
export function lireChambre(cellule: string | undefined): number | null {
  const s = (cellule ?? '').trim()
  if (!/^\d{1,4}$/.test(s)) return null
  const n = Number(s)
  return CHAMBRES.has(n) ? n : null
}

/** Nombre d'adultes ou d'enfants : cellule vide = 0 (comportement historique),
 *  sinon 1 à 2 chiffres entre 0 et MAX_OCCUPANTS ; autre chose = null. */
export function lireOccupants(cellule: string | undefined): number | null {
  const s = (cellule ?? '').trim()
  if (s === '') return 0
  if (!/^\d{1,2}$/.test(s)) return null
  const n = Number(s)
  return n <= MAX_OCCUPANTS ? n : null
}
