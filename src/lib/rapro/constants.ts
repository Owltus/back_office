import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Ordre de défilement du statut au clic
 * (défaut → nettoyée → refus → no-show → défaut). */
export const STATUS_CYCLE: RoomStatus[] = [
  'non_nettoyee',
  'nettoyee',
  'refus',
  'noshow',
]

/** Libellés lisibles des statuts. */
export const STATUS_LABEL: Record<RoomStatus, string> = {
  // `non_nettoyee` = terme technique interne ; affiché « Bloquée » (usage hôtelier).
  non_nettoyee: 'Bloquée',
  nettoyee: 'Nettoyée',
  refus: 'Refus',
  noshow: 'No-show',
}

/** Statut suivant dans le cycle. */
export function nextStatus(status: RoomStatus): RoomStatus {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length]
}
