/*
 * Conversion PURE des lignes `rapro_rooms` en état de jour (`RaproDay`) — aucun
 * accès réseau. Partagée par `fetchDay` (un jour) et par la lecture en PLAGE de la
 * bande RepJour (`fetchRoomsRange`), pour que les deux chemins produisent
 * EXACTEMENT les mêmes instantanés : la fenêtre de roulement lue en une requête
 * doit alimenter `carryOver` avec la même sémantique que sept lectures par jour.
 *
 * Rappels de sémantique (cf. service.ts) : une ligne `status null` n'existe que
 * pour porter le liseré → HORS de `statuses` ; l'absence de ligne = chambre non
 * touchée (nettoyée par défaut si vendue) → HORS de tout, donc « résolue » pour le
 * roulement (`isResolved` de carryover.ts : `status !== 'non_nettoyee'`).
 */

import type { DbRaproRoom, RaproDay, RoomStatus } from '#/lib/rapro/types.ts'

/** Colonnes d'une ligne de statut telles que lues par le service. */
export type RaproRoomRow = Pick<
  DbRaproRoom,
  'room' | 'status' | 'carried_manual' | 'materialized'
>

/** Ligne datée (lecture en plage : plusieurs jours dans un même résultat). */
export type DatedRaproRoomRow = RaproRoomRow & Pick<DbRaproRoom, 'report_date'>

/** Statuts valides. Une valeur inconnue en base est ramenée à un statut sûr
 * plutôt que de casser le rendu (défense ; ne devrait pas arriver). */
const KNOWN_STATUSES = new Set<RoomStatus>([
  'nettoyee',
  'non_nettoyee',
  'refus',
  'rattrapage',
  'non_vendue',
])

/** État d'un jour à partir de ses lignes : Map chambre→statut (défaut nettoyee =
 * absence de ligne). TOLÉRANT : une valeur non reconnue est ramenée à 'refus'
 * (hors charge). */
export function toRaproDay(
  reportDate: string,
  rows: readonly RaproRoomRow[],
): RaproDay {
  const statuses = new Map<number, RoomStatus>()
  const carriedManual = new Set<number>()
  const materialized = new Set<number>()
  for (const r of rows) {
    // Couleur EXPLICITE seulement : une ligne `status null` (posée pour le seul
    // liseré) reste HORS de la map → « aucune couleur » (grise/verte selon vente).
    if (r.status != null)
      statuses.set(r.room, KNOWN_STATUSES.has(r.status) ? r.status : 'refus')
    if (r.carried_manual) carriedManual.add(r.room)
    if (r.materialized) materialized.add(r.room)
  }
  return { reportDate, statuses, carriedManual, materialized }
}

/**
 * Regroupe des lignes multi-jours en un instantané PAR JOUR DEMANDÉ, dans l'ordre
 * de `days` (du plus ancien au plus récent pour `carryOver`). Un jour sans ligne
 * produit un instantané VIDE (et non une absence d'entrée) : c'est ce qui encode
 * « absence de ligne = résolue » — la chambre bloquée la veille cesse de rouler
 * sur ce jour-là. Les lignes hors de `days` sont ignorées.
 */
export function groupRowsByDay(
  days: readonly string[],
  rows: readonly DatedRaproRoomRow[],
): RaproDay[] {
  const byDay = new Map<string, DatedRaproRoomRow[]>()
  for (const d of days) byDay.set(d, [])
  for (const r of rows) byDay.get(r.report_date)?.push(r)
  return days.map((d) => toRaproDay(d, byDay.get(d) ?? []))
}
