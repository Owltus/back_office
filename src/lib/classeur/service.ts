/*
 * Accès Supabase de la page Classeur (tables `classeur_*`,
 * supabase/classeur_2026-09-25.sql). Convention d'erreur maison :
 * { data, error } → if (error) throw error.
 *
 * Remplace l'adaptateur SQLite générique de Registre (`getAll(table,
 * filters)`) par des fonctions typées à colonnes explicites. Règles :
 *   - jamais de `select('*')` ;
 *   - toute lecture filtre `deleted_at is null` (suppression douce) ;
 *   - toute `queryFn` rend des objets nus (cache persisté, `survitAuJson`) ;
 *   - la sécurité réelle est la RLS : `lecture` lit, `ecriture` écrit,
 *     `gestion` supprime physiquement un classeur. Les gardes UI (`can`)
 *     sont ergonomiques.
 */

import { supabase } from '#/lib/supabase.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbDocument,
  DbIntercalaire,
  DbMergeHistoryEntry,
  DbPeriodicite,
  DbSignatureSheet,
  DbTrackingSheet,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { ITEM_TABLE } from '#/lib/classeur/types.ts'

export const CLASSEURS_TABLE = 'classeur_classeurs'
export const CHAPTERS_TABLE = 'classeur_chapters'
export const PERIODICITES_TABLE = 'classeur_periodicites'
export const MERGE_HISTORY_TABLE = 'classeur_merge_history'

const COLS_COMMUNES = 'id, uuid, sort_order, deleted_at, created_at, updated_at'
const COLS_CLASSEUR = `${COLS_COMMUNES}, name, icon, etablissement, etablissement_complement`
const COLS_CHAPTER = `${COLS_COMMUNES}, classeur_id, label, icon, description`
const COLS_DOCUMENT = `${COLS_COMMUNES}, chapter_id, title, description, content`
const COLS_TRACKING = `${COLS_COMMUNES}, chapter_id, title, periodicite_id`
const COLS_SIGNATURE = `${COLS_COMMUNES}, chapter_id, title, description, nombre`
const COLS_INTERCALAIRE = `${COLS_COMMUNES}, chapter_id, title, description`
const COLS_HISTORY =
  'id, classeur_id, merged_at, source_name, inserted, updated, unchanged, skipped'

// ---------------------------------------------------------------------------
// Classeurs
// ---------------------------------------------------------------------------

export async function fetchClasseurs(): Promise<DbClasseur[]> {
  const { data, error } = await supabase
    .from(CLASSEURS_TABLE)
    .select(COLS_CLASSEUR)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data as DbClasseur[]
}

/** `null` si absent ou supprimé (la page affiche « introuvable »). */
export async function fetchClasseur(id: number): Promise<DbClasseur | null> {
  const { data, error } = await supabase
    .from(CLASSEURS_TABLE)
    .select(COLS_CLASSEUR)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data as DbClasseur | null
}

export interface ClasseurInput {
  name: string
  icon: string
  etablissement: string
  etablissement_complement: string
}

/** Crée un classeur en fin de liste ; rend son identifiant. */
export async function createClasseur(input: ClasseurInput): Promise<number> {
  const existants = await fetchClasseurs()
  const sort_order = (existants.at(-1)?.sort_order ?? 0) + 1
  const { data, error } = await supabase
    .from(CLASSEURS_TABLE)
    .insert({ ...input, sort_order })
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

export async function updateClasseur(
  id: number,
  patch: Partial<ClasseurInput>,
): Promise<void> {
  const { error } = await supabase.from(CLASSEURS_TABLE).update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Suppression DOUCE d'un classeur : ses chapitres et éléments restent en
 * base mais ne sont plus atteignables par la navigation. La suppression
 * physique (RLS : gestion seule) n'est pas exposée par l'app.
 */
export async function softDeleteClasseur(id: number): Promise<void> {
  const { error } = await supabase
    .from(CLASSEURS_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Chapitres
// ---------------------------------------------------------------------------

export async function fetchChapters(classeurId: number): Promise<DbChapter[]> {
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select(COLS_CHAPTER)
    .eq('classeur_id', classeurId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data as DbChapter[]
}

export async function fetchChapter(chapterId: number): Promise<DbChapter | null> {
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select(COLS_CHAPTER)
    .eq('id', chapterId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data as DbChapter | null
}

export interface ChapterInput {
  label: string
  icon: string
  description: string
}

export async function createChapter(
  classeurId: number,
  input: ChapterInput,
): Promise<number> {
  const existants = await fetchChapters(classeurId)
  const sort_order = (existants.at(-1)?.sort_order ?? 0) + 1
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .insert({ ...input, classeur_id: classeurId, sort_order })
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

export async function updateChapter(
  chapterId: number,
  patch: Partial<ChapterInput>,
): Promise<void> {
  const { error } = await supabase.from(CHAPTERS_TABLE).update(patch).eq('id', chapterId)
  if (error) throw error
}

export async function softDeleteChapter(chapterId: number): Promise<void> {
  const { error } = await supabase
    .from(CHAPTERS_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', chapterId)
  if (error) throw error
}

/**
 * Réordonne des lignes : `ids` dans l'ordre voulu, `sort_order` = position.
 * Une écriture par ligne (pas de RPC) ; les listes font quelques dizaines de
 * lignes au plus. Les écritures partent en parallèle, sous le plafond global
 * de six requêtes (`lib/requestQueue.ts`).
 */
async function reorder(table: string, ids: number[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, index) =>
      supabase.from(table).update({ sort_order: index + 1 }).eq('id', id),
    ),
  )
  const echec = results.find((r) => r.error)
  if (echec?.error) throw echec.error
}

export const reorderClasseurs = (ids: number[]) => reorder(CLASSEURS_TABLE, ids)
export const reorderChapters = (ids: number[]) => reorder(CHAPTERS_TABLE, ids)

// ---------------------------------------------------------------------------
// Périodicités (référentiel)
// ---------------------------------------------------------------------------

export async function fetchPeriodicites(): Promise<DbPeriodicite[]> {
  const { data, error } = await supabase
    .from(PERIODICITES_TABLE)
    .select('id, label, nombre, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data as DbPeriodicite[]
}

// ---------------------------------------------------------------------------
// Éléments d'un chapitre
// ---------------------------------------------------------------------------

async function fetchParChapitre<T>(
  table: string,
  cols: string,
  chapterIds: number[],
): Promise<T[]> {
  if (chapterIds.length === 0) return []
  const { data, error } = await supabase
    .from(table)
    .select(cols)
    .in('chapter_id', chapterIds)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data as T[]
}

/** Les quatre familles d'un chapitre, en quatre lectures parallèles. */
export async function fetchChapterContent(chapterId: number): Promise<ChapterContent> {
  return fetchContentParChapitres([chapterId])
}

/** Les quatre familles pour PLUSIEURS chapitres (tableau de bord, export). */
export async function fetchContentParChapitres(
  chapterIds: number[],
): Promise<ChapterContent> {
  const [documents, tracking_sheets, signature_sheets, intercalaires] =
    await Promise.all([
      fetchParChapitre<DbDocument>(ITEM_TABLE.document, COLS_DOCUMENT, chapterIds),
      fetchParChapitre<DbTrackingSheet>(
        ITEM_TABLE.tracking_sheet,
        COLS_TRACKING,
        chapterIds,
      ),
      fetchParChapitre<DbSignatureSheet>(
        ITEM_TABLE.signature_sheet,
        COLS_SIGNATURE,
        chapterIds,
      ),
      fetchParChapitre<DbIntercalaire>(
        ITEM_TABLE.intercalaire,
        COLS_INTERCALAIRE,
        chapterIds,
      ),
    ])
  return { documents, tracking_sheets, signature_sheets, intercalaires }
}

/** Tout le contenu d'un classeur : chapitres + les quatre familles. */
export async function fetchClasseurContent(classeurId: number): Promise<{
  chapters: DbChapter[]
  content: ChapterContent
}> {
  const chapters = await fetchChapters(classeurId)
  const content = await fetchContentParChapitres(chapters.map((c) => c.id))
  return { chapters, content }
}

const COLS_PAR_KIND: Record<ItemKind, string> = {
  document: COLS_DOCUMENT,
  tracking_sheet: COLS_TRACKING,
  signature_sheet: COLS_SIGNATURE,
  intercalaire: COLS_INTERCALAIRE,
}

/** Un élément par nature et identifiant, `null` si absent ou supprimé. */
export async function fetchItem<T>(kind: ItemKind, id: number): Promise<T | null> {
  const { data, error } = await supabase
    .from(ITEM_TABLE[kind])
    .select(COLS_PAR_KIND[kind])
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data as T | null
}

export type DocumentInput = Pick<DbDocument, 'title' | 'description' | 'content'>
export type TrackingSheetInput = Pick<DbTrackingSheet, 'title' | 'periodicite_id'>
export type SignatureSheetInput = Pick<DbSignatureSheet, 'title' | 'description' | 'nombre'>
export type IntercalaireInput = Pick<DbIntercalaire, 'title' | 'description'>

type ItemInput =
  | { kind: 'document'; input: DocumentInput }
  | { kind: 'tracking_sheet'; input: TrackingSheetInput }
  | { kind: 'signature_sheet'; input: SignatureSheetInput }
  | { kind: 'intercalaire'; input: IntercalaireInput }

/** Prochain `sort_order` d'un chapitre, toutes natures confondues. */
async function prochainOrdre(chapterId: number): Promise<number> {
  const contenu = await fetchChapterContent(chapterId)
  const max = Math.max(
    0,
    ...contenu.documents.map((d) => d.sort_order),
    ...contenu.tracking_sheets.map((d) => d.sort_order),
    ...contenu.signature_sheets.map((d) => d.sort_order),
    ...contenu.intercalaires.map((d) => d.sort_order),
  )
  return max + 1
}

/** Crée un élément en fin de chapitre ; rend son identifiant. */
export async function createItem(chapterId: number, item: ItemInput): Promise<number> {
  const sort_order = await prochainOrdre(chapterId)
  const { data, error } = await supabase
    .from(ITEM_TABLE[item.kind])
    .insert({ ...item.input, chapter_id: chapterId, sort_order })
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

export async function updateItem(
  kind: ItemKind,
  id: number,
  patch: Partial<DocumentInput & TrackingSheetInput & SignatureSheetInput>,
): Promise<void> {
  const { error } = await supabase.from(ITEM_TABLE[kind]).update(patch).eq('id', id)
  if (error) throw error
}

export async function softDeleteItem(kind: ItemKind, id: number): Promise<void> {
  const { error } = await supabase
    .from(ITEM_TABLE[kind])
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Suppression douce groupée (sélection multiple). */
export async function softDeleteItems(
  refs: ReadonlyArray<{ kind: ItemKind; id: number }>,
): Promise<void> {
  const now = new Date().toISOString()
  const results = await Promise.all(
    refs.map((r) =>
      supabase.from(ITEM_TABLE[r.kind]).update({ deleted_at: now }).eq('id', r.id),
    ),
  )
  const echec = results.find((r) => r.error)
  if (echec?.error) throw echec.error
}

/**
 * Réordonne les éléments d'un chapitre, toutes natures confondues :
 * `refs` dans l'ordre voulu.
 */
export async function reorderItems(
  refs: ReadonlyArray<{ kind: ItemKind; id: number }>,
): Promise<void> {
  const results = await Promise.all(
    refs.map((r, index) =>
      supabase
        .from(ITEM_TABLE[r.kind])
        .update({ sort_order: index + 1 })
        .eq('id', r.id),
    ),
  )
  const echec = results.find((r) => r.error)
  if (echec?.error) throw echec.error
}

/** Déplace des éléments vers un autre chapitre, en fin de liste. */
export async function moveItems(
  refs: ReadonlyArray<{ kind: ItemKind; id: number }>,
  targetChapterId: number,
): Promise<void> {
  let ordre = await prochainOrdre(targetChapterId)
  for (const r of refs) {
    const { error } = await supabase
      .from(ITEM_TABLE[r.kind])
      .update({ chapter_id: targetChapterId, sort_order: ordre })
      .eq('id', r.id)
    if (error) throw error
    ordre += 1
  }
}

// ---------------------------------------------------------------------------
// Historique des fusions
// ---------------------------------------------------------------------------

export async function fetchMergeHistory(
  classeurId: number,
): Promise<DbMergeHistoryEntry[]> {
  const { data, error } = await supabase
    .from(MERGE_HISTORY_TABLE)
    .select(COLS_HISTORY)
    .eq('classeur_id', classeurId)
    .order('merged_at', { ascending: false })
  if (error) throw error
  return data as DbMergeHistoryEntry[]
}

/** L'instantané JSON d'une entrée (lu à part : volumineux). */
export async function fetchMergeSnapshot(entryId: number): Promise<unknown> {
  const { data, error } = await supabase
    .from(MERGE_HISTORY_TABLE)
    .select('snapshot')
    .eq('id', entryId)
    .single()
  if (error) throw error
  return data.snapshot
}

export async function insertMergeHistory(entry: {
  classeur_id: number
  source_name: string
  inserted: number
  updated: number
  unchanged: number
  skipped: number
  snapshot: unknown
}): Promise<number> {
  const { data, error } = await supabase
    .from(MERGE_HISTORY_TABLE)
    .insert(entry)
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

/** Suppression PHYSIQUE d'une entrée (RLS : gestion seule). */
export async function deleteMergeHistory(entryId: number): Promise<void> {
  const { error } = await supabase.from(MERGE_HISTORY_TABLE).delete().eq('id', entryId)
  if (error) throw error
}
