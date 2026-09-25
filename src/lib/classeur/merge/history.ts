/*
 * Historique des fusions : restauration d'un instantané et suppression d'une
 * entrée — portés de Registre (`files.rs::rollback_merge`,
 * `delete_merge_entry`).
 *
 * La restauration est une FUSION EN MODE REMPLACEMENT de l'instantané dans
 * le classeur (`planifierFusion(local, snapshot, { replace: true })`) : ce
 * qui manque est recréé ou restauré (suppression douce annulée, R6), ce qui
 * diffère est réécrit (R8), ce qui n'est pas dans l'instantané est supprimé
 * en douceur (R11). Registre purgeait PHYSIQUEMENT puis réinsérait tout ;
 * ici rien n'est jamais supprimé physiquement (contrôle /borg de l'étape 6)
 * et les identifiants des lignes conservées ne changent pas.
 *
 * Ordre, comme chez Registre : si l'état courant diffère de l'instantané,
 * un INSTANTANÉ DE SÉCURITÉ (« Sauvegarde avant restauration ») est écrit
 * AVANT toute écriture, puis les champs du classeur, puis le plan, puis
 * l'élagage. Sans transaction (voir `apply.ts`).
 *
 * Écarts assumés :
 *   - `updated_at` des éléments est estampillé par la base (trigger
 *     `classeur_stamp`) : une ligne restaurée porte la date de la
 *     restauration, pas celle de l'instantané. Registre la recopiait.
 *   - la déduplication d'instantané (`snapshot_already_in_history`) n'est
 *     pas portée (voir `apply.ts`).
 */

import {
  chargerEtatLocal,
  elaguerHistorique,
  executerPlan,
} from '#/lib/classeur/merge/apply.ts'
import type { MergeResult } from '#/lib/classeur/merge/merge.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import {
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'
import { instantaneEgal } from '#/lib/classeur/merge/snapshot.ts'
import {
  deleteMergeHistory,
  fetchClasseur,
  fetchMergeEntry,
  insertMergeHistory,
  updateClasseur,
} from '#/lib/classeur/service.ts'

/** `source_name` de l'instantané de sécurité (libellé reconnu par le dialogue). */
export const SOURCE_SAUVEGARDE = 'Sauvegarde avant restauration'

/**
 * Restaure l'état enregistré par l'entrée `entryId`. Rend `null` si l'état
 * courant est déjà celui de l'instantané (rien n'est écrit), sinon les
 * compteurs du plan appliqué.
 */
export async function restaurerInstantane(
  entryId: number,
): Promise<MergeResult | null> {
  const entree = await fetchMergeEntry(entryId)
  if (entree === null) throw new Error("Entrée d'historique introuvable.")
  // Validation par le même lecteur que l'import : un instantané corrompu
  // est refusé avec un message lisible, jamais appliqué à moitié.
  const snapshot = parseImportJson(JSON.stringify(entree.snapshot))

  const classeurId = entree.classeur_id
  const classeur = await fetchClasseur(classeurId)
  if (classeur === null) throw new Error('Classeur introuvable ou supprimé.')
  const local = await chargerEtatLocal(classeurId)
  const courant = construireExport(
    classeur,
    local.chapters,
    local.content,
    local.periodicites ?? [],
  )
  if (instantaneEgal(courant, snapshot)) return null

  // Instantané de sécurité AVANT toute écriture.
  await insertMergeHistory({
    classeur_id: classeurId,
    source_name: SOURCE_SAUVEGARDE,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    snapshot: courant,
  })

  // Champs du classeur (le plan ne couvre que chapitres et éléments).
  await updateClasseur(classeurId, snapshot.classeur)

  const plan = planifierFusion(local, snapshot, { replace: true })
  await executerPlan(classeurId, plan.actions)
  await elaguerHistorique(classeurId)
  return plan.resultat
}

/** Suppression PHYSIQUE d'une entrée (RLS : gestion seule ; 42501 sinon). */
export async function supprimerEntreeHistorique(
  entryId: number,
): Promise<void> {
  await deleteMergeHistory(entryId)
}
