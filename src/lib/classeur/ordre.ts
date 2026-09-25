/*
 * Ordre des éléments d'un chapitre — fonctions PURES de la page chapitre
 * (réordonnancement par glisser-déposer, sélection multiple).
 *
 * Un élément est désigné par sa RÉFÉRENCE `{ kind, id }` : les quatre natures
 * vivent dans quatre tables, un identifiant seul est ambigu. La clé texte
 * `kind:id` (`cleRef`) sert d'identifiant dnd-kit ET de clé de sélection ;
 * elle ne peut pas entrer en collision avec `chapter:N` (colonne des
 * chapitres), qui partage le même `DndContext`.
 */

import type { ChapterContent, ChapterItem, ItemKind } from '#/lib/classeur/types.ts'
import { ITEM_KINDS } from '#/lib/classeur/types.ts'

export interface ItemRef {
  kind: ItemKind
  id: number
}

/** `kind:id` — identifiant dnd-kit et clé de sélection d'un élément. */
export type CleRef = `${ItemKind}:${number}`

export function cleRef(kind: ItemKind, id: number): CleRef {
  return `${kind}:${id}`
}

/** Référence portée par une clé, `null` si la clé n'en est pas une. */
export function parseCleRef(cle: unknown): ItemRef | null {
  if (typeof cle !== 'string') return null
  const idx = cle.lastIndexOf(':')
  if (idx === -1) return null
  const kind = cle.slice(0, idx)
  const id = Number(cle.slice(idx + 1))
  if (!(ITEM_KINDS as readonly string[]).includes(kind)) return null
  if (!Number.isInteger(id)) return null
  return { kind: kind as ItemKind, id }
}

/** Références des éléments, dans l'ordre de la liste. */
export function refsDe(items: ReadonlyArray<ChapterItem>): ItemRef[] {
  return items.map((it) => ({ kind: it.kind, id: it.data.id }))
}

/** Déplace l'élément d'index `de` à l'index `vers` (nouvelle liste). */
export function deplacer<T>(liste: ReadonlyArray<T>, de: number, vers: number): T[] {
  const copie = [...liste]
  if (de < 0 || de >= copie.length || vers < 0 || vers >= copie.length) return copie
  const [bouge] = copie.splice(de, 1)
  copie.splice(vers, 0, bouge)
  return copie
}

/**
 * Réécrit les `sort_order` d'un contenu selon `refs` (position = rang, à
 * partir de 1). Les éléments absents de `refs` gardent le leur. Sert à la
 * mise à jour OPTIMISTE du cache avant l'écriture (`useReorderItems`).
 */
export function appliquerOrdre(
  content: ChapterContent,
  refs: ReadonlyArray<ItemRef>,
): ChapterContent {
  const rang = new Map<string, number>()
  refs.forEach((r, i) => rang.set(cleRef(r.kind, r.id), i + 1))
  const maj = <T extends { id: number }>(kind: ItemKind, liste: T[]): T[] =>
    liste.map((x) => {
      const r = rang.get(cleRef(kind, x.id))
      return r === undefined ? x : { ...x, sort_order: r }
    })
  return {
    documents: maj('document', content.documents),
    tracking_sheets: maj('tracking_sheet', content.tracking_sheets),
    signature_sheets: maj('signature_sheet', content.signature_sheets),
    intercalaires: maj('intercalaire', content.intercalaires),
  }
}
