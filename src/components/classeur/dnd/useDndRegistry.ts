import { createContext, useContext } from 'react'
import type { DragEndEvent, UniqueIdentifier } from '@dnd-kit/core'

import type { ItemKind } from '#/lib/classeur/types.ts'

/*
 * Registre de glisser-déposer partagé par la colonne des chapitres et le
 * contenu d'un classeur — porté de Registre (`lib/dnd/useDndRegistry.ts`).
 *
 * Un SEUL `DndContext` (voir `DndProvider`) couvre la colonne ET la page :
 * c'est ce qui permet de déposer un élément de chapitre (document, feuille…)
 * sur un chapitre de la colonne pour l'y déplacer. Chaque famille enregistre
 * son gestionnaire de fin de glisser par `type`.
 *
 * Identifiants numériques (les tables `classeur_*` sont en `bigint identity`),
 * là où Registre manipulait des chaînes.
 */

export interface ChapterDragData {
  type: 'chapter'
  chapterId: number
  label: string
  icon: string
}

export interface ClasseurDragData {
  type: 'classeur'
  classeurId: number
  title: string
  icon: string
}

/** Un élément de chapitre en cours de glisser (page chapitre, autre agent). */
export interface ItemDragData {
  type: ItemKind
  itemId: number
  title: string
  sourceChapterId: number
}

export type DragData = ChapterDragData | ClasseurDragData | ItemDragData

export type DragHandler = (event: DragEndEvent) => void

export interface DndRegistryValue {
  registerHandler: (type: string, handler: DragHandler) => void
  unregisterHandler: (type: string) => void
  activeDragType: string | null
  activeDragData: DragData | null
  /** Identifiant de la cible survolée (retour visuel). */
  activeOverId: UniqueIdentifier | null
}

export const DndRegistryContext = createContext<DndRegistryValue | null>(null)

const defaultValue: DndRegistryValue = {
  registerHandler: () => {},
  unregisterHandler: () => {},
  activeDragType: null,
  activeDragData: null,
  activeOverId: null,
}

/** Le registre partagé, ou des valeurs neutres hors `DndProvider`. */
export function useDndRegistry(): DndRegistryValue {
  return useContext(DndRegistryContext) ?? defaultValue
}

const ITEM_TYPES: ReadonlySet<string> = new Set([
  'document',
  'tracking_sheet',
  'signature_sheet',
  'intercalaire',
])

/** Vrai si le type de glisser est un élément de chapitre. */
export function estItemDrag(type: string | null): boolean {
  return type !== null && ITEM_TYPES.has(type)
}

/**
 * Identifiant sortable/droppable d'un chapitre dans la colonne. Préfixé pour
 * ne jamais entrer en collision avec les identifiants des éléments de la page
 * chapitre (qui partagent le même `DndContext`).
 */
export function chapterDropId(chapterId: number): string {
  return `chapter:${chapterId}`
}

/** Chapitre visé par un identifiant de dépôt, `null` si ce n'en est pas un. */
export function parseChapterDropId(
  id: UniqueIdentifier | null | undefined,
): number | null {
  if (typeof id !== 'string' || !id.startsWith('chapter:')) return null
  const n = Number(id.slice('chapter:'.length))
  return Number.isInteger(n) ? n : null
}
