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
  ChapterItem,
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
import { ITEM_KINDS, ITEM_TABLE } from '#/lib/classeur/types.ts'
import type {
  ChapitreBrut,
  DonneesCorbeille,
  ElementBrut,
} from '#/lib/classeur/corbeille.ts'
import { evolutionVersion } from '#/lib/classeur/versionDocument.ts'
import { agregerStats } from '#/lib/classeur/statsClasseurs.ts'
import type { StatsClasseur } from '#/lib/classeur/statsClasseurs.ts'

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

/**
 * Appelle la garde (point de restauration auto) AVANT une écriture. Jamais
 * bloquante : la garde avale ses erreurs. Exportée pour le transfert
 * (`transfertExecution.ts`), qui l'appelle sur CHAQUE classeur touché.
 */
export async function avantEcriture(ref: RefEcriture): Promise<void> {
  if (gardeEcriture !== null) await gardeEcriture(ref)
}

type RefsElements = ReadonlyArray<{ kind: ItemKind; id: number }>

let oubliDeplacement: ((refs: RefsElements) => void) | null = null

/**
 * Pose le rappel qui OUBLIE la résolution mémorisée élément → chapitre de
 * la garde (`restauration.ts`). Sans lui, un élément déplacé vers un AUTRE
 * classeur gardait son ancien chapitre en mémoire : ses écritures suivantes
 * auraient pris leur point de restauration sur le classeur de DÉPART.
 */
export function definirOubliDeplacement(
  oubli: ((refs: RefsElements) => void) | null,
): void {
  oubliDeplacement = oubli
}

/** À appeler après tout changement de chapitre d'un élément. */
export function signalerDeplacement(refs: RefsElements): void {
  if (oubliDeplacement !== null) oubliDeplacement(refs)
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
// Écritures RELUES (audit du 2026-09-28, suite de l'étape 7b)
// ---------------------------------------------------------------------------
//
// supabase-js ne lève jamais, et un `update` / `delete` refusé par la RLS rend
// 0 ligne SANS erreur. Toute écriture du service est donc relue
// (`.select('id')`) ; une ligne non touchée est :
//   - une ERREUR 42501 (`refusEcriture`) pour une modification ciblée
//     (`updateChapter`, `updateClasseur`, `updateImage`, restaurations…) ;
//   - DÉPARTAGÉE par une relecture (`departagerNonTouchees`) pour une
//     opération qui peut déjà avoir été faite par un collègue : suppression
//     douce (filtrée sur `deleted_at is null`, l'horodatage du collègue est
//     gardé), suppression physique, réordonnancement d'une ligne disparue.
//     Ligne relue ABSENTE (supprimée physiquement, ou illisible pour ce
//     compte) ou déjà dans l'état voulu : succès silencieux, l'élément ne
//     « réapparaît » pas. Ligne relue présente et pas dans l'état voulu :
//     refus RLS, erreur 42501.

/** L'erreur d'une écriture refusée (lisible par `messageErreur`). */
export function refusEcriture(): Error & { code: string } {
  return Object.assign(new Error('Écriture refusée'), { code: '42501' })
}

/** Ids de `ids` absents des lignes rendues par une écriture relue. */
function nonTouchees(ids: ReadonlyArray<number>, data: unknown): number[] {
  const rendus = new Set(
    (Array.isArray(data) ? (data as Array<{ id: number }>) : []).map(
      (l) => l.id,
    ),
  )
  return ids.filter((id) => !rendus.has(id))
}

/**
 * Relit les lignes `ids` qu'une écriture n'a pas touchées. `colonnes` doit
 * contenir `id` ; `dejaFait` dit si la ligne relue est déjà dans l'état
 * voulu. Absente ou déjà faite : rien. Sinon : 42501.
 */
async function departagerNonTouchees(
  table: string,
  ids: ReadonlyArray<number>,
  colonnes: string,
  dejaFait: (ligne: Record<string, unknown>) => boolean,
): Promise<void> {
  if (ids.length === 0) return
  const { data, error } = await supabase
    .from(table)
    .select(colonnes)
    .in('id', ids as number[])
  if (error) throw error
  const relues = data as unknown as Array<Record<string, unknown>>
  if (relues.some((l) => !dejaFait(l))) throw refusEcriture()
}

const estSupprimee = (l: Record<string, unknown>) => l.deleted_at != null

/**
 * Suppression DOUCE relue de lignes d'une même table. Seules les lignes
 * encore présentes sont marquées (l'horodatage d'un collègue qui a supprimé
 * avant nous est conservé) ; une ligne déjà supprimée ou disparue n'est pas
 * une erreur, une ligne toujours là après coup est un refus (42501).
 */
async function supprimerDoucement(
  table: string,
  ids: ReadonlyArray<number>,
  deleted_at: string = new Date().toISOString(),
): Promise<void> {
  if (ids.length === 0) return
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at })
    .in('id', ids as number[])
    .is('deleted_at', null)
    .select('id')
  if (error) throw error
  await departagerNonTouchees(
    table,
    nonTouchees(ids, data),
    'id, deleted_at',
    estSupprimee,
  )
}

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
    // Relue : 0 ligne = aucune exception à retirer (déjà « comme tout le
    // monde ») OU refus RLS ; une relecture départage.
    const { data, error } = await supabase
      .from('classeur_acces')
      .delete()
      .eq('classeur_id', classeurId)
      .eq('user_id', userId)
      .select('id')
    if (error) throw error
    if ((data as unknown[]).length > 0) return
    const { data: reste, error: errLecture } = await supabase
      .from('classeur_acces')
      .select('id')
      .eq('classeur_id', classeurId)
      .eq('user_id', userId)
    if (errLecture) throw errLecture
    if ((reste as unknown[]).length > 0) throw refusEcriture()
    return
  }
  // L'upsert n'a pas besoin de relecture : un refus RLS (insert comme
  // `on conflict do update`) y lève une erreur.
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
  exigerUneLigne(data)
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
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
}

/**
 * Dernier temps de la suppression d'une image (`images.ts`) : la fiche est
 * marquée. Déjà marquée par un collègue : succès (voir `supprimerDoucement`).
 */
export async function softDeleteImage(id: number): Promise<void> {
  await supprimerDoucement(IMAGES_TABLE, [id])
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

/**
 * Date de modification du tableau des classeurs : UNE lecture sur les
 * chapitres non supprimés, chacun avec son document non supprimé le plus
 * récent (embarqué filtré et borné à une ligne). La RLS ne rend que les
 * chapitres des classeurs lisibles.
 */
export async function fetchStatsClasseurs(): Promise<StatsClasseur[]> {
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select('classeur_id, updated_at, dernier:classeur_documents(updated_at)')
    .is('deleted_at', null)
    .is('dernier.deleted_at', null)
    .order('updated_at', { referencedTable: 'dernier', ascending: false })
    .limit(1, { referencedTable: 'dernier' })
  if (error) throw error
  return agregerStats(data)
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
  const { data, error } = await supabase
    .from(CLASSEURS_TABLE)
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
}

/**
 * Suppression DOUCE d'un classeur : ses chapitres et éléments restent en
 * base mais ne sont plus atteignables par la navigation. La suppression
 * physique (RLS : gestion seule) n'est pas exposée par l'app.
 */
export async function softDeleteClasseur(id: number): Promise<void> {
  await supprimerDoucement(CLASSEURS_TABLE, [id])
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
 * Restauration depuis la CORBEILLE (étape 6), dernier paramètre de
 * `restaurerChapter` / `restaurerItem`. Sans lui, comportement d'origine,
 * celui de la FUSION : son plan pose lui-même `sort_order` et `chapter_id`,
 * et ses points auto sont suspendus (`sansPointsAuto`) — rien n'y change.
 *
 * Avec lui :
 *   - la garde d'écriture (point de restauration auto) part sur le
 *     CLASSEUR : par élément ou par chapitre, elle relit la ligne en
 *     excluant les supprimés et ne trouverait rien ;
 *   - la ligne revient EN FIN de son chapitre (élément) ou du classeur
 *     (chapitre), pas à son ancienne place, occupée entre-temps ;
 *   - un refus RLS (0 ligne, sans erreur côté supabase-js) devient une
 *     erreur 42501.
 */
export interface OptionsCorbeille {
  classeurId: number
  /** Élément : chapitre d'arrivée (par défaut, son chapitre d'origine). */
  chapterId?: number
}

/** Une écriture `.select('id')` qui n'a touché aucune ligne = refus RLS. */
export function exigerUneLigne(data: unknown): void {
  if (!Array.isArray(data) || data.length === 0) {
    throw Object.assign(new Error('Écriture refusée'), { code: '42501' })
  }
}

/**
 * Annule la suppression douce d'un chapitre (fusion : chapitre supprimé
 * puis réimporté, règle E1 de `merge.ts` ; restauration d'un instantané).
 * `patch` réécrit ses champs dans le même aller-retour.
 */
export async function restaurerChapter(
  chapterId: number,
  patch: ChapterPatch = {},
  corbeille?: OptionsCorbeille,
): Promise<void> {
  if (corbeille !== undefined) {
    // Corbeille (étape 6) : garde sur le CLASSEUR (la ref par chapitre ne
    // résout pas un chapitre supprimé : le point auto serait sauté), fin de
    // la liste des chapitres, refus RLS détecté.
    await avantEcriture({ classeurId: corbeille.classeurId })
    const existants = await fetchChapters(corbeille.classeurId)
    const sort_order = Math.max(0, ...existants.map((c) => c.sort_order)) + 1
    const { data, error } = await supabase
      .from(CHAPTERS_TABLE)
      .update({ ...patch, deleted_at: null, sort_order })
      .eq('id', chapterId)
      .select('id')
    if (error) throw error
    exigerUneLigne(data)
    return
  }
  await avantEcriture({ chapterId })
  // Relue (fusion, restauration d'un point) : un refus RLS au milieu d'un
  // plan remonte au lieu d'un succès annoncé ; l'instantané pris avant le
  // plan reste le filet.
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .update({ ...patch, deleted_at: null })
    .eq('id', chapterId)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
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
  const { data, error } = await supabase
    .from(CHAPTERS_TABLE)
    .update(patch)
    .eq('id', chapterId)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
}

/** Déjà supprimé par un collègue : succès (voir `supprimerDoucement`). */
export async function softDeleteChapter(chapterId: number): Promise<void> {
  await avantEcriture({ chapterId })
  await supprimerDoucement(CHAPTERS_TABLE, [chapterId])
}

/**
 * Réordonne des lignes : `ids` dans l'ordre voulu, `sort_order` = position.
 * Une écriture par ligne (pas de RPC) ; les listes font quelques dizaines de
 * lignes au plus. Les écritures partent en parallèle, sous le plafond global
 * de six requêtes (`lib/requestQueue.ts`).
 *
 * Relues : une ligne non touchée encore lisible est un refus RLS (42501) ;
 * une ligne disparue entre-temps n'a plus d'ordre à recevoir (succès). Le
 * lot n'est pas atomique : sur erreur, l'appelant annule son affichage
 * optimiste et relit (`useClasseur.ts`).
 */
async function reorder(
  lignes: ReadonlyArray<{ table: string; id: number }>,
): Promise<void> {
  const results = await Promise.all(
    lignes.map((l, index) =>
      supabase
        .from(l.table)
        .update({ sort_order: index + 1 })
        .eq('id', l.id)
        .select('id'),
    ),
  )
  const echec = results.find((r) => r.error)
  if (echec?.error) throw echec.error
  const parTable = new Map<string, number[]>()
  lignes.forEach((l, i) => {
    if (nonTouchees([l.id], results[i].data).length === 0) return
    parTable.set(l.table, [...(parTable.get(l.table) ?? []), l.id])
  })
  for (const [table, ids] of parTable) {
    await departagerNonTouchees(table, ids, 'id', () => false)
  }
}

export const reorderClasseurs = (ids: number[]) =>
  reorder(ids.map((id) => ({ table: CLASSEURS_TABLE, id })))
export async function reorderChapters(ids: number[]): Promise<void> {
  if (ids.length > 0) await avantEcriture({ chapterId: ids[0] })
  await reorder(ids.map((id) => ({ table: CHAPTERS_TABLE, id })))
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

/**
 * Éléments par références (non supprimés), une lecture par famille citée —
 * transfert (étape 7b) : relire FRAIS ce qui va être copié ou déplacé, sans
 * charger tout le classeur. Ordre quelconque ; un absent est omis.
 */
export async function fetchItemsParRefs(
  refs: ReadonlyArray<{ kind: ItemKind; id: number }>,
): Promise<ChapterItem[]> {
  const familles = await Promise.all(
    ITEM_KINDS.map(async (kind) => {
      const ids = refs.filter((r) => r.kind === kind).map((r) => r.id)
      if (ids.length === 0) return []
      const { data, error } = await supabase
        .from(ITEM_TABLE[kind])
        .select(COLS_PAR_KIND[kind])
        .in('id', ids)
        .is('deleted_at', null)
      if (error) throw error
      return (data as unknown as ChapterItem['data'][]).map(
        (d) => ({ kind, data: d }) as ChapterItem,
      )
    }),
  )
  return familles.flat()
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
export async function prochainOrdre(chapterId: number): Promise<number> {
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
): Promise<{ version: PatchVersion; base?: string }> {
  if (
    patch.title === undefined &&
    patch.description === undefined &&
    patch.content === undefined
  )
    return { version: {} }
  const { data: actuel, error } = await supabase
    .from(ITEM_TABLE.document)
    .select(
      'title, description, content, version_majeure, version_mineure, updated_at',
    )
    .eq('id', id)
    .maybeSingle<{
      title: string
      description: string
      content: string
      version_majeure: number
      version_mineure: number
      updated_at: string
    }>()
  if (error) throw error
  if (!actuel) return { version: {} }
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
    return { version: {} }
  const e = evolutionVersion(actuel, apres, {
    majeure: actuel.version_majeure,
    mineure: actuel.version_mineure,
  })
  return {
    version: {
      version_majeure: e.suivante.majeure,
      version_mineure: e.suivante.mineure,
      version_raison: e.raison || 'correction de forme',
    },
    base: actuel.updated_at,
  }
}

/**
 * Écrit un document AVEC son numéro de version, sans course (audit du
 * 2026-10-04) : le numéro est calculé sur l'état lu, et l'écriture n'a
 * lieu que si cet état n'a pas changé (`updated_at`) — sinon relecture et
 * nouveau calcul. Sans cela, deux enregistrements rapprochés pouvaient
 * porter le MÊME numéro pour deux textes différents.
 */
async function ecrireDocumentVersionne(
  id: number,
  patch: ItemPatch,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // REFUS RLS (étape 7b) : un `update` refusé rend 0 ligne SANS erreur.
  // Avant, l'écriture finale n'était pas relue : un import ou une
  // sauvegarde refusés se disaient réussis. Toute écriture est désormais
  // relue (`.select('id')`) ; 0 ligne devient une erreur 42501, sauf quand
  // c'est une COURSE (l'état relu a changé : on recalcule le numéro).
  let basePrecedente: string | undefined
  for (let essai = 0; essai < 3; essai++) {
    const { version, base } = await avecVersion(id, patch)
    const q = supabase
      .from(ITEM_TABLE.document)
      .update({ ...patch, ...version, ...extra })
      .eq('id', id)
    if (base === undefined) {
      const { data, error } = await q.select('id')
      if (error) throw error
      exigerUneLigne(data)
      return
    }
    // Même état relu qu'à l'essai précédent, où rien n'avait été écrit :
    // ce n'est pas une course, c'est la RLS qui refuse.
    if (base === basePrecedente) exigerUneLigne([])
    const { data, error } = await q.eq('updated_at', base).select('id')
    if (error) throw error
    if ((data as unknown[]).length > 0) return
    basePrecedente = base
  }
  // Trois écritures concurrentes de suite : on écrit sans la garde
  // (comportement d'avant le versionnage), mais relu.
  const { version } = await avecVersion(id, patch)
  const { data, error } = await supabase
    .from(ITEM_TABLE.document)
    .update({ ...patch, ...version, ...extra })
    .eq('id', id)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
}

/**
 * Branche corbeille de `restaurerItem` (voir `OptionsCorbeille`). Sans
 * champ de texte, aucun numéro de version ne change : restaurer n'est pas
 * modifier. Le chapitre d'arrivée est celui de l'élément, sauf choix
 * contraire (orphelin remis ailleurs).
 */
async function restaurerItemCorbeille(
  kind: ItemKind,
  id: number,
  patch: ItemPatch,
  corbeille: OptionsCorbeille,
): Promise<void> {
  await avantEcriture({ classeurId: corbeille.classeurId })
  let chapterId = corbeille.chapterId
  if (chapterId === undefined) {
    const { data: ligne, error } = await supabase
      .from(ITEM_TABLE[kind])
      .select('chapter_id')
      .eq('id', id)
      .maybeSingle<{ chapter_id: number }>()
    if (error) throw error
    if (!ligne) {
      throw Object.assign(new Error('Écriture refusée'), { code: '42501' })
    }
    chapterId = ligne.chapter_id
  }
  const sort_order = await prochainOrdre(chapterId)
  const place = { deleted_at: null, chapter_id: chapterId, sort_order }
  if (
    kind === 'document' &&
    (patch.title !== undefined ||
      patch.description !== undefined ||
      patch.content !== undefined)
  ) {
    await ecrireDocumentVersionne(id, patch, place)
    return
  }
  const { data, error } = await supabase
    .from(ITEM_TABLE[kind])
    .update({ ...patch, ...place })
    .eq('id', id)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
}

/**
 * Corbeille : un élément ORPHELIN (son chapitre est aussi supprimé) revient
 * AVEC son chapitre. Le chapitre d'abord — sinon l'élément reviendrait dans
 * un chapitre invisible si la seconde écriture échouait —, séquentiel.
 */
export async function restaurerAvecChapitre(
  classeurId: number,
  kind: ItemKind,
  id: number,
  chapterId: number,
): Promise<void> {
  await restaurerChapter(chapterId, {}, { classeurId })
  await restaurerItem(kind, id, {}, { classeurId, chapterId })
}

/**
 * Tout le classeur pour la corbeille : chapitres et éléments, SUPPRIMÉS
 * COMPRIS, en colonnes légères (jamais le Markdown). Les non supprimés
 * servent au nom du chapitre d'origine, aux chapitres d'arrivée et au
 * compte des éléments qu'un chapitre supprimé emporte. Titres seulement,
 * aucune donnée nominative : persistable. Lue à l'ouverture du dialogue.
 */
export async function fetchCorbeille(
  classeurId: number,
): Promise<DonneesCorbeille> {
  const { data: chapitres, error } = await supabase
    .from(CHAPTERS_TABLE)
    .select('id, label, sort_order, deleted_at')
    .eq('classeur_id', classeurId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  const lus = chapitres as ChapitreBrut[]
  if (lus.length === 0) return { chapitres: [], elements: [] }
  const ids = lus.map((c) => c.id)
  const familles = await Promise.all(
    ITEM_KINDS.map(async (kind) => {
      const { data, error: err } = await supabase
        .from(ITEM_TABLE[kind])
        .select('id, chapter_id, title, deleted_at')
        .in('chapter_id', ids)
      if (err) throw err
      return (data as Array<Omit<ElementBrut, 'kind'>>).map(
        (e): ElementBrut => ({ ...e, kind }),
      )
    }),
  )
  return { chapitres: lus, elements: familles.flat() }
}

/** Annule la suppression douce, avec les champs du fichier s'il y en a (fusion). */
export async function restaurerItem(
  kind: ItemKind,
  id: number,
  patch: ItemPatch = {},
  corbeille?: OptionsCorbeille,
): Promise<void> {
  if (corbeille !== undefined) {
    await restaurerItemCorbeille(kind, id, patch, corbeille)
    return
  }
  await avantEcriture({ kind, id })
  if (kind === 'document') {
    await ecrireDocumentVersionne(id, patch, { deleted_at: null })
    return
  }
  // Relue (fusion, restauration d'un point) : voir `restaurerChapter`.
  const { data, error } = await supabase
    .from(ITEM_TABLE[kind])
    .update({ ...patch, deleted_at: null })
    .eq('id', id)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
}

export async function updateItem(
  kind: ItemKind,
  id: number,
  patch: ItemPatch,
): Promise<void> {
  await avantEcriture({ kind, id })
  if (kind === 'document') {
    await ecrireDocumentVersionne(id, patch)
    return
  }
  // Relue : un refus RLS (0 ligne, sans erreur) n'est plus un succès.
  const { data, error } = await supabase
    .from(ITEM_TABLE[kind])
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) throw error
  exigerUneLigne(data)
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
  const { version } = await avecVersion(id, patch)
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
  await supprimerDoucement(ITEM_TABLE[kind], [id])
}

/**
 * Suppression douce groupée (sélection multiple) : une écriture par famille,
 * en parallèle. Déjà supprimés par un collègue : succès ; le moindre refus
 * RLS : 42501 (les autres familles ont pu être supprimées : l'appelant
 * relit).
 */
export async function softDeleteItems(
  refs: ReadonlyArray<{ kind: ItemKind; id: number }>,
): Promise<void> {
  if (refs.length > 0) await avantEcriture(refs[0])
  const now = new Date().toISOString()
  await Promise.all(
    ITEM_KINDS.map((kind) =>
      supprimerDoucement(
        ITEM_TABLE[kind],
        refs.filter((r) => r.kind === kind).map((r) => r.id),
        now,
      ),
    ),
  )
}

/**
 * Réordonne les éléments d'un chapitre, toutes natures confondues :
 * `refs` dans l'ordre voulu. Relu (voir `reorder`).
 */
export async function reorderItems(
  refs: ReadonlyArray<{ kind: ItemKind; id: number }>,
): Promise<void> {
  if (refs.length > 0) await avantEcriture(refs[0])
  await reorder(refs.map((r) => ({ table: ITEM_TABLE[r.kind], id: r.id })))
}

/**
 * Déplace des éléments vers un autre chapitre, en fin de liste.
 *
 * Corrigé à l'étape 7b :
 *   - point de restauration sur l'ORIGINE puis sur l'ARRIVÉE (avant : la
 *     seule arrivée). La garde résout l'origine par le premier élément
 *     (élément → chapitre → classeur) : elle passe donc AVANT le
 *     déplacement. Une sélection vient d'un seul chapitre ;
 *   - chaque écriture est relue : un refus RLS (0 ligne, aucune erreur)
 *     arrête le déplacement par une erreur 42501 au lieu d'un succès
 *     annoncé. Les éléments déjà déplacés le restent (séquentiel).
 */
export async function moveItems(
  refs: ReadonlyArray<{ kind: ItemKind; id: number }>,
  targetChapterId: number,
): Promise<void> {
  if (refs.length === 0) return
  await avantEcriture(refs[0])
  await avantEcriture({ chapterId: targetChapterId })
  let ordre = await prochainOrdre(targetChapterId)
  for (const r of refs) {
    const { data, error } = await supabase
      .from(ITEM_TABLE[r.kind])
      .update({ chapter_id: targetChapterId, sort_order: ordre })
      .eq('id', r.id)
      .select('id')
    if (error) throw error
    exigerUneLigne(data)
    signalerDeplacement([r])
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

/**
 * Suppression PHYSIQUE d'une entrée (RLS : gestion seule, et le rang
 * `ecriture` sur les seuls points `auto`). Relue : une entrée encore là
 * après coup est un refus (42501 — que l'élagage ignore, et que le
 * dialogue affiche) ; déjà supprimée par un collègue : succès.
 */
export async function deleteMergeHistory(entryId: number): Promise<void> {
  const { data, error } = await supabase
    .from(MERGE_HISTORY_TABLE)
    .delete()
    .eq('id', entryId)
    .select('id')
  if (error) throw error
  await departagerNonTouchees(
    MERGE_HISTORY_TABLE,
    nonTouchees([entryId], data),
    'id',
    () => false,
  )
}
