/*
 * Application d'un plan de fusion sur Supabase — portée de Registre
 * (`files.rs::import_classeur_json`, `do_import_json`).
 *
 * `merge.ts` est PUR et rend un plan ; ce module l'exécute via `service.ts`,
 * écriture par écriture, sous RLS (rang `ecriture` requis : un refus 42501
 * remonte tel quel et s'affiche par `messageErreur`).
 *
 * ORDRE STRICT d'`appliquerFusion`, à ne pas réarranger :
 *   (a) lecture de l'état local (supprimés compris) et plan ;
 *   (b) INSTANTANÉ de l'état courant (non supprimé) écrit dans
 *       `classeur_merge_history` AVANT toute écriture de contenu ;
 *   (c) les actions du plan, séquentiellement, dans l'ordre du plan
 *       (chapitres avant leurs éléments, suppressions en dernier) ;
 *   (d) élagage de l'historique aux `NOMBRE_MAX_HISTORIQUE` entrées les plus
 *       récentes (RLS : gestion seule, un 42501 est ignoré) ;
 *   (e) les compteurs.
 *
 * PAS DE TRANSACTION : il n'y a pas de RPC (le plan `page-classeur`
 * l'assume). Un échec au milieu de (c) laisse un état PARTIEL — c'est
 * précisément pour cela que l'instantané (b) précède la première écriture :
 * l'utilisateur le retrouve dans l'historique et peut le restaurer
 * (`history.ts::restaurerInstantane`). L'erreur remonte sans être avalée.
 *
 * Écart avec le Rust, assumé : Registre n'écrivait l'entrée d'historique
 * qu'après un merge réussi et sans doublon d'instantané
 * (`snapshot_already_in_history`). Ici, l'entrée est écrite AVANT (le
 * seul ordre qui protège sans transaction) et la déduplication n'est pas
 * portée : elle exigerait de relire tous les instantanés (jsonb volumineux)
 * à chaque fusion, alors que l'élagage borne déjà l'historique à dix.
 * Une fusion sans aucune action n'écrit RIEN (ni instantané ni élagage),
 * comme le `has_changes` du Rust.
 */

import { estRefusDroits } from '#/lib/classeur/erreur.ts'
import type {
  ActionFusion,
  EtatLocal,
  MergeResult,
  PlanFusion,
  OptionsFusion,
} from '#/lib/classeur/merge/merge.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import {
  chapitresDesLignes,
  filtrerPlan,
  lignesImport,
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import type {
  ChapitreLigne,
  CiblePortee,
  LigneImport,
  OptionsPortee,
} from '#/lib/classeur/merge/portee.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import { entreesAElaguerParGenre } from '#/lib/classeur/merge/snapshot.ts'
import { sansPointsAuto } from '#/lib/classeur/pointsAutoGarde.ts'
import {
  createChapter,
  createClasseur,
  createItem,
  deleteMergeHistory,
  fetchChaptersAvecSupprimes,
  fetchClasseur,
  fetchContentAvecSupprimes,
  fetchMergeHistory,
  fetchPeriodicites,
  insertMergeHistory,
  restaurerChapter,
  restaurerItem,
  softDeleteChapter,
  softDeleteItem,
  updateChapter,
  updateItem,
} from '#/lib/classeur/service.ts'
import type {
  ChapterInput,
  ChapterPatch,
  ItemInput,
  ItemPatch,
  OptionsCreation,
} from '#/lib/classeur/service.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'

// ---------------------------------------------------------------------------
// Écrivain : les huit écritures que le plan peut demander
// ---------------------------------------------------------------------------

/**
 * Sous-ensemble de `service.ts` dont `executerPlan` a besoin. Injectable
 * (tests) ; par défaut, les fonctions du service.
 */
export interface Ecrivain {
  createChapter: (
    classeurId: number,
    input: ChapterInput,
    options?: OptionsCreation,
  ) => Promise<number>
  updateChapter: (id: number, patch: ChapterPatch) => Promise<void>
  restaurerChapter: (id: number, patch?: ChapterPatch) => Promise<void>
  softDeleteChapter: (id: number) => Promise<void>
  createItem: (
    chapterId: number,
    item: ItemInput,
    options?: OptionsCreation,
  ) => Promise<number>
  updateItem: (kind: ItemKind, id: number, patch: ItemPatch) => Promise<void>
  restaurerItem: (
    kind: ItemKind,
    id: number,
    patch?: ItemPatch,
  ) => Promise<void>
  softDeleteItem: (kind: ItemKind, id: number) => Promise<void>
}

const ECRIVAIN_SERVICE: Ecrivain = {
  createChapter,
  updateChapter,
  restaurerChapter,
  softDeleteChapter,
  createItem,
  updateItem,
  restaurerItem,
  softDeleteItem,
}

// ---------------------------------------------------------------------------
// Exécution du plan
// ---------------------------------------------------------------------------

/**
 * Exécute les actions dans l'ordre, UNE À LA FOIS (pas de `Promise.all` :
 * un élément référence un chapitre créé par une action précédente, et un
 * échec doit laisser un préfixe du plan appliqué, pas un mélange).
 *
 * Résolution des références `{ type: 'nouveau', index }` : `merge.ts`
 * numérote les `creerChapitre` par `index` croissant dans l'ordre du plan ;
 * l'identifiant rendu par `createChapter` est rangé à cet index et relu par
 * les `creerItem` qui suivent. Une référence vers un chapitre pas encore
 * créé est une incohérence du plan : erreur explicite, aucune écriture.
 *
 * Uuid déjà pris AILLEURS (décision du 2026-10-04) : `UNIQUE (uuid)` porte
 * sur toute la table, et le fichier peut être l'export d'un AUTRE classeur,
 * invisible du plan. Une création (chapitre ou élément) refusée pour cette
 * contrainte (`estDoublonUuid`) est réessayée UNE fois sans uuid — la base
 * en tire un neuf — et comptée dans `suivi.renumerotes`. Le plan n'est pas
 * touché : dans le cas normal, rien ne change. Le chapitre recréé ainsi
 * range son nouvel id à son `index` comme les autres : ses éléments le
 * visent.
 *
 * Rend les identifiants des chapitres créés, dans l'ordre des `index`.
 */
export async function executerPlan(
  classeurId: number,
  actions: ReadonlyArray<ActionFusion>,
  ecrivain: Ecrivain = ECRIVAIN_SERVICE,
  suivi: SuiviExecution = { renumerotes: 0 },
): Promise<number[]> {
  const idsNouveaux: number[] = []
  for (const action of actions) {
    switch (action.type) {
      case 'creerChapitre': {
        const id = await avecRepliUuid(
          action.uuid,
          (uuid) =>
            ecrivain.createChapter(
              classeurId,
              {
                label: action.label,
                icon: action.icon,
                description: action.description,
              },
              {
                sort_order: action.sort_order,
                ...(uuid !== null ? { uuid } : {}),
              },
            ),
          suivi,
        )
        idsNouveaux[action.index] = id
        break
      }
      case 'modifierChapitre':
        await ecrivain.updateChapter(action.id, {
          label: action.label,
          icon: action.icon,
          description: action.description,
          ...(action.sort_order !== undefined
            ? { sort_order: action.sort_order }
            : {}),
        })
        break
      case 'restaurerChapitre':
        await ecrivain.restaurerChapter(action.id, {
          label: action.label,
          icon: action.icon,
          description: action.description,
          ...(action.sort_order !== undefined
            ? { sort_order: action.sort_order }
            : {}),
        })
        break
      case 'supprimerChapitre':
        await ecrivain.softDeleteChapter(action.id)
        break
      case 'creerItem': {
        const chapterId = resoudreChapitre(action.chapitre, idsNouveaux)
        await avecRepliUuid(
          action.uuid,
          (uuid) =>
            ecrivain.createItem(chapterId, action.item, {
              sort_order: action.sort_order,
              ...(uuid !== null ? { uuid } : {}),
              ...(action.updated_at !== undefined
                ? { updated_at: action.updated_at }
                : {}),
            }),
          suivi,
        )
        break
      }
      case 'modifierItem':
        await ecrivain.updateItem(action.item.kind, action.id, {
          ...action.item.input,
          ...(action.chapitre !== undefined
            ? { chapter_id: resoudreChapitre(action.chapitre, idsNouveaux) }
            : {}),
          ...(action.sort_order !== undefined
            ? { sort_order: action.sort_order }
            : {}),
          ...(action.uuid !== undefined ? { uuid: action.uuid } : {}),
          ...(action.updated_at !== undefined
            ? { updated_at: action.updated_at }
            : {}),
        })
        break
      case 'restaurerItem':
        await ecrivain.restaurerItem(action.item.kind, action.id, {
          ...action.item.input,
          chapter_id: resoudreChapitre(action.chapitre, idsNouveaux),
          sort_order: action.sort_order,
          ...(action.uuid !== undefined ? { uuid: action.uuid } : {}),
          ...(action.updated_at !== undefined
            ? { updated_at: action.updated_at }
            : {}),
        })
        break
      case 'supprimerItem':
        await ecrivain.softDeleteItem(action.kind, action.id)
        break
    }
  }
  return idsNouveaux
}

/** Bilan d'une exécution : créations réessayées sans uuid. */
export interface SuiviExecution {
  renumerotes: number
}

/**
 * Refus d'unicité sur l'UUID (23505). Le nom de contrainte et le détail
 * (« Key (uuid)=(…) already exists ») mentionnent `uuid` : s'ils sont là et
 * ne le mentionnent pas, c'est une AUTRE contrainte, jamais réessayée. Sans
 * message ni détail, le code seul décide (l'appelant n'essaie que si
 * l'action portait un uuid).
 */
export function estDoublonUuid(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { code?: unknown; message?: unknown; details?: unknown }
  if (e.code !== '23505') return false
  const textes = [e.message, e.details].filter(
    (t): t is string => typeof t === 'string' && t !== '',
  )
  return textes.length === 0 || textes.some((t) => /uuid/i.test(t))
}

/** `creer(uuid)`, puis UNE fois `creer(null)` si l'uuid est déjà pris. */
async function avecRepliUuid(
  uuid: string | null,
  creer: (uuid: string | null) => Promise<number>,
  suivi: SuiviExecution,
): Promise<number> {
  try {
    return await creer(uuid)
  } catch (err) {
    if (uuid === null || !estDoublonUuid(err)) throw err
    const id = await creer(null)
    suivi.renumerotes += 1
    return id
  }
}

/** Avertissement du bilan, ou rien. */
export function avertissementsExecution(suivi: SuiviExecution): string[] {
  const n = suivi.renumerotes
  if (n === 0) return []
  return [
    n === 1
      ? '1 élément a reçu un nouvel identifiant : il existait ailleurs.'
      : `${String(n)} éléments ont reçu un nouvel identifiant : ils existaient ailleurs.`,
  ]
}

/** `resultat` augmenté des avertissements de l'exécution, s'il y en a. */
export function avecAvertissements(
  resultat: MergeResult,
  suivi: SuiviExecution,
): MergeResult {
  const avertissements = avertissementsExecution(suivi)
  return avertissements.length === 0
    ? resultat
    : { ...resultat, avertissements }
}

/** Identifiant local d'un chapitre cible ; jette si le plan est incohérent. */
export function resoudreChapitre(
  ref: Extract<ActionFusion, { type: 'creerItem' }>['chapitre'],
  idsNouveaux: ReadonlyArray<number>,
): number {
  if (ref.type === 'local') return ref.id
  const id = idsNouveaux.at(ref.index)
  if (id === undefined) {
    throw new Error(
      `Plan de fusion incohérent : le chapitre n° ${ref.index + 1} n'a pas encore été créé.`,
    )
  }
  return id
}

// ---------------------------------------------------------------------------
// État local
// ---------------------------------------------------------------------------

/**
 * État complet d'un classeur pour la fusion : chapitres et éléments
 * SUPPRIMÉS COMPRIS (règles R1, R5, R6 de `merge.ts`) et référentiel des
 * périodicités (E3). Lecture directe, jamais mise en cache : le plan doit
 * partir de l'état réel de la base, pas d'une lecture de 60 s.
 */
export async function chargerEtatLocal(classeurId: number): Promise<EtatLocal> {
  const [chapters, periodicites] = await Promise.all([
    fetchChaptersAvecSupprimes(classeurId),
    fetchPeriodicites(),
  ])
  const content = await fetchContentAvecSupprimes(chapters.map((c) => c.id))
  return { chapters, content, periodicites }
}

/** Plan de fusion sans aucune écriture (dialogue de prévisualisation). */
export async function previsualiserFusion(
  classeurId: number,
  fichier: ClasseurJson,
  options: OptionsFusion,
): Promise<PlanFusion> {
  const local = await chargerEtatLocal(classeurId)
  return planifierFusion(local, fichier, options)
}

// ---------------------------------------------------------------------------
// Fusion dans un classeur existant
// ---------------------------------------------------------------------------

export interface OptionsApplication extends OptionsFusion {
  /** Libellé de l'entrée d'historique (nom du fichier ou du classeur importé). */
  sourceName: string
  /**
   * Clés (`clesActions`) des éléments refusés dans l'aperçu de l'import du
   * classeur complet. Absent (restauration, appelants d'avant) : le plan est
   * celui de `planifierFusion`, inchangé.
   */
  exclus?: ReadonlySet<string>
}

/** Compteurs d'une fusion complète ; `ignores` posé seulement si `exclus` l'était. */
export interface ResultatFusion extends MergeResult {
  ignores?: number
}

/**
 * Fusionne `fichier` dans le classeur `classeurId`. Voir l'en-tête du module
 * pour l'ORDRE STRICT (instantané avant toute écriture) et l'absence de
 * transaction. Rend les compteurs du plan (ceux qui ont été appliqués si
 * tout a réussi ; en cas d'échec, l'erreur remonte).
 *
 * `exclus` : même filtrage que le réimport limité (`filtrerPlan`), DANS le
 * planificateur, donc avant le test « aucune action » et avant le point de
 * restauration. Sans refus effectif, `filtrerPlan` rend le plan TEL QUEL.
 */
export async function appliquerFusion(
  classeurId: number,
  fichier: ClasseurJson,
  options: OptionsApplication,
): Promise<ResultatFusion> {
  const { sourceName, exclus, ...optionsFusion } = options
  let ignores = 0
  const resultat = await appliquerPlanifie(
    classeurId,
    (local) => {
      const filtre = filtrerPlan(
        planifierFusion(local, fichier, optionsFusion),
        exclus ?? new Set(),
      )
      ignores = filtre.ignores
      return filtre.plan
    },
    sourceName,
  )
  return exclus === undefined ? resultat : { ...resultat, ignores }
}

/** Aperçu de l'import du classeur complet : plan, lignes et leur chapitre. */
export interface ApercuFusion {
  plan: PlanFusion
  lignes: LigneImport[]
  /** Chapitre de chaque ligne (même ordre que `lignes`), pour les grouper. */
  chapitres: ChapitreLigne[]
}

/** Plan de l'import d'un classeur complet, avec ses lignes, sans écriture. */
export async function previsualiserFusionComplete(
  classeurId: number,
  fichier: ClasseurJson,
  options: OptionsFusion,
): Promise<ApercuFusion> {
  const local = await chargerEtatLocal(classeurId)
  const plan = planifierFusion(local, fichier, options)
  return {
    plan,
    lignes: lignesImport(local, plan),
    chapitres: chapitresDesLignes(local, plan),
  }
}

/** Aperçu d'un réimport limité : le plan et, par action, l'avant / après. */
export interface ApercuPortee {
  plan: PlanFusion
  lignes: LigneImport[]
}

/** Plan d'un réimport limité à un chapitre ou un document (`portee.ts`), sans écriture. */
export async function previsualiserFusionPortee(
  classeurId: number,
  fichier: ClasseurJson,
  cible: CiblePortee,
  options: OptionsPortee,
): Promise<ApercuPortee> {
  const local = await chargerEtatLocal(classeurId)
  const plan = planifierFusionPortee(local, fichier, cible, options)
  return { plan, lignes: lignesImport(local, plan) }
}

/** Compteurs d'un réimport limité, plus les actions refusées dans l'aperçu. */
export interface ResultatPortee extends MergeResult {
  ignores: number
}

/**
 * Réimport limité à un chapitre ou un document : MÊME circuit que
 * `appliquerFusion` (instantané du classeur AVANT toute écriture, actions
 * dans l'ordre, élagage) — seul le plan change. Le plan est recalculé sur
 * l'état relu à l'instant, jamais repris de l'aperçu.
 *
 * `exclus` (clés de `clesActions`) : éléments refusés dans l'aperçu. Le
 * filtre agit DANS le planificateur, donc avant le test « aucune action »
 * et avant l'instantané : tout refuser n'écrit rien, pas même un point de
 * restauration, et les compteurs de l'instantané sont ceux du plan filtré.
 */
export async function appliquerFusionPortee(
  classeurId: number,
  fichier: ClasseurJson,
  cible: CiblePortee,
  options: OptionsPortee & {
    sourceName: string
    exclus?: ReadonlySet<string>
  },
): Promise<ResultatPortee> {
  let ignores = 0
  const resultat = await appliquerPlanifie(
    classeurId,
    (local) => {
      const filtre = filtrerPlan(
        planifierFusionPortee(local, fichier, cible, options),
        options.exclus ?? new Set(),
      )
      ignores = filtre.ignores
      return filtre.plan
    },
    options.sourceName,
  )
  return { ...resultat, ignores }
}

/** Étapes (a) à (e) d'une fusion, quel que soit le planificateur. */
async function appliquerPlanifie(
  classeurId: number,
  planifier: (local: EtatLocal) => PlanFusion,
  sourceName: string,
): Promise<MergeResult> {
  // (a) état courant et plan
  const classeur = await fetchClasseur(classeurId)
  if (classeur === null) throw new Error('Classeur introuvable ou supprimé.')
  const local = await chargerEtatLocal(classeurId)
  const plan = planifier(local)
  if (plan.actions.length === 0) return plan.resultat

  // (b) instantané AVANT la première écriture — `construireExport` ne
  // retient que les chapitres et éléments non supprimés.
  const instantane = construireExport(
    classeur,
    local.chapters,
    local.content,
    local.periodicites ?? [],
  )
  await insertMergeHistory({
    classeur_id: classeurId,
    kind: 'fusion',
    label: sourceName,
    source_name: sourceName,
    inserted: plan.resultat.inserted,
    updated: plan.resultat.updated,
    unchanged: plan.resultat.unchanged,
    skipped: plan.resultat.skipped,
    snapshot: instantane,
  })

  // (c) écritures, dans l'ordre du plan — sans points auto : l'instantané
  // de fusion vient d'être pris.
  const suivi: SuiviExecution = { renumerotes: 0 }
  await sansPointsAuto(() =>
    executerPlan(classeurId, plan.actions, ECRIVAIN_SERVICE, suivi),
  )

  // (d) élagage
  await elaguerHistorique(classeurId)

  // (e)
  return avecAvertissements(plan.resultat, suivi)
}

/**
 * Élague par genre (`entreesAElaguerParGenre` : 10 points auto, 10 majeurs).
 * La suppression d'un point majeur est réservée à `gestion` par la RLS : un
 * compte `ecriture` reçoit 42501, qui est IGNORÉ (l'historique grandit, un
 * gestionnaire l'élaguera à sa prochaine fusion). Toute autre erreur remonte,
 * avec un message qui dit que la fusion, elle, est appliquée.
 */
export async function elaguerHistorique(classeurId: number): Promise<void> {
  const entrees = await fetchMergeHistory(classeurId)
  for (const id of entreesAElaguerParGenre(entrees)) {
    try {
      await deleteMergeHistory(id)
    } catch (err) {
      if (estRefusDroits(err)) return
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Fusion appliquée, mais l'élagage de l'historique a échoué : ${detail}`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Import comme nouveau classeur
// ---------------------------------------------------------------------------

/**
 * Crée un classeur à partir du fichier (miroir de `do_import_json`) : le
 * classeur d'abord, puis le plan d'une fusion sur un état VIDE — tout est
 * inséré, les types inconnus et les feuilles de suivi sans périodicité
 * résoluble sont ignorés (avertissements du plan). Rend l'identifiant.
 *
 * Aucune entrée d'historique, comme chez Registre : un classeur neuf n'a
 * pas d'état antérieur à restaurer.
 *
 * Uuids NEUFS (relecture adverse du 2026-10-04) : la base impose
 * `UNIQUE (uuid)` sur toute la table, pas par classeur. Reprendre ceux du
 * fichier — l'export d'un classeur de cette base, cas ordinaire — heurtait
 * la contrainte dès le premier chapitre. Ils sont retirés : la base en tire
 * de nouveaux.
 *
 * Sans transaction : si une écriture échoue, le classeur existe avec un
 * contenu partiel ; l'erreur le DIT (« incomplet »), la cause d'origine en
 * `cause`. Le plan est calculé AVANT la création du classeur.
 */
export async function importerCommeNouveauClasseur(
  fichier: ClasseurJson,
): Promise<number> {
  const periodicites = await fetchPeriodicites()
  const vide: EtatLocal = {
    chapters: [],
    content: {
      documents: [],
      tracking_sheets: [],
      signature_sheets: [],
      intercalaires: [],
    },
    periodicites,
  }
  // Planifié AVEC les uuid du fichier (E8 : un titre vide porteur d'uuid est
  // importé), écrit SANS : toutes les actions sont des créations.
  const plan = planifierFusion(vide, fichier, { replace: false })
  const actions = plan.actions.map(sansUuid)
  const classeurId = await createClasseur({
    name: fichier.classeur.name,
    icon: fichier.classeur.icon,
    etablissement: fichier.classeur.etablissement,
    etablissement_complement: fichier.classeur.etablissement_complement,
  })
  try {
    // Sans points auto : un classeur neuf n'a pas d'état antérieur à figer.
    await sansPointsAuto(() => executerPlan(classeurId, actions))
  } catch (err) {
    throw new Error(
      `Import interrompu : le classeur ${fichier.classeur.name} a été créé, mais son contenu est incomplet. Supprimez-le, puis réessayez l'import.`,
      { cause: err },
    )
  }
  return classeurId
}

/** Une création sans l'uuid du fichier (la base en tire un neuf). */
function sansUuid(action: ActionFusion): ActionFusion {
  return action.type === 'creerChapitre' || action.type === 'creerItem'
    ? { ...action, uuid: null }
    : action
}
