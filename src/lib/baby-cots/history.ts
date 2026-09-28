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

/**
 * Retour arrière d'une écriture refusée par la base, CHAMP PAR CHAMP : pour
 * chaque champ du `patch` envoyé, la valeur qu'il avait dans `source` (l'état
 * d'avant). Les autres champs ne sont pas touchés, pour ne pas écraser un
 * travail concurrent reçu entre-temps.
 */
export function restorePatch(patch: CotAssignmentPatch, source: CotAssignmentPatch): CotAssignmentPatch {
  const out: CotAssignmentPatch = {}
  for (const key of Object.keys(patch) as (keyof CotAssignmentPatch)[]) {
    Object.assign(out, { [key]: source[key] })
  }
  return out
}

/** Remet un élément supprimé à tort (suppression refusée par la base), sauf
 *  s'il est déjà revenu (temps réel, rechargement). */
export function restoreDeleted<TItem extends { id: string }>(
  list: TItem[],
  item: TItem,
): TItem[] {
  return list.some((x) => x.id === item.id) ? list : [...list, item]
}

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
