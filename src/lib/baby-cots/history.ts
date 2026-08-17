/* --------------------------------------------------------------------------
 * Historique undo/redo du planning lits bébé (pur : sans React ni Supabase).
 * Réplique EXACTE de lib/parking/history.ts, adaptée à `CotAssignment`.
 *
 * Une commande décrit MON action DÉJÀ appliquée par le board. Trois formes
 * couvrent toutes les mutations : création, suppression, modification de champs.
 * Un `update` ne porte QUE les champs touchés (before/after), jamais l'objet
 * entier : c'est ce qui préserve le travail concurrent d'un collègue sur les
 * autres champs (synchro temps réel).
 * ------------------------------------------------------------------------ */

import type { CotAssignment } from '#/lib/baby-cots/types.ts'

/** Patch limité aux champs modifiables d'une assignation (tout sauf l'id). */
export type CotAssignmentPatch = Partial<Omit<CotAssignment, 'id'>>

/** Une action annulable, telle qu'elle a déjà été appliquée par le board. */
export type CotCommand =
  | { kind: 'create'; snapshot: CotAssignment }
  | { kind: 'delete'; snapshot: CotAssignment }
  | { kind: 'update'; id: string; before: CotAssignmentPatch; after: CotAssignmentPatch }

/**
 * Commande inverse (appliquée par l'undo). Le redo réapplique la commande
 * d'origine, d'où l'involution : `invert(invert(cmd))` est égal à `cmd`.
 */
export function invert(cmd: CotCommand): CotCommand {
  switch (cmd.kind) {
    case 'create':
      return { kind: 'delete', snapshot: cmd.snapshot }
    case 'delete':
      return { kind: 'create', snapshot: cmd.snapshot }
    case 'update':
      return { kind: 'update', id: cmd.id, before: cmd.after, after: cmd.before }
  }
}
