/*
 * TRANSFERT vers un autre classeur — EXÉCUTION (étape 7b du plan
 * `plan/classeur-fonctions-2026-10-04/`). Le plan est PUR et prouvé
 * (`transfert.ts`, étape 7a) ; ce module le lit dans l'état frais de la base
 * puis l'exécute, dans l'ordre, sans RPC (D7) :
 *
 *   1. points de restauration de l'ORIGINE puis de l'ARRIVÉE ;
 *   2. pour chaque image utilisée : copie du fichier d'affichage, de
 *      l'original s'il existe (`storage.copy`, JAMAIS `upsert` : aucune
 *      policy UPDATE sur `storage.objects`), puis sa fiche `classeur_images` ;
 *   3. les éléments : insert (copie, version 1.0, sans uuid) ou update du
 *      chapitre (déplacement, D10 = A ; chemins réécrits, numéro gardé).
 *
 * DROITS (lus au catalogue le 2026-10-04, D21 = B) : `storage.copy` exige la
 * LECTURE de la source (`classeur_lecture_ok`, dossier d'origine) et
 * l'INSERT de la destination (`classeur_write_ok`, dossier d'arrivée,
 * extension `webp` — `x.original.webp` compris) ; la fiche, `classeur_write_ok`
 * de l'arrivée ; un déplacement, `USING` sur l'origine et `WITH CHECK` sur
 * l'arrivée. D6 (copier exige AUSSI l'écriture de l'origine) est une règle
 * de l'app, vérifiée ici par `peutTransferer` avant toute lecture.
 *
 * POINTS DE RESTAURATION. `avantEcriture` sur chaque classeur, AVANT la
 * première écriture, hors `sansPointsAuto` (qui les sauterait). C'est la
 * garde des points AUTOMATIQUES (`restauration.ts::assurerPointAuto`) :
 *   - au plus un point auto par quart d'heure et par classeur : si un point
 *     auto a moins de 15 min, aucun nouveau n'est pris, et c'est lui qui
 *     sert de retour arrière (comme pour toute autre écriture) ;
 *   - elle ne BLOQUE jamais : un point impossible (réseau, droits) est
 *     journalisé (`console.warn`) et le transfert continue. Choix existant du
 *     Classeur (« la sauvegarde est un filet, pas un verrou ») ;
 *   - les écritures qui suivent passent par `supabase` directement, pas par
 *     les fonctions gardées du service : aucun autre point n'est tenté, et
 *     surtout aucun sur un élément dont la résolution vient de changer.
 *
 * ÉCHEC. Toute écriture est relue (`.select('id')`, 0 ligne = refus RLS).
 * Au premier échec tout s'arrête, et les copies d'images faites par CETTE
 * opération sont retirées — SAUF celles qu'un élément déjà écrit référence
 * (un document écrit ne doit jamais pointer vers un fichier absent). Retrait
 * d'une image : la fiche est d'abord marquée supprimée (relue), PUIS ses
 * fichiers sont retirés ; si la fiche ne peut pas être marquée, ses
 * fichiers restent, et si les fichiers ne partent pas (la policy delete
 * refuse SANS erreur), la fiche revit — toujours « fiche vivante = fichiers
 * présents ». Chaque pas du retour arrière a un second essai. Les éléments déjà écrits le restent : l'erreur le dit, et les
 * points pris en tête permettent de revenir en arrière.
 */

import {
  BUCKET_IMAGES,
  cheminImage,
  cheminOriginalImage,
} from '#/lib/classeur/images.ts'
import {
  IMAGES_TABLE,
  avantEcriture,
  exigerUneLigne,
  fetchChapter,
  fetchChapters,
  fetchImages,
  fetchItemsParRefs,
  prochainOrdre,
  signalerDeplacement,
} from '#/lib/classeur/service.ts'
import type { ImageInput } from '#/lib/classeur/service.ts'
import {
  imagesATransferer,
  peutTransferer,
  planTransfert,
} from '#/lib/classeur/transfert.ts'
import type {
  ModeTransfert,
  OperationTransfert,
} from '#/lib/classeur/transfert.ts'
import type { NiveauEffectif } from '#/lib/classeur/droits.ts'
import { ITEM_TABLE } from '#/lib/classeur/types.ts'
import type { ChapterItem, DbImage, ItemKind } from '#/lib/classeur/types.ts'
import { supabase } from '#/lib/supabase.ts'

const COLS_IMAGE =
  'id, uuid, classeur_id, chemin, nom, taille, largeur, hauteur, original_chemin, original_largeur, original_hauteur, original_taille, deleted_at, created_at, updated_at, created_by'

function refus(message = 'Écriture refusée'): Error {
  return Object.assign(new Error(message), { code: '42501' })
}

/**
 * Erreur du stockage rendue lisible par `messageErreur` : un refus (403)
 * devient 42501 ; une erreur PostgREST (code) passe telle quelle ; le reste
 * devient une phrase à nous — jamais le message brut du serveur.
 */
function erreurStockage(err: unknown): Error {
  const e = (err ?? {}) as {
    code?: unknown
    statusCode?: unknown
    status?: unknown
  }
  const statut = String(e.statusCode ?? e.status ?? '')
  if (statut === '403' || statut === '401') return refus('Copie refusée')
  if (typeof e.code === 'string' && e.code !== '') return err as Error
  if (statut === '404' || statut === '400') {
    return new Error('une image du classeur de départ est introuvable')
  }
  if (statut === '409') {
    return new Error('une image du même nom existe déjà à l’arrivée')
  }
  return new Error('le stockage des images n’a pas répondu')
}

async function copierFichier(source: string, destination: string) {
  // Jamais d'option : `upsert` exigerait une policy UPDATE qui n'existe pas,
  // et une destination existante doit échouer (409), pas être écrasée.
  const { error } = await supabase.storage
    .from(BUCKET_IMAGES)
    .copy(source, destination)
  if (error) throw erreurStockage(error)
}

/**
 * Retire des fichiers ; un second essai si le premier échoue. Jamais
 * d'exception. `true` seulement si TOUS sont partis : un refus de la policy
 * delete ne lève pas d'erreur, il rend une liste plus courte.
 */
async function retirerFichiers(chemins: readonly string[]): Promise<boolean> {
  if (chemins.length === 0) return true
  let restants = [...chemins]
  for (let essai = 0; essai < 2; essai++) {
    const { data, error } = await supabase.storage
      .from(BUCKET_IMAGES)
      .remove(restants)
    if (error) continue
    const partis = new Set(data.map((o) => o.name))
    restants = restants.filter((c) => !partis.has(c))
    if (restants.length === 0) return true
  }
  return false
}

async function creerFiche(classeurId: number, fiche: ImageInput) {
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .insert({ ...fiche, classeur_id: classeurId })
    .select(COLS_IMAGE)
    .single()
  if (error) throw error
  return data
}

/**
 * Pose (ou retire, `null`) la suppression douce d'une fiche ; deux essais.
 * `false` si c'est impossible (panne, refus). Jamais d'exception.
 */
async function marquerFiche(
  id: number,
  deleted_at: string | null,
): Promise<boolean> {
  for (let essai = 0; essai < 2; essai++) {
    const { data, error } = await supabase
      .from(IMAGES_TABLE)
      .update({ deleted_at })
      .eq('id', id)
      .select('id')
    if (!error && Array.isArray(data) && data.length > 0) return true
  }
  return false
}

/**
 * Copie UNE image vers un autre classeur : fichier d'affichage, original
 * s'il existe, puis la fiche (`<arrivée>/<nouvel uuid>.webp`). Si la fiche
 * échoue, les fichiers copiés sont retirés (jamais d'orphelin). Pas de
 * point de restauration : la médiathèque n'est pas dans l'instantané.
 */
export async function copierImageVersClasseur(
  image: DbImage,
  arrivee: number,
  uuid: string = crypto.randomUUID(),
): Promise<DbImage> {
  const chemin = cheminImage(arrivee, uuid.toLowerCase())
  const original =
    image.original_chemin === null
      ? null
      : cheminOriginalImage(arrivee, uuid.toLowerCase())
  const copies: string[] = []
  try {
    await copierFichier(image.chemin, chemin)
    copies.push(chemin)
    if (image.original_chemin !== null && original !== null) {
      await copierFichier(image.original_chemin, original)
      copies.push(original)
    }
    return await creerFiche(arrivee, {
      chemin,
      nom: image.nom,
      taille: image.taille,
      largeur: image.largeur,
      hauteur: image.hauteur,
      original_chemin: original,
      original_largeur: image.original_largeur,
      original_hauteur: image.original_hauteur,
      original_taille: image.original_taille,
    })
  } catch (err) {
    await retirerFichiers(copies)
    throw err
  }
}

export interface DemandeTransfertService {
  mode: ModeTransfert
  /** Éléments à transférer, dans l'ordre voulu à l'arrivée (relus frais). */
  elements: ReadonlyArray<{ kind: ItemKind; id: number }>
  origine: number
  arrivee: number
  chapitreArrivee: number
  /** Niveaux effectifs de l'utilisateur (`niveauEffectif`) des deux côtés. */
  niveaux: { origine: NiveauEffectif; arrivee: NiveauEffectif }
  /** Générateur d'uuid (tests) ; `crypto.randomUUID` par défaut. */
  nouveauxUuids?: () => string
}

export interface ResultatTransfert {
  mode: ModeTransfert
  /** Éléments déplacés (mode `deplacer`). */
  deplaces: number
  /** Éléments copiés (mode `copier`). */
  copies: number
  imagesCopiees: number
  /** Chemins de l'origine utilisés mais sans fiche : laissés tels quels. */
  introuvables: string[]
}

/** Relit les éléments demandés, frais, et vérifie qu'ils sont à l'origine. */
async function lireElements(
  refs: DemandeTransfertService['elements'],
  origine: number,
): Promise<ChapterItem[]> {
  const [chapitresOrigine, lus] = await Promise.all([
    fetchChapters(origine),
    fetchItemsParRefs(refs),
  ])
  const chapitres = new Set(chapitresOrigine.map((c) => c.id))
  const parCle = new Map(lus.map((i) => [`${i.kind}:${String(i.data.id)}`, i]))
  return refs.map((r) => {
    const item = parCle.get(`${r.kind}:${String(r.id)}`)
    if (item === undefined || !chapitres.has(item.data.chapter_id)) {
      throw new Error(
        'un élément a été supprimé ou déplacé entre-temps ; rouvrez le chapitre',
      )
    }
    return item
  })
}

/** Déplacement gardé : un document réécrit ne l'est que s'il n'a pas changé. */
async function deplacer(
  op: Extract<OperationTransfert, { type: 'deplacerElement' }>,
  base: string,
): Promise<void> {
  // Numéro de version GARDÉ : seuls les chemins changent (D9), ce n'est
  // pas une modification du document.
  // `uuid` neuf vers un autre classeur : voir `planTransfert`.
  const patch: Record<string, unknown> = {
    chapter_id: op.chapterId,
    sort_order: op.sortOrder,
  }
  if (op.content !== undefined) patch.content = op.content
  if (op.uuid !== undefined) patch.uuid = op.uuid
  let q = supabase.from(ITEM_TABLE[op.kind]).update(patch).eq('id', op.id)
  if (op.content !== undefined) q = q.eq('updated_at', base)
  const { data, error } = await q.select('id')
  if (error) throw error
  if (Array.isArray(data) && data.length > 0) return
  if (op.content !== undefined) {
    const { data: actuel } = await supabase
      .from(ITEM_TABLE[op.kind])
      .select('updated_at')
      .eq('id', op.id)
      .maybeSingle<{ updated_at: string }>()
    if (actuel && Date.parse(actuel.updated_at) !== Date.parse(base)) {
      throw new Error(
        'un document a été modifié entre-temps ; rouvrez le chapitre et recommencez',
      )
    }
  }
  exigerUneLigne([])
}

/**
 * Copie ou déplace des éléments vers le chapitre d'un AUTRE classeur (un
 * déplacement dans le même classeur est accepté, sans image à copier).
 * Voir l'en-tête pour l'ordre, les droits et le comportement en échec.
 */
export async function transfererItems(
  demande: DemandeTransfertService,
): Promise<ResultatTransfert> {
  const { mode, origine, arrivee, chapitreArrivee } = demande
  if (!peutTransferer(mode, demande.niveaux.origine, demande.niveaux.arrivee)) {
    throw refus('Transfert refusé')
  }
  if (demande.elements.length === 0) {
    return { mode, deplaces: 0, copies: 0, imagesCopiees: 0, introuvables: [] }
  }

  // --- Lectures (aucune écriture avant les points) ---
  const chapitre = await fetchChapter(chapitreArrivee)
  if (chapitre === null || chapitre.classeur_id !== arrivee) {
    throw new Error('le chapitre d’arrivée est introuvable')
  }
  const elements = await lireElements(demande.elements, origine)
  const avecDocuments = elements.some((e) => e.kind === 'document')
  const imagesOrigine =
    origine !== arrivee && avecDocuments ? await fetchImages(origine) : []
  const ordreSuivant = await prochainOrdre(chapitreArrivee)
  const plan = planTransfert({
    mode,
    elements,
    origine,
    arrivee,
    chapitreArrivee,
    ordreSuivant,
    imagesOrigine,
    nouveauxUuids: demande.nouveauxUuids ?? (() => crypto.randomUUID()),
  })
  const basesParId = new Map(
    elements.map((e) => [`${e.kind}:${String(e.data.id)}`, e.data.updated_at]),
  )

  // --- Exécution ---
  /** Fichiers copiés pas encore rattachés à une fiche. */
  let enAttente: string[] = []
  const fiches: Array<{ id: number; chemin: string; fichiers: string[] }> = []
  /** Contenu des éléments écrits (chemins à garder en cas d'échec). */
  const ecrits: Array<{ content: string }> = []
  let transferes = 0
  try {
    for (const op of plan.operations) {
      switch (op.type) {
        case 'point':
          await avantEcriture({ classeurId: op.classeurId })
          break
        case 'copierFichier':
          await copierFichier(op.source, op.destination)
          enAttente.push(op.destination)
          break
        case 'creerFiche': {
          const fiche = await creerFiche(op.classeurId, op.fiche)
          fiches.push({
            id: fiche.id,
            chemin: op.fiche.chemin,
            fichiers: enAttente,
          })
          enAttente = []
          break
        }
        case 'insererElement': {
          const { data, error } = await supabase
            .from(ITEM_TABLE[op.kind])
            .insert({
              ...op.champs,
              chapter_id: op.chapterId,
              sort_order: op.sortOrder,
            })
            .select('id')
          if (error) throw error
          exigerUneLigne(data)
          ecrits.push({
            content: op.kind === 'document' ? op.champs.content : '',
          })
          transferes += 1
          break
        }
        case 'deplacerElement': {
          await deplacer(
            op,
            basesParId.get(`${op.kind}:${String(op.id)}`) ?? '',
          )
          signalerDeplacement([{ kind: op.kind, id: op.id }])
          const item = elements.find(
            (e) => e.kind === op.kind && e.data.id === op.id,
          )
          ecrits.push({
            content:
              op.content ??
              (item?.kind === 'document' ? item.data.content : ''),
          })
          transferes += 1
          break
        }
      }
    }
  } catch (err) {
    await annulerCopies(enAttente, fiches, ecrits, arrivee)
    if (transferes === 0) throw err
    throw new Error(
      `transfert interrompu après ${String(transferes)} élément(s) sur ${String(elements.length)} ; ` +
        'un point de restauration a été pris avant dans chaque classeur',
      { cause: err },
    )
  }
  return {
    mode,
    deplaces: mode === 'deplacer' ? transferes : 0,
    copies: mode === 'copier' ? transferes : 0,
    imagesCopiees: fiches.length,
    introuvables: plan.introuvables,
  }
}

/** Retire les copies de cette opération que rien d'écrit ne référence. */
async function annulerCopies(
  enAttente: readonly string[],
  fiches: ReadonlyArray<{ id: number; chemin: string; fichiers: string[] }>,
  ecrits: ReadonlyArray<{ content: string }>,
  arrivee: number,
): Promise<void> {
  await retirerFichiers(enAttente)
  const utilises = new Set(imagesATransferer(ecrits, arrivee))
  for (const f of fiches) {
    if (utilises.has(f.chemin.toLowerCase())) continue
    // La fiche d'abord : si elle ne peut pas être marquée, ses fichiers
    // restent (une fiche vivante sans fichier serait « indisponible »).
    if (!(await marquerFiche(f.id, new Date().toISOString()))) continue
    // Fichiers restés (refus de la policy delete) : la fiche revit, pour
    // ne laisser ni fichier sans fiche ni fiche sans fichier.
    if (!(await retirerFichiers(f.fichiers))) await marquerFiche(f.id, null)
  }
}
