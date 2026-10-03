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
  DbAccesClasseur,
  DbDocumentVersion,
  DbImage,
  DbChapter,
  DbClasseur,
  DbDocument,
  DbIntercalaire,
  DbMergeHistoryEntry,
  DbPeriodicite,
  DbSignatureSheet,
  DbTrackingSheet,
  ItemKind,
  PersonneClasseur,
  PointKind,
} from '#/lib/classeur/types.ts'
import { ITEM_TABLE } from '#/lib/classeur/types.ts'
import { evolutionVersion } from '#/lib/classeur/versionDocument.ts'

// ---------------------------------------------------------------------------
// Garde d'écriture : points de restauration automatiques
// ---------------------------------------------------------------------------

/** Ce que sait une écriture de sa cible, pour retrouver le classeur. */
export type RefEcriture =
  | { classeurId: number }
  | { chapterId: number }
  | { kind: ItemKind; id: number }

let gardeEcriture: ((ref: RefEcriture) => Promise<void>) | null = null

/**
 * Pose la garde appelée AVANT chaque écriture de contenu (chapitres,
 * éléments, champs du classeur) — `lib/classeur/restauration.ts` y branche
 * les points de restauration automatiques. Injectée plutôt qu'importée :
 * ce module ne doit dépendre de rien qui dépende de lui.
 */
export function definirGardeEcriture(
  garde: ((ref: RefEcriture) => Promise<void>) | null,
): void {
  gardeEcriture = garde
}

async function avantEcriture(ref: RefEcriture): Promise<void> {
  if (gardeEcriture !== null) await gardeEcriture(ref)
}

export const CLASSEURS_TABLE = 'classeur_classeurs'
export const CHAPTERS_TABLE = 'classeur_chapters'
export const PERIODICITES_TABLE = 'classeur_periodicites'
export const MERGE_HISTORY_TABLE = 'classeur_merge_history'
export const IMAGES_TABLE = 'classeur_images'

const COLS_COMMUNES = 'id, uuid, sort_order, deleted_at, created_at, updated_at'
const COLS_CLASSEUR = `${COLS_COMMUNES}, name, icon, etablissement, etablissement_complement, created_by, acces_tous`
const COLS_CHAPTER = `${COLS_COMMUNES}, classeur_id, label, icon, description`
const COLS_DOCUMENT = `${COLS_COMMUNES}, chapter_id, title, description, content, version_majeure, version_mineure`
const COLS_TRACKING = `${COLS_COMMUNES}, chapter_id, title, periodicite_id`
const COLS_SIGNATURE = `${COLS_COMMUNES}, chapter_id, title, description, nombre`
const COLS_INTERCALAIRE = `${COLS_COMMUNES}, chapter_id, title, description`
const COLS_HISTORY =
  'id, classeur_id, merged_at, kind, label, source_name, inserted, updated, unchanged, skipped, taille'
const COLS_IMAGE =
  'id, uuid, classeur_id, chemin, nom, taille, largeur, hauteur, original_chemin, original_largeur, original_hauteur, original_taille, deleted_at, created_at, updated_at, created_by'

// ---------------------------------------------------------------------------
// Images (médiathèque d'un classeur) — pas de point de restauration auto :
// l'instantané ne couvre pas les images.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Accès par classeur (2026-09-28) — écritures réservées à la gestion (RLS).
// ---------------------------------------------------------------------------

/** Mes exceptions d'accès (la RLS ne rend que les miennes, sauf gestion). */
export async function fetchMesAcces(
  userId: string,
): Promise<DbAccesClasseur[]> {
  const { data, error } = await supabase
    .from('classeur_acces')
    .select('id, classeur_id, user_id, niveau')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

/** Toutes les exceptions d'un classeur (gestion). */
export async function fetchAccesClasseur(
  classeurId: number,
): Promise<DbAccesClasseur[]> {
  const { data, error } = await supabase
    .from('classeur_acces')
    .select('id, classeur_id, user_id, niveau')
    .eq('classeur_id', classeurId)
  if (error) throw error
  return data
}

/**
 * Pose (`niveau`) ou retire (`null` = « comme tout le monde ») l'exception
 * d'une personne sur un classeur.
 */
export async function definirAcces(
  classeurId: number,
  userId: string,
  niveau: DbAccesClasseur['niveau'] | null,
): Promise<void> {
  if (niveau === null) {
    const { error } = await supabase
      .from('classeur_acces')
      .delete()
      .eq('classeur_id', classeurId)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('classeur_acces')
    .upsert(
      { classeur_id: classeurId, user_id: userId, niveau },
      { onConflict: 'classeur_id,user_id' },
    )
  if (error) throw error
}

/** Accès pour tous d'un classeur (gestion). */
export async function definirAccesTous(
  classeurId: number,
  acces_tous: DbClasseur['acces_tous'],
): Promise<void> {
  const { data, error } = await supabase
    .from(CLASSEURS_TABLE)
    .update({ acces_tous })
    .eq('id', classeurId)
    .select('id')
  if (error) throw error
  if (data.length === 0)
    throw Object.assign(new Error('Écriture refusée'), { code: '42501' })
}

/** Personnes ayant un droit sur la page Classeur (RPC, gestion seule). */
export async function fetchPersonnesClasseur(): Promise<PersonneClasseur[]> {
  const { data, error } = await supabase.rpc('classeur_personnes')
  if (error) throw error
  return data as PersonneClasseur[]
}

/**
 * Versions d'un document, la plus récente d'abord (50 au plus : borne du
 * trigger). Lecture seule : la table n'accepte aucune écriture de l'app.
 */
export async function fetchVersionsDocument(
  documentId: number,
): Promise<DbDocumentVersion[]> {
  const { data, error } = await supabase
    .from('classeur_document_versions')
    .select(
      'id, document_id, title, description, content, origine, auteur, created_at, version, raison',
    )
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchImages(classeurId: number): Promise<DbImage[]> {
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .select(COLS_IMAGE)
    .eq('classeur_id', classeurId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data
}

export interface ImageInput {
  chemin: string
  nom: string
  taille: number
  largeur: number
  hauteur: number
  original_chemin?: string | null
  original_largeur?: number | null
  original_hauteur?: number | null
  original_taille?: number | null
}

export async function insertImage(
  classeurId: number,
  input: ImageInput,
): Promise<DbImage> {
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .insert({ ...input, classeur_id: classeurId })
    .select(COLS_IMAGE)
    .single()
  if (error) throw error
  return data
}

export async function updateImage(
  id: number,
  patch: Partial<Pick<DbImage, 'nom'>>,
): Promise<void> {
  const { error } = await supabase.from(IMAGES_TABLE).update(patch).eq('id', id)
  if (error) throw error
}

export async function softDeleteImage(id: number): Promise<void> {
  const { error } = await supabase
    .from(IMAGES_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

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
  return data
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
  return data
}

export interface ClasseurInput {
  name: string
  icon: string
  etablissement: string
  etablissement_complement: string
}

/** Crée un classeur en fin de liste ; rend son identifiant. */
/**
 * Crée un classeur en fin de liste ; rend son identifiant. `acces_tous`
 * (« privé ») n'est retenu par la base que pour la gestion : sinon elle le
 * force à `lecture` (trigger `classeur_garde`).
 */
export async function createClasseur(
  input: ClasseurInput,
  acces_tous: DbClasseur['acces_tous'] = 'lecture',
): Promise<number> {
  const existants = await fetchClasseurs()
  const sort_order = (existants.at(-1)?.sort_order ?? 0) + 1
  const { data, error } = await supabase
    .from(CLASSEURS_TABLE)
    .insert({ ...input, sort_order, acces_tous })
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

export async function updateClasseur(
  id: number,
  patch: Partial<ClasseurInput>,
): Promise<void> {
  await avantEcriture({ classeurId: id })
  const { error } = await supabase
    .from(CLASSEURS_TABLE)
    .update(patch)
    .eq('id', id)
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
  return data
}

export async function fetchChapter(
  chapterId: number,
): Promise<DbChapter | null> {
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select(COLS_CHAPTER)
    .eq('id', chapterId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface ChapterInput {
  label: string
  icon: string
  description: string
}

/**
 * Options d'une création pilotée par la FUSION (`merge/apply.ts`) : `uuid`
 * du fichier (clé d'appariement des fusions suivantes) et `sort_order` déjà
 * calculé par le plan. Sans options, comportement inchangé : uuid généré par
 * la base, ajout en fin de liste.
 */
export interface OptionsCreation {
  uuid?: string
  sort_order?: number
  /** Horodatage à conserver (fusion : celui du fichier). Le trigger
   * `classeur_stamp` le respecte ; absent → now(). */
  updated_at?: string
}

/** Champs d'ordre d'un chapitre, posés par la fusion en remplacement. */
export type ChapterPatch = Partial<ChapterInput> & { sort_order?: number }

export async function createChapter(
  classeurId: number,
  input: ChapterInput,
  options: OptionsCreation = {},
): Promise<number> {
  await avantEcriture({ classeurId })
  let sort_order = options.sort_order
  if (sort_order === undefined) {
    const existants = await fetchChapters(classeurId)
    sort_order = (existants.at(-1)?.sort_order ?? 0) + 1
  }
  const ligne: Record<string, unknown> = {
    ...input,
    classeur_id: classeurId,
    sort_order,
  }
  if (options.uuid !== undefined) ligne.uuid = options.uuid
  if (options.updated_at !== undefined) ligne.updated_at = options.updated_at
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .insert(ligne)
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

/**
 * Annule la suppression douce d'un chapitre (fusion : chapitre supprimé
 * puis réimporté, règle E1 de `merge.ts` ; restauration d'un instantané).
 * `patch` réécrit ses champs dans le même aller-retour.
 */
export async function restaurerChapter(
  chapterId: number,
  patch: ChapterPatch = {},
): Promise<void> {
  await avantEcriture({ chapterId })
  const { error } = await supabase
    .from(CHAPTERS_TABLE)
    .update({ ...patch, deleted_at: null })
    .eq('id', chapterId)
  if (error) throw error
}

/**
 * Chapitres d'un classeur, SUPPRIMÉS COMPRIS (même colonnes que
 * `fetchChapters`). Réservé à la fusion : l'appariement par `uuid` regarde
 * aussi les chapitres supprimés (règle R1). Jamais mis en cache.
 */
export async function fetchChaptersAvecSupprimes(
  classeurId: number,
): Promise<DbChapter[]> {
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select(COLS_CHAPTER)
    .eq('classeur_id', classeurId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data
}

export async function updateChapter(
  chapterId: number,
  patch: ChapterPatch,
): Promise<void> {
  await avantEcriture({ chapterId })
  const { error } = await supabase
    .from(CHAPTERS_TABLE)
    .update(patch)
    .eq('id', chapterId)
  if (error) throw error
}

export async function softDeleteChapter(chapterId: number): Promise<void> {
  await avantEcriture({ chapterId })
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
      supabase
        .from(table)
        .update({ sort_order: index + 1 })
        .eq('id', id),
    ),
  )
  const echec = results.find((r) => r.error)
  if (echec?.error) throw echec.error
}

export const reorderClasseurs = (ids: number[]) => reorder(CLASSEURS_TABLE, ids)
export async function reorderChapters(ids: number[]): Promise<void> {
  if (ids.length > 0) await avantEcriture({ chapterId: ids[0] })
  await reorder(CHAPTERS_TABLE, ids)
}

// ---------------------------------------------------------------------------
// Périodicités (référentiel)
// ---------------------------------------------------------------------------

export async function fetchPeriodicites(): Promise<DbPeriodicite[]> {
  const { data, error } = await supabase
    .from(PERIODICITES_TABLE)
    .select('id, label, nombre, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Éléments d'un chapitre
// ---------------------------------------------------------------------------

async function fetchParChapitre<T>(
  table: string,
  cols: string,
  chapterIds: number[],
  avecSupprimes = false,
): Promise<T[]> {
  if (chapterIds.length === 0) return []
  let requete = supabase.from(table).select(cols).in('chapter_id', chapterIds)
  if (!avecSupprimes) requete = requete.is('deleted_at', null)
  const { data, error } = await requete
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return data as T[]
}

/**
 * Les quatre familles de PLUSIEURS chapitres, SUPPRIMÉS COMPRIS (mêmes
 * colonnes que `fetchContentParChapitres`, sans le filtre `deleted_at`).
 * Réservé à la fusion (règles R5/R6 de `merge.ts`). Jamais mis en cache.
 */
export async function fetchContentAvecSupprimes(
  chapterIds: number[],
): Promise<ChapterContent> {
  const [documents, tracking_sheets, signature_sheets, intercalaires] =
    await Promise.all([
      fetchParChapitre<DbDocument>(
        ITEM_TABLE.document,
        COLS_DOCUMENT,
        chapterIds,
        true,
      ),
      fetchParChapitre<DbTrackingSheet>(
        ITEM_TABLE.tracking_sheet,
        COLS_TRACKING,
        chapterIds,
        true,
      ),
      fetchParChapitre<DbSignatureSheet>(
        ITEM_TABLE.signature_sheet,
        COLS_SIGNATURE,
        chapterIds,
        true,
      ),
      fetchParChapitre<DbIntercalaire>(
        ITEM_TABLE.intercalaire,
        COLS_INTERCALAIRE,
        chapterIds,
        true,
      ),
    ])
  return { documents, tracking_sheets, signature_sheets, intercalaires }
}

/** Les quatre familles d'un chapitre, en quatre lectures parallèles. */
export async function fetchChapterContent(
  chapterId: number,
): Promise<ChapterContent> {
  return fetchContentParChapitres([chapterId])
}

/** Les quatre familles pour PLUSIEURS chapitres (tableau de bord, export). */
export async function fetchContentParChapitres(
  chapterIds: number[],
): Promise<ChapterContent> {
  const [documents, tracking_sheets, signature_sheets, intercalaires] =
    await Promise.all([
      fetchParChapitre<DbDocument>(
        ITEM_TABLE.document,
        COLS_DOCUMENT,
        chapterIds,
      ),
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
export async function fetchItem<T>(
  kind: ItemKind,
  id: number,
): Promise<T | null> {
  const { data, error } = await supabase
    .from(ITEM_TABLE[kind])
    .select(COLS_PAR_KIND[kind])
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data as T | null
}

export type DocumentInput = Pick<
  DbDocument,
  'title' | 'description' | 'content'
>
export type TrackingSheetInput = Pick<
  DbTrackingSheet,
  'title' | 'periodicite_id'
>
export type SignatureSheetInput = Pick<
  DbSignatureSheet,
  'title' | 'description' | 'nombre'
>
export type IntercalaireInput = Pick<DbIntercalaire, 'title' | 'description'>

export type ItemInput =
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

/**
 * Crée un élément en fin de chapitre ; rend son identifiant. `options`
 * (fusion) impose l'`uuid` du fichier et un `sort_order` déjà calculé.
 */
export async function createItem(
  chapterId: number,
  item: ItemInput,
  options: OptionsCreation = {},
): Promise<number> {
  await avantEcriture({ chapterId })
  const sort_order = options.sort_order ?? (await prochainOrdre(chapterId))
  const ligne: Record<string, unknown> = {
    ...item.input,
    chapter_id: chapterId,
    sort_order,
  }
  if (options.uuid !== undefined) ligne.uuid = options.uuid
  if (options.updated_at !== undefined) ligne.updated_at = options.updated_at
  const { data, error } = await supabase
    .from(ITEM_TABLE[item.kind])
    .insert(ligne)
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
}

/**
 * Patch d'un élément : ses champs métier, plus ce que la fusion peut poser
 * (chapitre cible, ordre, uuid du fichier, horodatage du fichier — respecté
 * par le trigger `classeur_stamp`). L'interface n'envoie que les champs.
 */
export type ItemPatch = Partial<
  DocumentInput & TrackingSheetInput & SignatureSheetInput
> & {
  chapter_id?: number
  sort_order?: number
  uuid?: string
  updated_at?: string
}

/** Champs du numéro de version d'un document (`versionDocument.ts`). */
interface PatchVersion {
  version_majeure?: number
  version_mineure?: number
  version_raison?: string
}

/**
 * NUMÉRO DE VERSION (2026-10-03) : calculé ICI, au passage de TOUTE écriture
 * d'un document par l'app (éditeur, import JSON, fusion, restauration), à
 * partir de l'état ACTUEL en base — le numéro part donc toujours du numéro
 * courant, et reprendre une ancienne version en donne un nouveau. La base
 * fige numéro et raison dans l'historique et refuse qu'un numéro recule
 * (`classeur_version_documents_2026-10-03.sql`).
 */
async function avecVersion(
  id: number,
  patch: Pick<ItemPatch, 'title' | 'description' | 'content'>,
): Promise<PatchVersion> {
  if (
    patch.title === undefined &&
    patch.description === undefined &&
    patch.content === undefined
  )
    return {}
  const { data: actuel, error } = await supabase
    .from(ITEM_TABLE.document)
    .select('title, description, content, version_majeure, version_mineure')
    .eq('id', id)
    .maybeSingle<{
      title: string
      description: string
      content: string
      version_majeure: number
      version_mineure: number
    }>()
  if (error) throw error
  if (!actuel) return {}
  const apres = {
    title: patch.title ?? actuel.title,
    description: patch.description ?? actuel.description,
    content: patch.content ?? actuel.content,
  }
  if (
    apres.title === actuel.title &&
    apres.description === actuel.description &&
    apres.content === actuel.content
  )
    return {}
  const e = evolutionVersion(actuel, apres, {
    majeure: actuel.version_majeure,
    mineure: actuel.version_mineure,
  })
  return {
    version_majeure: e.suivante.majeure,
    version_mineure: e.suivante.mineure,
    version_raison: e.saut === 'aucun' ? 'correction de forme' : e.raison,
  }
}

/** Annule la suppression douce, avec les champs du fichier s'il y en a (fusion). */
export async function restaurerItem(
  kind: ItemKind,
  id: number,
  patch: ItemPatch = {},
): Promise<void> {
  await avantEcriture({ kind, id })
  const version = kind === 'document' ? await avecVersion(id, patch) : {}
  const { error } = await supabase
    .from(ITEM_TABLE[kind])
    .update({ ...patch, ...version, deleted_at: null })
    .eq('id', id)
  if (error) throw error
}

export async function updateItem(
  kind: ItemKind,
  id: number,
  patch: ItemPatch,
): Promise<void> {
  await avantEcriture({ kind, id })
  const version = kind === 'document' ? await avecVersion(id, patch) : {}
  const { error } = await supabase
    .from(ITEM_TABLE[kind])
    .update({ ...patch, ...version })
    .eq('id', id)
  if (error) throw error
}

/** Issue d'une sauvegarde de document conditionnée à sa version. */
export type ResultatSauvegarde =
  { statut: 'ok'; updatedAt: string } | { statut: 'conflit'; updatedAt: string }

/**
 * Sauvegarde d'un document SEULEMENT s'il n'a pas changé depuis `base`
 * (son `updated_at` au début de l'édition) — amélioration n° 2 de
 * `plan/classeur-editeur-ameliorations` : deux personnes sur le même
 * document ne s'écrasent plus en silence.
 *
 * Verrou optimiste : `update … where id = ? and updated_at = base`. Zéro
 * ligne touchée peut vouloir dire trois choses, départagées par une
 * relecture : un collègue a sauvegardé (→ `conflit`, avec sa date), le
 * document a été supprimé, ou la RLS refuse l'écriture (le `update` ne
 * lève pas d'erreur dans ce cas, il ne touche rien).
 */
export async function sauvegarderDocumentSiInchange(
  id: number,
  patch: Pick<ItemPatch, 'title' | 'description' | 'content'>,
  base: string,
): Promise<ResultatSauvegarde> {
  await avantEcriture({ kind: 'document', id })
  const version = await avecVersion(id, patch)
  const { data, error } = await supabase
    .from(ITEM_TABLE.document)
    .update({ ...patch, ...version })
    .eq('id', id)
    .eq('updated_at', base)
    .select('updated_at')
  if (error) throw error
  const ecrit = (data as ReadonlyArray<{ updated_at: string }>).at(0)
  if (ecrit) return { statut: 'ok', updatedAt: ecrit.updated_at }

  const { data: actuel, error: errLecture } = await supabase
    .from(ITEM_TABLE.document)
    .select('updated_at, deleted_at')
    .eq('id', id)
    .maybeSingle<{ updated_at: string; deleted_at: string | null }>()
  if (errLecture) throw errLecture
  if (!actuel || actuel.deleted_at !== null) {
    throw new Error('Ce document a été supprimé entre-temps.')
  }
  if (Date.parse(actuel.updated_at) !== Date.parse(base)) {
    return { statut: 'conflit', updatedAt: actuel.updated_at }
  }
  // Même version, rien d'écrit : la RLS a refusé (droits retirés en cours).
  throw Object.assign(new Error('Écriture refusée'), { code: '42501' })
}

export async function softDeleteItem(
  kind: ItemKind,
  id: number,
): Promise<void> {
  await avantEcriture({ kind, id })
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
  if (refs.length > 0) await avantEcriture(refs[0])
  const now = new Date().toISOString()
  const results = await Promise.all(
    refs.map((r) =>
      supabase
        .from(ITEM_TABLE[r.kind])
        .update({ deleted_at: now })
        .eq('id', r.id),
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
  if (refs.length > 0) await avantEcriture(refs[0])
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
  await avantEcriture({ chapterId: targetChapterId })
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
  return data
}

/**
 * Une entrée d'historique AVEC son instantané (restauration : il faut le
 * `classeur_id` et le JSON dans le même aller-retour). `null` si absente.
 */
export async function fetchMergeEntry(
  entryId: number,
): Promise<(DbMergeHistoryEntry & { snapshot: unknown }) | null> {
  const { data, error } = await supabase
    .from(MERGE_HISTORY_TABLE)
    .select(`${COLS_HISTORY}, snapshot`)
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw error
  return data
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
  kind: PointKind
  label: string
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
  const { error } = await supabase
    .from(MERGE_HISTORY_TABLE)
    .delete()
    .eq('id', entryId)
  if (error) throw error
}
