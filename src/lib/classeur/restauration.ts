/*
 * POINTS DE RESTAURATION d'un classeur — mineurs (automatiques) et majeurs
 * (manuels, fusions, sécurité).
 *
 * Demande utilisateur (nuit du 25 au 26/09) : « comme les commits, en plus
 * simple : de vraies sauvegardes pour revenir en arrière, créées facilement
 * même pour une petite modification, une dizaine conservées, mineures et
 * majeures ». L'historique ne recevait un instantané qu'avant une fusion
 * JSON (`apply.ts`) ou une restauration (`history.ts`).
 *
 * Un point = l'export JSON v2 complet du classeur (`construireExport`), le
 * même format qu'un fichier exporté : restaurer un point, c'est fusionner
 * cet instantané en mode remplacement (`history.ts::restaurerInstantane`,
 * audité le 25/09), après un point de sécurité si l'état courant diffère.
 *
 * QUATRE GENRES, DEUX QUOTAS (`QUOTAS`) :
 *   auto      mineur — pris AVANT une session de modifications, au plus un
 *             par `FENETRE_AUTO_MS` (15 min) par classeur, quel que soit
 *             l'endroit d'où vient l'écriture (garde posée dans `service.ts`
 *             par `definirGardeEcriture`). Élagué par qui l'écrit (RLS).
 *   manuel    majeur — créé par l'utilisateur, avec un libellé.
 *   fusion    majeur — avant un import JSON (`apply.ts`).
 *   securite  majeur — avant une restauration (`history.ts`).
 *   Les majeurs partagent un quota ; les points de sécurité y sont comptés
 *   mais élagués EN PREMIER à quota atteint (ce sont des filets, pas des
 *   jalons choisis).
 *
 * POURQUOI « avant la session » et pas « après chaque écriture » : un point
 * pris avant la première écriture d'une session fige l'état d'où l'on part ;
 * l'état d'arrivée, lui, est l'état courant, et il sera figé par le point de
 * sécurité de la prochaine restauration ou par le point auto de la session
 * suivante. Un point par écriture coûterait un instantané complet (des
 * dizaines de ko à plus d'un Mo) à chaque frappe sauvegardée.
 *
 * DÉDOUBLONNAGE : un point auto, de fusion ou de sécurité n'est pas écrit
 * si l'instantané est égal au DERNIER point, quel que soit son genre
 * (`instantaneEgal`, `updated_at` ignorés) : restaurer l'un ou l'autre
 * rendrait le même état, le second ne serait que du poids en base (constaté
 * le 26/09 : un point auto pris 40 s après un point manuel, 43 ko identiques).
 * Un point MANUEL est toujours écrit : c'est un jalon nommé par l'utilisateur.
 *
 * UN POINT AUTO NE BLOQUE JAMAIS UNE ÉCRITURE : toute erreur (droits, réseau)
 * est avalée avec un `console.warn`. La sauvegarde est un filet, pas un
 * verrou.
 */

import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import {
  entreesAElaguerParGenre,
  instantaneEgal,
} from '#/lib/classeur/merge/snapshot.ts'
import {
  definirGardeEcriture,
  deleteMergeHistory,
  fetchChapter,
  fetchChapters,
  fetchClasseur,
  fetchContentParChapitres,
  fetchItem,
  fetchMergeHistory,
  fetchMergeSnapshot,
  fetchPeriodicites,
  insertMergeHistory,
} from '#/lib/classeur/service.ts'
import type { RefEcriture } from '#/lib/classeur/service.ts'
import { estRefusDroits } from '#/lib/classeur/erreur.ts'
import { pointsAutoSuspendus } from '#/lib/classeur/pointsAutoGarde.ts'
import type { DbMergeHistoryEntry, PointKind } from '#/lib/classeur/types.ts'

export { sansPointsAuto } from '#/lib/classeur/pointsAutoGarde.ts'

/** Points conservés par classeur : mineurs (auto) et majeurs (le reste). */
export const QUOTAS = { auto: 10, majeur: 10 } as const

/** Fenêtre entre deux points automatiques d'un même classeur. */
export const FENETRE_AUTO_MS = 15 * 60 * 1000

export function estMajeur(kind: PointKind): boolean {
  return kind !== 'auto'
}

// ---------------------------------------------------------------------------
// Décision pure : faut-il un point auto maintenant ?
// ---------------------------------------------------------------------------

/**
 * `true` si aucun point auto n'a été pris depuis `FENETRE_AUTO_MS`.
 * `dernierAuto` = `merged_at` du dernier point auto (ISO), ou `null`.
 */
export function doitCreerPointAuto(
  dernierAuto: string | null,
  maintenant: number = Date.now(),
  fenetre: number = FENETRE_AUTO_MS,
): boolean {
  if (dernierAuto === null) return true
  const t = Date.parse(dernierAuto)
  if (!Number.isFinite(t)) return true
  return maintenant - t >= fenetre
}

/**
 * Le dernier point d'un genre (ou de tous les genres si `kind` est omis), ou
 * `null`. `entrees` en ordre quelconque.
 */
export function dernierPoint(
  entrees: ReadonlyArray<
    Pick<DbMergeHistoryEntry, 'id' | 'kind' | 'merged_at'>
  >,
  kind?: PointKind,
): Pick<DbMergeHistoryEntry, 'id' | 'kind' | 'merged_at'> | null {
  let meilleur: Pick<DbMergeHistoryEntry, 'id' | 'kind' | 'merged_at'> | null =
    null
  for (const e of entrees) {
    if (kind !== undefined && e.kind !== kind) continue
    if (
      meilleur === null ||
      e.merged_at > meilleur.merged_at ||
      (e.merged_at === meilleur.merged_at && e.id > meilleur.id)
    )
      meilleur = e
  }
  return meilleur
}

// ---------------------------------------------------------------------------
// Instantané et création d'un point
// ---------------------------------------------------------------------------

/** L'export JSON v2 de l'état courant (non supprimés), ou `null` si le classeur n'existe plus. */
export async function instantaneCourant(
  classeurId: number,
): Promise<ClasseurJson | null> {
  const classeur = await fetchClasseur(classeurId)
  if (classeur === null) return null
  const [chapters, periodicites] = await Promise.all([
    fetchChapters(classeurId),
    fetchPeriodicites(),
  ])
  const content = await fetchContentParChapitres(chapters.map((c) => c.id))
  return construireExport(classeur, chapters, content, periodicites)
}

export interface OptionsPoint {
  kind: PointKind
  /** Libellé d'un point manuel, nom du fichier d'une fusion. */
  label?: string
  compteurs?: Pick<
    DbMergeHistoryEntry,
    'inserted' | 'updated' | 'unchanged' | 'skipped'
  >
  /** Instantané déjà construit (fusion, sécurité) ; sinon lu maintenant. */
  instantane?: ClasseurJson
  /**
   * Ne pas écrire si égal au dernier point, tous genres confondus.
   * Défaut : oui, sauf pour un point manuel (jalon voulu par l'utilisateur).
   */
  dedoublonner?: boolean
}

/**
 * Crée un point de restauration puis élague. Rend l'identifiant, ou `null`
 * si rien n'a été écrit (classeur absent, ou instantané identique au dernier
 * point).
 */
export async function creerPoint(
  classeurId: number,
  options: OptionsPoint,
): Promise<number | null> {
  const instantane = options.instantane ?? (await instantaneCourant(classeurId))
  if (instantane === null) return null

  const entrees = await fetchMergeHistory(classeurId)
  if (options.dedoublonner ?? options.kind !== 'manuel') {
    const dernier = dernierPoint(entrees)
    if (dernier !== null) {
      const precedent = await fetchMergeSnapshot(dernier.id)
      if (instantaneEgal(precedent, instantane)) return null
    }
  }

  const id = await insertMergeHistory({
    classeur_id: classeurId,
    kind: options.kind,
    label: options.label ?? '',
    source_name: options.kind === 'fusion' ? (options.label ?? '') : '',
    inserted: options.compteurs?.inserted ?? 0,
    updated: options.compteurs?.updated ?? 0,
    unchanged: options.compteurs?.unchanged ?? 0,
    skipped: options.compteurs?.skipped ?? 0,
    snapshot: instantane,
  })
  await elaguerPoints(classeurId, [
    ...entrees,
    { id, kind: options.kind, merged_at: new Date().toISOString() },
  ])
  return id
}

/**
 * Élague selon `QUOTAS`. Un refus de droits (42501 : un compte `ecriture`
 * ne peut supprimer que les points auto) arrête l'élagage sans erreur ;
 * toute autre erreur remonte.
 */
export async function elaguerPoints(
  classeurId: number,
  entrees?: ReadonlyArray<
    Pick<DbMergeHistoryEntry, 'id' | 'kind' | 'merged_at'>
  >,
): Promise<void> {
  const liste = entrees ?? (await fetchMergeHistory(classeurId))
  for (const id of entreesAElaguerParGenre(liste, QUOTAS)) {
    try {
      await deleteMergeHistory(id)
    } catch (err) {
      if (estRefusDroits(err)) return
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// Points automatiques : la garde posée sur les écritures du service
// ---------------------------------------------------------------------------

/** Dernier point auto assuré, par classeur, pour ne pas relire l'historique à chaque frappe. */
const dernierAssure = new Map<number, number>()
/** Résolution chapitre → classeur et élément → chapitre, mémorisée pour la session. */
const classeurDuChapitre = new Map<number, number>()
const chapitreDeLElement = new Map<string, number>()

async function classeurDeLaRef(ref: RefEcriture): Promise<number | null> {
  if ('classeurId' in ref) return ref.classeurId
  let chapterId: number | null
  if ('chapterId' in ref) {
    chapterId = ref.chapterId
  } else {
    const cle = `${ref.kind}:${String(ref.id)}`
    const connu = chapitreDeLElement.get(cle)
    if (connu !== undefined) {
      chapterId = connu
    } else {
      const item = await fetchItem<{ chapter_id: number }>(ref.kind, ref.id)
      chapterId = item?.chapter_id ?? null
      if (chapterId !== null) chapitreDeLElement.set(cle, chapterId)
    }
  }
  if (chapterId === null) return null
  const connu = classeurDuChapitre.get(chapterId)
  if (connu !== undefined) return connu
  const chapitre = await fetchChapter(chapterId)
  if (chapitre === null) return null
  classeurDuChapitre.set(chapterId, chapitre.classeur_id)
  return chapitre.classeur_id
}

/**
 * Avant une écriture : assure un point auto si le dernier date de plus de
 * `FENETRE_AUTO_MS`. Jamais bloquant.
 */
export async function assurerPointAuto(ref: RefEcriture): Promise<void> {
  if (pointsAutoSuspendus()) return
  try {
    const classeurId = await classeurDeLaRef(ref)
    if (classeurId === null) return
    const maintenant = Date.now()
    const assure = dernierAssure.get(classeurId)
    if (assure !== undefined && maintenant - assure < FENETRE_AUTO_MS) return

    const entrees = await fetchMergeHistory(classeurId)
    const dernier = dernierPoint(entrees, 'auto')
    if (!doitCreerPointAuto(dernier?.merged_at ?? null, maintenant)) {
      dernierAssure.set(classeurId, Date.parse(dernier?.merged_at ?? ''))
      return
    }
    await creerPoint(classeurId, { kind: 'auto' })
    dernierAssure.set(classeurId, maintenant)
  } catch (err) {
    console.warn('[classeur] point de restauration automatique impossible', err)
  }
}

/** Oublie les résolutions mémorisées (tests). */
export function reinitialiserPointsAuto(): void {
  dernierAssure.clear()
  classeurDuChapitre.clear()
  chapitreDeLElement.clear()
}

// La garde est posée au chargement du module : toute écriture du service
// passe par `assurerPointAuto` dès que ce module est importé (il l'est par
// les hooks de la page Classeur).
definirGardeEcriture(assurerPointAuto)
