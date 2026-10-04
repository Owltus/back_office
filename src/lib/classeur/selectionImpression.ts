/*
 * Impression d'une SÉLECTION d'éléments d'un chapitre (étape 4 du plan
 * `plan/classeur-fonctions-2026-10-04/`) — fonction PURE, réutilisée par
 * le PDF direct (étape 9).
 *
 * Règles :
 * - l'ordre est TOUJOURS celui de la liste du chapitre (`flattenItems`),
 *   jamais celui du cochage : `useSelection` est un ensemble, non ordonné ;
 * - aucun doublon, même si la liste ou les clés en contiennent ;
 * - un élément supprimé (`deleted_at` posé) ou absent de la liste est
 *   ignoré : il a pu disparaître entre le cochage et l'aperçu.
 */

import { cleRef } from '#/lib/classeur/ordre.ts'
import type { CleRef, ItemRef } from '#/lib/classeur/ordre.ts'
import type { ChapterItem } from '#/lib/classeur/types.ts'

/** Une clé `kind:id` ou une référence `{ kind, id }` : les deux sont admises. */
export type CleSelection = CleRef | ItemRef

function versCle(c: CleSelection): string {
  return typeof c === 'string' ? c : cleRef(c.kind, c.id)
}

/**
 * Les éléments de `liste` désignés par `cles`, dans l'ordre de `liste`,
 * sans doublon ni élément supprimé.
 */
export function elementsAImprimer(
  liste: ReadonlyArray<ChapterItem>,
  cles: Iterable<CleSelection>,
): ChapterItem[] {
  const voulues = new Set<string>()
  for (const c of cles) voulues.add(versCle(c))
  const vues = new Set<string>()
  const sortie: ChapterItem[] = []
  for (const it of liste) {
    const cle = cleRef(it.kind, it.data.id)
    if (!voulues.has(cle) || vues.has(cle)) continue
    if (it.data.deleted_at !== null) continue
    vues.add(cle)
    sortie.push(it)
  }
  return sortie
}
