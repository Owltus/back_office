/* --------------------------------------------------------------------------
 * Historique undo/redo du planning parking (pur : sans React ni Supabase).
 *
 * Une commande décrit MON action DÉJÀ appliquée par le board. Trois formes
 * couvrent toutes les mutations : création, suppression, modification de champs.
 * Un `update` ne porte QUE les champs touchés (before/after), jamais l'objet
 * entier : c'est ce qui préserve le travail concurrent d'un collègue sur les
 * autres champs (synchro temps réel).
 * ------------------------------------------------------------------------ */

import type { Reservation } from '#/lib/parking/model.ts'

/** Patch limité aux champs modifiables d'une réservation (tout sauf l'id). */
export type ReservationPatch = Partial<Omit<Reservation, 'id'>>

/** Une action annulable, telle qu'elle a déjà été appliquée par le board. */
export type ParkingCommand =
  | { kind: 'create'; snapshot: Reservation }
  | { kind: 'delete'; snapshot: Reservation }
  | { kind: 'update'; id: string; before: ReservationPatch; after: ReservationPatch }

/**
 * Commande inverse (appliquée par l'undo). Le redo réapplique la commande
 * d'origine, d'où l'involution : `invert(invert(cmd))` est égal à `cmd`.
 */
export function invert(cmd: ParkingCommand): ParkingCommand {
  switch (cmd.kind) {
    case 'create':
      return { kind: 'delete', snapshot: cmd.snapshot }
    case 'delete':
      return { kind: 'create', snapshot: cmd.snapshot }
    case 'update':
      return { kind: 'update', id: cmd.id, before: cmd.after, after: cmd.before }
  }
}
