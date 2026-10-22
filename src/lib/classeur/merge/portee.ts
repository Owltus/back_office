/*
 * Export et réimport JSON d'UN chapitre ou d'UN document (demande utilisateur
 * du 2026-09-29 : « comme pour le classeur au complet, mais juste pour un
 * chapitre, puis pour un document », pour faire retravailler le contenu par
 * un LLM et le réimporter).
 *
 * Même format que l'export du classeur (v2, `construireExport`) : un fichier
 * de chapitre est un classeur à UN chapitre, un fichier de document un
 * classeur à un chapitre contenant ce seul document. Le bloc `_metadata`
 * garde le schéma descriptif et y ajoute :
 *   - `portee` : ce que le fichier représente (chapitre ou document, par uuid)
 *     — c'est ce qui permet de refuser un fichier appliqué au mauvais endroit ;
 *   - `instructions` : le mode d'emploi pour un LLM (ce qu'il peut modifier,
 *     ce qu'il ne doit JAMAIS toucher, les conventions Markdown de la page).
 *
 * Réimport LIMITÉ à la portée (`planifierFusionPortee`) :
 *   - le fichier FAIT FOI pour les éléments qu'il contient, horodatages
 *     ignorés : un LLM ne met pas `updated_at` à jour, la règle « le plus
 *     récent gagne » ignorerait donc toutes ses modifications ;
 *   - RIEN hors de la portée n'est touché : ni les autres chapitres, ni les
 *     autres documents, ni la position du chapitre dans le classeur ;
 *   - un élément ABSENT du fichier n'est JAMAIS supprimé (décision
 *     utilisateur du 2026-10-20 : plus de case « supprimer ce qui n'est plus
 *     dans le fichier », une IA tronque parfois sa réponse). Seul un élément
 *     marqué `"supprimer": true` part à la corbeille
 *     (`planSuppressionsDemandees`), et seulement dans ce chapitre.
 * Le plan est celui de `planifierFusion` en mode remplacement, FILTRÉ : on
 * réutilise ses règles d'appariement (uuid, puis titre), ses périodicités et
 * son aperçu plutôt que d'en écrire une seconde version.
 *
 * Pur : ni React, ni Supabase.
 */

import type {
  ChapterContent,
  ChapterItem,
  DbChapter,
  DbClasseur,
  DbDocument,
  DbPeriodicite,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import {
  consignesChapitre,
  consignesDocument,
} from '#/lib/classeur/merge/consignes.ts'
import {
  NOTE_EXPORT,
  construireExport,
  lirePorteeObjet,
} from '#/lib/classeur/merge/schema.ts'
import type {
  ClasseurJson,
  ItemJson,
  MetadataJson,
  Portee,
} from '#/lib/classeur/merge/schema.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import { numeroDocument } from '#/lib/classeur/versionDocument.ts'
import type { NumeroVersion } from '#/lib/classeur/versionDocument.ts'

import type {
  ActionApercu,
  ActionFusion,
  ChampsItem,
  EtatLocal,
  MergePreviewItem,
  PlanFusion,
} from '#/lib/classeur/merge/merge.ts'

export type { Portee } from '#/lib/classeur/merge/schema.ts'

// ---------------------------------------------------------------------------
// Portée
// ---------------------------------------------------------------------------

/** Fichier d'export limité : `_metadata` enrichi de la portée et des consignes. */
export interface ExportPortee extends ClasseurJson {
  _metadata: MetadataJson & {
    portee: Portee
    instructions: string[]
  }
}

// ---------------------------------------------------------------------------
// Consignes pour un LLM
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const CONTENU_VIDE: ChapterContent = {
  documents: [],
  tracking_sheets: [],
  signature_sheets: [],
  intercalaires: [],
}

/** Garde les seuls éléments du chapitre `chapterId`. */
function contenuDuChapitre(
  content: ChapterContent,
  chapterId: number,
): ChapterContent {
  return {
    documents: content.documents.filter((d) => d.chapter_id === chapterId),
    tracking_sheets: content.tracking_sheets.filter(
      (d) => d.chapter_id === chapterId,
    ),
    signature_sheets: content.signature_sheets.filter(
      (d) => d.chapter_id === chapterId,
    ),
    intercalaires: content.intercalaires.filter(
      (d) => d.chapter_id === chapterId,
    ),
  }
}

/** Fichier v2 d'UN chapitre (ses éléments non supprimés), consignes comprises. */
export function construireExportChapitre(
  classeur: DbClasseur,
  chapitre: DbChapter,
  content: ChapterContent,
  periodicites: DbPeriodicite[],
  maintenant: Date = new Date(),
): ExportPortee {
  const base = construireExport(
    classeur,
    [chapitre],
    contenuDuChapitre(content, chapitre.id),
    periodicites,
    maintenant,
  )
  const metadata = base._metadata as MetadataJson
  return {
    ...base,
    _metadata: {
      ...metadata,
      description: `Chapitre « ${chapitre.label} » du classeur « ${classeur.name} », exporté depuis le Back Office (page Classeur), au format d'échange Registre.`,
      note: NOTE_EXPORT,
      portee: {
        type: 'chapitre',
        chapitre_uuid: chapitre.uuid,
        chapitre_label: chapitre.label,
      },
      instructions: consignesChapitre(chapitre.label),
    },
  }
}

/** Fichier v2 d'UN document, dans son chapitre (contexte), consignes comprises. */
export function construireExportDocument(
  classeur: DbClasseur,
  chapitre: DbChapter,
  document: DbDocument,
  periodicites: DbPeriodicite[],
  maintenant: Date = new Date(),
): ExportPortee {
  const base = construireExport(
    classeur,
    [chapitre],
    { ...CONTENU_VIDE, documents: [document] },
    periodicites,
    maintenant,
  )
  const metadata = base._metadata as MetadataJson
  return {
    ...base,
    _metadata: {
      ...metadata,
      description: `Document « ${document.title} » (chapitre « ${chapitre.label} », classeur « ${classeur.name} »), exporté depuis le Back Office (page Classeur), au format d'échange Registre.`,
      note: NOTE_EXPORT,
      portee: {
        type: 'document',
        document_uuid: document.uuid,
        document_title: document.title,
        chapitre_label: chapitre.label,
      },
      instructions: consignesDocument(document.title, chapitre.label),
    },
  }
}

// ---------------------------------------------------------------------------
// Lecture de la portée d'un fichier
// ---------------------------------------------------------------------------

/**
 * `_metadata.portee` du texte brut, si bien formée ; `null` sinon (fichier
 * de Registre, point de restauration, ou portée retirée par le LLM).
 * `parseImportJson` la retient aussi, dans `_metadata.portee` (même lecture,
 * `lirePorteeObjet`) ; Registre l'ignore.
 */
export function lirePortee(texte: string): Portee | null {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    return null
  }
  if (typeof brut !== 'object' || brut === null) return null
  const meta = (brut as { _metadata?: unknown })._metadata
  if (typeof meta !== 'object' || meta === null) return null
  return lirePorteeObjet((meta as { portee?: unknown }).portee)
}

/**
 * Le JSON d'une réponse de LLM COLLÉE : les modèles l'entourent de
 * ```json … ``` et de phrases, AVANT (« Voici le fichier : ») comme APRÈS
 * (« cliquez sur le bouton accolades {} » : c'est ce que nos propres
 * consignes leur font écrire).
 *
 * On cherche, accolade par accolade, un objet ÉQUILIBRÉ (les accolades dans
 * les chaînes JSON ne comptent pas) qui se lit comme un export de classeur
 * (`chapters` ou `format_version`). Une accolade de la prose, avant ou après,
 * est sautée : `:::etape{photo=gauche}` (relecture adverse du 2026-10-04),
 * `{}` (2026-10-22, une vraie réponse ne s'importait pas : l'ancienne
 * méthode prenait du premier `{` au DERNIER `}`, celui de la prose).
 *
 * Jette une `Error` au message destiné à la personne :
 *   - plusieurs exports DIFFÉRENTS (deux blocs, avant / après) ;
 *   - un export qui commence mais ne se ferme pas : réponse coupée ;
 *   - aucune accolade : pas de fichier dans la réponse.
 * Rien de tout cela (un JSON qui n'est pas un export, un texte abîmé) : le
 * texte est rendu, et la lecture (`parseImportJson`) dira ce qui ne va pas.
 */
export function extraireJson(texte: string): string {
  if (!texte.includes('{')) throw new Error(MESSAGE_SANS_FICHIER)
  const exports: string[] = []
  const formes = new Set<string>()
  let coupe = false
  let i = texte.indexOf('{')
  while (i !== -1) {
    if (ouvreObjet(texte, i)) {
      const fin = finObjet(texte, i)
      if (fin === -1) {
        if (DEBUT_EXPORT.test(texte.slice(i, i + 200))) coupe = true
      } else {
        const tranche = texte.slice(i, fin + 1)
        const valeur = lireObjet(tranche)
        if (valeur !== null && estExport(valeur)) {
          exports.push(tranche)
          formes.add(JSON.stringify(valeur))
          i = texte.indexOf('{', fin + 1)
          continue
        }
      }
    }
    i = texte.indexOf('{', i + 1)
  }
  if (formes.size > 1) throw new Error(MESSAGE_PLUSIEURS)
  if (exports.length > 0) return exports[0]
  if (coupe) throw new Error(MESSAGE_COUPE)
  return extraireAncien(texte)
}

export const MESSAGE_SANS_FICHIER =
  'Cette réponse ne contient pas de fichier à importer. Demandez au LLM le fichier complet, dans un seul bloc.'
export const MESSAGE_COUPE =
  'La réponse est coupée : la fin du fichier manque. Demandez au LLM de le renvoyer en entier, dans un seul bloc.'
export const MESSAGE_PLUSIEURS =
  'Cette réponse contient plusieurs versions du fichier. Collez seulement celle à importer, ou demandez au LLM un seul bloc.'

/** Premières clés d'un export (ordre de `construireExport`, ou d'un LLM). */
const DEBUT_EXPORT = /^\{\s*"(format_version|_metadata|classeur|chapters)"/

/** `{` qui ouvre un objet JSON : suivie d'une clé ou d'une fermeture. */
function ouvreObjet(texte: string, i: number): boolean {
  return /^\{\s*["}]/.test(texte.slice(i, i + 64))
}

/** Indice de l'accolade qui ferme l'objet ouvert en `debut`, ou -1. */
function finObjet(texte: string, debut: number): number {
  let profondeur = 0
  let chaine = false
  for (let j = debut; j < texte.length; j++) {
    const c = texte[j]
    if (chaine) {
      if (c === '\\') j++
      else if (c === '"') chaine = false
    } else if (c === '"') chaine = true
    else if (c === '{') profondeur++
    else if (c === '}') {
      profondeur--
      if (profondeur === 0) return j
    }
  }
  return -1
}

function lireObjet(tranche: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(tranche)
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function estExport(v: Record<string, unknown>): boolean {
  return Array.isArray(v.chapters) || typeof v.format_version === 'number'
}

/**
 * Repli : aucune tranche ne se lit comme un export. Du premier `{` au
 * dernier `}`, en essayant les accolades suivantes (au plus
 * `ESSAIS_EXTRACTION`), pour que la lecture parle du vrai texte.
 */
const ESSAIS_EXTRACTION = 50

function extraireAncien(texte: string): string {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut === -1 || fin <= debut) return texte.trim()
  const premier = texte.slice(debut, fin + 1)
  let d = debut
  for (
    let essai = 0;
    essai < ESSAIS_EXTRACTION && d !== -1 && d < fin;
    essai++
  ) {
    const tranche = texte.slice(d, fin + 1)
    try {
      JSON.parse(tranche)
      return tranche
    } catch {
      d = texte.indexOf('{', d + 1)
    }
  }
  return premier
}

// ---------------------------------------------------------------------------
// Fusion limitée à la portée
// ---------------------------------------------------------------------------

/** Où l'on réimporte : un chapitre ou un document du classeur. */
export type CiblePortee =
  | { type: 'chapitre'; chapitreId: number }
  | { type: 'document'; documentId: number }

/**
 * Horodatage du fichier RETIRÉ : la base date l'import à `now()`. En
 * remplacement, la fusion recopie l'`updated_at` du fichier (E6) — un
 * élément importé aurait repris sa date d'EXPORT, et un éditeur ouvert avant
 * l'import (sauvegarde conditionnée à cette date) aurait écrasé le travail
 * de l'IA sans voir de conflit.
 */
export function sansHorodatage(item: ItemJson): ItemJson {
  const { updated_at: _ignore, ...reste } = item
  return reste
}

const cleItem = (kind: string, id: number) => `${kind}:${id}`

/**
 * Plan d'un réimport limité à `cible`. Jette une `Error` au message destiné
 * à l'utilisateur si le fichier ne correspond pas à la cible (autre
 * chapitre, autre document, plusieurs chapitres…).
 *
 * `exclus` : clés (`clesActions`) des éléments que l'utilisateur a refusés
 * dans l'aperçu ; leurs actions sont retirées du plan (`filtrerPlan`). Sans
 * `exclus`, ou vide, le plan est exactement celui d'avant le refus.
 *
 * L'interface passe par `planifierImport` (`importIa.ts`), qui DÉDUIT la
 * cible du fichier : elle n'arrive jamais ici avec un fichier d'une autre
 * portée.
 */
export function planifierFusionPortee(
  local: EtatLocal,
  fichier: ClasseurJson,
  cible: CiblePortee,
  exclus?: ReadonlySet<string>,
): PlanFusion {
  if (fichier.chapters.length !== 1) {
    throw new Error(
      `Ce fichier contient ${fichier.chapters.length} chapitres : un export de chapitre ou de document n'en contient qu'un. Pour un classeur complet, utilisez l'import depuis l'accueil du classeur.`,
    )
  }
  const plan =
    cible.type === 'chapitre'
      ? planChapitre(local, fichier, cible.chapitreId)
      : planDocument(local, fichier, cible.documentId)
  return exclus === undefined ? plan : filtrerPlan(plan, exclus).plan
}

// ---------------------------------------------------------------------------
// Refus d'un élément dans l'aperçu (étape 1 du plan classeur-fonctions)
// ---------------------------------------------------------------------------

/**
 * Clé de refus d'une action (décision D13). Le plan est RECALCULÉ à l'import
 * sur l'état relu : un refus ne peut donc pas viser un indice, il vise une
 * clé qui survit au recalcul.
 *   - modification, restauration, suppression : `kind:id` (l'id local) ;
 *   - création (ni id, souvent ni uuid quand un LLM l'invente) : la position
 *     et le titre du fichier, `nouveau:kind:position:titre` ;
 *   - mise à la corbeille d'un chapitre (demandée par `"supprimer": true`) :
 *     `chapitre:id`, refusable comme un élément ;
 *   - autre action de chapitre : `null`, jamais refusable (le libellé ou la
 *     description du chapitre suivent le fichier).
 */
export function cleAction(a: ActionFusion): string | null {
  switch (a.type) {
    case 'modifierItem':
    case 'restaurerItem':
      return cleItem(a.item.kind, a.id)
    case 'supprimerItem':
      return cleItem(a.kind, a.id)
    case 'creerItem':
      return `nouveau:${a.item.kind}:${String(a.sort_order)}:${a.item.input.title}`
    case 'supprimerChapitre':
      return `chapitre:${String(a.id)}`
    default:
      return null
  }
}

/**
 * Les clés de toutes les actions, dans l'ordre. Deux créations de même
 * position et de même titre recevraient la même clé : la seconde prend le
 * suffixe `#2`, la troisième `#3`… — stable d'un recalcul à l'autre, le plan
 * suivant l'ordre du fichier.
 */
export function clesActions(
  actions: ReadonlyArray<ActionFusion>,
): Array<string | null> {
  const vues = new Map<string, number>()
  return actions.map((a) => {
    const base = cleAction(a)
    if (base === null) return null
    const rang = (vues.get(base) ?? 0) + 1
    vues.set(base, rang)
    return rang === 1 ? base : `${base}#${String(rang)}`
  })
}

/** Ligne d'aperçu attendue pour une action : son `action` et son `kind`. */
function signatureApercu(a: ActionFusion): [ActionApercu, string] {
  switch (a.type) {
    case 'creerChapitre':
    case 'restaurerChapitre':
      return ['insert', 'chapter']
    case 'modifierChapitre':
      return ['update', 'chapter']
    case 'supprimerChapitre':
      return ['delete', 'chapter']
    case 'creerItem':
    case 'restaurerItem':
      return ['insert', a.item.kind]
    case 'modifierItem':
      return ['update', a.item.kind]
    case 'supprimerItem':
      return ['delete', a.kind]
  }
}

/**
 * Indice, dans `apercu`, de la ligne de chaque action (−1 si aucune). Le
 * planificateur pousse une ligne par action, dans le MÊME ordre (les lignes
 * « ignoré » n'ont pas d'action) : on apparie donc en avançant, chaque ligne
 * servant une seule fois.
 */
export function alignerApercu(
  actions: ReadonlyArray<ActionFusion>,
  apercu: ReadonlyArray<MergePreviewItem>,
): number[] {
  let curseur = 0
  return actions.map((a) => {
    const [action, kind] = signatureApercu(a)
    for (let i = curseur; i < apercu.length; i++) {
      if (apercu[i].action === action && apercu[i].kind === kind) {
        curseur = i + 1
        return i
      }
    }
    return -1
  })
}

/**
 * Retire du plan les actions refusées, AVANT toute écriture (le circuit
 * d'`appliquerPlanifie` teste ensuite « plus aucune action » : tout refuser
 * n'écrit rien, pas même un point de restauration).
 *
 * Compteurs recalculés : une modification ou une suppression refusée laisse
 * l'élément local tel quel (`unchanged`) ; une création ou une restauration
 * refusée laisse un élément du fichier non importé (`skipped`). L'aperçu
 * perd les lignes des actions retirées. `ignores` = nombre d'actions
 * retirées (message « N document(s) ignoré(s) à votre demande »).
 *
 * Aucun refus effectif : le plan est rendu TEL QUEL (même objet).
 */
export function filtrerPlan(
  plan: PlanFusion,
  exclus: ReadonlySet<string>,
): { plan: PlanFusion; ignores: number } {
  const cles = clesActions(plan.actions)
  const retirees = new Set<number>()
  cles.forEach((cle, i) => {
    if (cle !== null && exclus.has(cle)) retirees.add(i)
  })
  if (retirees.size === 0) return { plan, ignores: 0 }

  const resultat = { ...plan.resultat }
  for (const i of retirees) {
    const a = plan.actions[i]
    if (a.type === 'modifierItem') {
      resultat.updated -= 1
      resultat.unchanged += 1
    } else if (a.type === 'supprimerItem' || a.type === 'supprimerChapitre') {
      resultat.deleted -= 1
      resultat.unchanged += 1
    } else {
      // creerItem, restaurerItem : seules autres actions à clé.
      resultat.inserted -= 1
      resultat.skipped += 1
    }
  }
  const lignesRetirees = new Set(
    alignerApercu(plan.actions, plan.apercu).filter((_, i) => retirees.has(i)),
  )
  return {
    plan: {
      actions: plan.actions.filter((_, i) => !retirees.has(i)),
      warnings: plan.warnings,
      resultat,
      apercu: plan.apercu.filter((_, i) => !lignesRetirees.has(i)),
    },
    ignores: retirees.size,
  }
}

// ---------------------------------------------------------------------------
// Lignes de l'aperçu d'import : avant / après de chaque action
// ---------------------------------------------------------------------------

/** Les champs de texte d'un élément (vides quand la famille n'en a pas). */
export interface EtatTexte {
  title: string
  description: string
  content: string
}

export type GenreLigne =
  'chapitre' | 'creation' | 'modification' | 'restauration' | 'suppression'

/**
 * Ce qui change dans une modification : le texte, l'ordre seul (« déplacé »,
 * textes et réglages identiques) ou un autre réglage (périodicité, nombre de
 * lignes, identifiant adopté) sans changement de texte.
 */
export type Changement = 'texte' | 'ordre' | 'autre'

export interface LigneImport {
  /** Clé de refus (`clesActions`) ; `null` = ligne sans case (chapitre). */
  cle: string | null
  genre: GenreLigne
  kind: ItemKind | 'chapter'
  titre: string
  avant: EtatTexte
  apres: EtatTexte
  changement: Changement
  /**
   * Modification d'un élément dont la position (ou le chapitre) change :
   * la refuser peut laisser deux positions égales (ordre ambigu, signalé).
   * Toujours faux pour un chapitre (jamais refusable).
   */
  ordreChange: boolean
  /** Numéro actuel d'un document existant (version prévue) ; `null` sinon. */
  numero: NumeroVersion | null
  /**
   * Réglage d'une feuille, en clair (étape 6, D4) : « Mensuel → Annuel »,
   * « 14 → 20 lignes » quand il change ; « Mensuel », « 20 lignes » pour une
   * feuille créée. Absent sinon.
   */
  reglage?: string
}

const TEXTE_VIDE: EtatTexte = { title: '', description: '', content: '' }

function texteDe(champs: {
  title: string
  description?: string
  content?: string
}): EtatTexte {
  return {
    title: champs.title,
    description: champs.description ?? '',
    content: champs.content ?? '',
  }
}

function memesTextes(a: EtatTexte, b: EtatTexte): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.content === b.content
  )
}

/** Réglages hors texte d'une famille (périodicité, nombre de lignes). */
function memesReglages(item: ChampsItem, existant: ChapterItem): boolean {
  if (item.kind === 'tracking_sheet' && existant.kind === 'tracking_sheet')
    return item.input.periodicite_id === existant.data.periodicite_id
  if (item.kind === 'signature_sheet' && existant.kind === 'signature_sheet')
    return item.input.nombre === existant.data.nombre
  return true
}

/** Libellé d'une périodicité locale, ou son numéro si elle est inconnue. */
function libellePeriodicite(local: EtatLocal, id: number): string {
  return (
    local.periodicites?.find((p) => p.id === id)?.label ?? `n° ${String(id)}`
  )
}

function lignesSignature(n: number): string {
  return `${String(n)} ${n > 1 ? 'lignes' : 'ligne'}`
}

/** Voir `LigneImport.reglage`. */
function reglageEnClair(
  local: EtatLocal,
  item: ChampsItem,
  existant: ChapterItem | undefined,
): string | undefined {
  if (item.kind === 'tracking_sheet') {
    const apres = libellePeriodicite(local, item.input.periodicite_id)
    if (existant === undefined) return apres
    if (
      existant.kind === 'tracking_sheet' &&
      existant.data.periodicite_id !== item.input.periodicite_id
    )
      return `${libellePeriodicite(local, existant.data.periodicite_id)} → ${apres}`
    return undefined
  }
  if (item.kind === 'signature_sheet') {
    if (existant === undefined) return lignesSignature(item.input.nombre)
    if (
      existant.kind === 'signature_sheet' &&
      existant.data.nombre !== item.input.nombre
    )
      return `${String(existant.data.nombre)} → ${lignesSignature(item.input.nombre)}`
  }
  return undefined
}

/**
 * Une ligne par action du plan, dans l'ordre du plan, avec l'état AVANT (lu
 * dans `local`, l'état qui a servi au plan) et l'état APRÈS. Pur et léger :
 * aucune comparaison de texte ici — le diff ligne à ligne est calculé par
 * l'interface au dépliage seulement (une table LCS peut peser des Mo).
 */
export function lignesImport(
  local: EtatLocal,
  plan: PlanFusion,
): LigneImport[] {
  const items = indexItems(local.content)
  const cles = clesActions(plan.actions)
  const lignes: LigneImport[] = []
  plan.actions.forEach((a, i) => {
    const cle = cles[i]
    if (
      a.type === 'creerChapitre' ||
      a.type === 'restaurerChapitre' ||
      a.type === 'modifierChapitre' ||
      a.type === 'supprimerChapitre'
    ) {
      const ch =
        a.type === 'creerChapitre'
          ? undefined
          : local.chapters.find((c) => c.id === a.id)
      const avant =
        ch === undefined
          ? TEXTE_VIDE
          : texteDe({ title: ch.label, description: ch.description })
      const apres =
        a.type === 'supprimerChapitre'
          ? TEXTE_VIDE
          : texteDe({ title: a.label, description: a.description })
      const corbeille = a.type === 'supprimerChapitre'
      lignes.push({
        cle: corbeille ? cle : null,
        genre: corbeille ? 'suppression' : 'chapitre',
        kind: 'chapter',
        titre: corbeille ? avant.title : apres.title,
        avant,
        apres,
        changement: memesTextes(avant, apres) ? 'autre' : 'texte',
        ordreChange: false,
        numero: null,
      })
      return
    }
    if (a.type === 'supprimerItem') {
      const existant = items.get(cleItem(a.kind, a.id))
      const avant = existant === undefined ? TEXTE_VIDE : texteDe(existant.data)
      lignes.push({
        cle,
        genre: 'suppression',
        kind: a.kind,
        titre: avant.title,
        avant,
        apres: TEXTE_VIDE,
        changement: 'texte',
        ordreChange: false,
        numero: null,
      })
      return
    }
    const apres = texteDe(a.item.input)
    if (a.type === 'creerItem') {
      const reglage = reglageEnClair(local, a.item, undefined)
      lignes.push({
        cle,
        genre: 'creation',
        kind: a.item.kind,
        titre: apres.title,
        avant: TEXTE_VIDE,
        apres,
        changement: 'texte',
        ordreChange: false,
        numero: null,
        ...(reglage === undefined ? {} : { reglage }),
      })
      return
    }
    const existant = items.get(cleItem(a.item.kind, a.id))
    const reglage =
      existant === undefined
        ? undefined
        : reglageEnClair(local, a.item, existant)
    const avant = existant === undefined ? TEXTE_VIDE : texteDe(existant.data)
    const ordreChange = a.sort_order !== undefined || a.chapitre !== undefined
    const changement: Changement = !memesTextes(avant, apres)
      ? 'texte'
      : existant !== undefined &&
          memesReglages(a.item, existant) &&
          a.uuid === undefined &&
          ordreChange
        ? 'ordre'
        : 'autre'
    lignes.push({
      cle,
      genre: a.type === 'modifierItem' ? 'modification' : 'restauration',
      kind: a.item.kind,
      titre: apres.title,
      avant,
      apres,
      changement,
      ordreChange: a.type === 'modifierItem' && ordreChange,
      numero:
        existant?.kind === 'document' ? numeroDocument(existant.data) : null,
      ...(reglage === undefined ? {} : { reglage }),
    })
  })
  return lignes
}

/** Chapitre où une ligne de l'aperçu prend place (regroupement à l'écran). */
export interface ChapitreLigne {
  /** Identité stable : `local:<id>` ou `nouveau:<index>`. */
  cle: string
  /** Libellé APRÈS l'import (celui du fichier quand il le renomme). */
  libelle: string
}

/**
 * Le chapitre de chaque ligne de `lignesImport` (même ordre, une entrée par
 * action) : celui où l'élément ARRIVE (création, déplacement, restauration),
 * celui qu'il quitte pour une suppression, le chapitre lui-même pour une
 * action de chapitre. Libellé après l'import : un chapitre renommé par le
 * fichier est affiché sous son nouveau nom. Pur, sans écriture.
 */
export function chapitresDesLignes(
  local: EtatLocal,
  plan: PlanFusion,
): ChapitreLigne[] {
  const items = indexItems(local.content)
  const libelles = new Map<string, string>()
  for (const c of local.chapters) libelles.set(`local:${String(c.id)}`, c.label)
  for (const a of plan.actions) {
    if (a.type === 'creerChapitre')
      libelles.set(`nouveau:${String(a.index)}`, a.label)
    else if (a.type === 'modifierChapitre' || a.type === 'restaurerChapitre')
      libelles.set(`local:${String(a.id)}`, a.label)
  }
  const deRef = (
    ref: { type: 'local'; id: number } | { type: 'nouveau'; index: number },
  ) =>
    ref.type === 'local'
      ? `local:${String(ref.id)}`
      : `nouveau:${String(ref.index)}`
  const deLocal = (id: number | undefined) =>
    id === undefined ? 'local:?' : `local:${String(id)}`
  return plan.actions.map((a) => {
    let cle: string
    switch (a.type) {
      case 'creerChapitre':
        cle = `nouveau:${String(a.index)}`
        break
      case 'modifierChapitre':
      case 'restaurerChapitre':
      case 'supprimerChapitre':
        cle = deLocal(a.id)
        break
      case 'creerItem':
      case 'restaurerItem':
        cle = deRef(a.chapitre)
        break
      case 'modifierItem':
        cle =
          a.chapitre !== undefined
            ? deRef(a.chapitre)
            : deLocal(items.get(cleItem(a.item.kind, a.id))?.data.chapter_id)
        break
      case 'supprimerItem':
        cle = deLocal(items.get(cleItem(a.kind, a.id))?.data.chapter_id)
        break
    }
    return { cle, libelle: libelles.get(cle) ?? 'Sans chapitre' }
  })
}

function planChapitre(
  local: EtatLocal,
  fichier: ClasseurJson,
  chapitreId: number,
): PlanFusion {
  const chapitre = local.chapters.find(
    (c) => c.id === chapitreId && c.deleted_at === null,
  )
  if (chapitre === undefined)
    throw new Error('Chapitre introuvable ou supprimé.')
  const chJson = fichier.chapters[0]
  if (chJson.uuid !== undefined && chJson.uuid !== chapitre.uuid) {
    throw new Error(
      `Ce fichier concerne un autre chapitre (${chJson.label}), pas celui-ci (${chapitre.label}).`,
    )
  }
  // Un élément du fichier qui porte l'uuid d'un élément HORS du chapitre
  // (relecture adverse du 2026-10-04) : la fusion l'appariait par uuid
  // (R5, tout le classeur), le déplaçait ici et l'écrasait. Rien hors de la
  // portée n'est touché : uuid retiré (unique en base), l'élément est créé.
  // Marqué `supprimer`, il est écarté : rien n'est supprimé hors du chapitre.
  const horsPortee = new Set(
    flattenItems(local.content)
      .filter((it) => it.data.chapter_id !== chapitre.id && it.data.uuid)
      .map((it) => it.data.uuid),
  )
  const avertissements: string[] = []
  const itemsCibles = chJson.items.flatMap((item) => {
    const propre = sansHorodatage(item)
    if (item.uuid === undefined || !horsPortee.has(item.uuid)) return [propre]
    if (item.supprimer === true) {
      avertissements.push(
        `${item.title.trim() === '' ? 'Un élément' : item.title} appartient à un autre chapitre : il n'est pas supprimé.`,
      )
      return []
    }
    const { uuid: _etranger, ...sansUuid } = propre
    avertissements.push(
      item.title.trim() === ''
        ? "Un élément sans titre portait l'identifiant d'un élément d'un autre chapitre : ignoré"
        : `${item.title} portait l'identifiant d'un élément d'un autre chapitre : créé comme nouvel élément`,
    )
    return [sansUuid]
  })
  // Le chapitre du fichier EST le chapitre ouvert (même sans uuid, fichier
  // v1 ou uuid retiré) ; sa position dans le classeur n'est pas à lui.
  const fichierCible: ClasseurJson = {
    ...fichier,
    chapters: [
      {
        ...chJson,
        uuid: chapitre.uuid,
        sort_order: chapitre.sort_order,
        items: itemsCibles,
      },
    ],
  }
  const plan = planSuppressionsDemandees(
    local,
    fichierCible,
    (f) => planifierFusion(local, f, { replace: true }),
    false,
  )
  // Garde-fou : aucune suppression hors du chapitre (les autres chapitres,
  // absents du fichier, ne sont jamais « demandés », mais on ne le suppose pas).
  const items = indexItems(local.content)
  const garde = garderActions(
    plan,
    (a) =>
      a.type === 'supprimerChapitre'
        ? a.id === chapitre.id
        : a.type === 'supprimerItem'
          ? items.get(cleItem(a.kind, a.id))?.data.chapter_id === chapitre.id
          : true,
    false,
  )
  // Compteurs : ceux de la fusion, avec les seules suppressions retenues.
  // Lignes d'aperçu des éléments mis à la corbeille : sous le libellé du
  // chapitre du FICHIER, comme les autres lignes (et comme avant le
  // 2026-10-20).
  return {
    ...garde,
    apercu: garde.apercu.map((l) =>
      l.action === 'delete' && l.kind !== 'chapter'
        ? { ...l, chapter_label: chJson.label, icon: chJson.icon }
        : l,
    ),
    warnings: [...avertissements, ...garde.warnings],
    resultat: {
      ...garde.resultat,
      deleted: garde.actions.filter((a) => cleSuppression(a) !== null).length,
    },
  }
}

function planDocument(
  local: EtatLocal,
  fichier: ClasseurJson,
  documentId: number,
): PlanFusion {
  const document = local.content.documents.find(
    (d) => d.id === documentId && d.deleted_at === null,
  )
  if (document === undefined)
    throw new Error('Document introuvable ou supprimé.')
  const chapitre = local.chapters.find((c) => c.id === document.chapter_id)
  if (chapitre === undefined)
    throw new Error('Chapitre du document introuvable.')

  const docs = fichier.chapters[0].items.filter((i) => i.kind === 'document')
  if (docs.length !== 1 || fichier.chapters[0].items.length !== 1) {
    throw new Error(
      'Un export de document doit contenir exactement un document. Pour un chapitre entier, importez depuis la page du chapitre.',
    )
  }
  const docJson = docs[0]
  if (docJson.uuid !== document.uuid) {
    throw new Error(
      docJson.uuid === undefined
        ? "Le document du fichier n'a plus d'identifiant (uuid) : impossible de savoir qu'il s'agit de celui-ci."
        : `Ce fichier concerne un autre document (${docJson.title}), pas celui-ci (${document.title}).`,
    )
  }
  // Suppression DEMANDÉE (`"supprimer": true`) : le document part à la
  // corbeille, rien d'autre ne change.
  if (docJson.supprimer === true) {
    return {
      actions: [{ type: 'supprimerItem', kind: 'document', id: document.id }],
      warnings: [],
      resultat: {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        deleted: 1,
      },
      apercu: [
        {
          action: 'delete',
          kind: 'document',
          title: document.title,
          chapter_label: chapitre.label,
          icon: chapitre.icon,
        },
      ],
    }
  }
  // Chapitre et position LOCAUX : seul le document peut changer.
  const fichierCible: ClasseurJson = {
    ...fichier,
    chapters: [
      {
        uid: 'document',
        uuid: chapitre.uuid,
        label: chapitre.label,
        icon: chapitre.icon,
        description: chapitre.description,
        sort_order: chapitre.sort_order,
        items: [
          { ...sansHorodatage(docJson), sort_order: document.sort_order },
        ],
      },
    ],
  }
  const plan = planifierFusion(local, fichierCible, { replace: true })
  const actions = plan.actions.filter(
    (a) =>
      (a.type === 'modifierItem' || a.type === 'restaurerItem') &&
      a.id === document.id &&
      a.item.kind === 'document',
  )
  const modifie = actions.length > 0
  return {
    actions,
    warnings: plan.warnings,
    resultat: {
      inserted: 0,
      updated: modifie ? 1 : 0,
      unchanged: modifie ? 0 : 1,
      skipped: 0,
      deleted: 0,
    },
    apercu: modifie
      ? [
          {
            action: 'update',
            kind: 'document',
            title: docJson.title,
            chapter_label: chapitre.label,
            icon: chapitre.icon,
          },
        ]
      : [],
  }
}

function indexItems(content: ChapterContent): Map<string, ChapterItem> {
  const m = new Map<string, ChapterItem>()
  for (const it of flattenItems(content))
    m.set(cleItem(it.kind, it.data.id), it)
  return m
}

// ---------------------------------------------------------------------------
// Suppressions demandées par le fichier (décision utilisateur du 2026-10-20)
// ---------------------------------------------------------------------------

/** Clé d'une suppression (`kind:id`, `chapitre:id`) ; `null` pour une autre action. */
function cleSuppression(a: ActionFusion): string | null {
  if (a.type === 'supprimerItem') return cleItem(a.kind, a.id)
  if (a.type === 'supprimerChapitre') return `chapitre:${String(a.id)}`
  return null
}

/**
 * Le fichier sans ses éléments ni ses chapitres marqués `supprimer` ; le
 * MÊME objet s'il n'y en a aucun.
 */
export function sansMarquesSupprimer(fichier: ClasseurJson): ClasseurJson {
  const marque = fichier.chapters.some(
    (c) => c.supprimer === true || c.items.some((i) => i.supprimer === true),
  )
  if (!marque) return fichier
  return {
    ...fichier,
    chapters: fichier.chapters
      .filter((c) => c.supprimer !== true)
      .map((c) =>
        c.items.some((i) => i.supprimer === true)
          ? { ...c, items: c.items.filter((i) => i.supprimer !== true) }
          : c,
      ),
  }
}

/**
 * Garde les actions retenues par `garder`, et leurs lignes d'aperçu
 * (`alignerApercu`). Une suppression retirée laisse l'élément tel quel :
 * comptée `unchanged` si `compterGardes`, sinon les compteurs restent ceux
 * du plan d'origine (l'appelant les recalcule). Rien de retiré : le plan
 * TEL QUEL (même objet).
 */
export function garderActions(
  plan: PlanFusion,
  garder: (a: ActionFusion) => boolean,
  compterGardes = true,
): PlanFusion {
  const retirees = new Set<number>()
  plan.actions.forEach((a, i) => {
    if (!garder(a)) retirees.add(i)
  })
  if (retirees.size === 0) return plan
  const lignes = new Set(
    alignerApercu(plan.actions, plan.apercu).filter((_, i) => retirees.has(i)),
  )
  const suppressions = [...retirees].filter(
    (i) => cleSuppression(plan.actions[i]) !== null,
  ).length
  return {
    actions: plan.actions.filter((_, i) => !retirees.has(i)),
    warnings: plan.warnings,
    resultat: compterGardes
      ? {
          ...plan.resultat,
          deleted: plan.resultat.deleted - suppressions,
          unchanged: plan.resultat.unchanged + suppressions,
        }
      : plan.resultat,
    apercu: plan.apercu.filter((_, i) => !lignes.has(i)),
  }
}

/**
 * Plan d'un import où RIEN d'absent n'est supprimé, et où un élément (ou un
 * chapitre) marqué `"supprimer": true` part à la corbeille.
 *
 * `planifier` est le plan BRUT en remplacement (R11 : tout absent y est
 * supprimé). Il est calculé sur le fichier sans les marqués (`sans`) puis,
 * s'il y en a, sur le fichier complet (`plein`). Une suppression de `sans`
 * absente de `plein` vise exactement ce qu'un marqué appariait (mêmes règles
 * R1, R5, E7, E9 que le reste : aucune seconde version de l'appariement) ;
 * toutes les autres visent des absents et sont retirées. Un élément d'un
 * chapitre mis à la corbeille le suit sans action à part, comme la
 * suppression d'un chapitre à l'écran. Un marqué qui n'apparie rien
 * (nouveau, ou déjà à la corbeille) ne fait rien.
 */
export function planSuppressionsDemandees(
  local: EtatLocal,
  fichier: ClasseurJson,
  planifier: (fichier: ClasseurJson) => PlanFusion,
  compterGardes = true,
): PlanFusion {
  const reduit = sansMarquesSupprimer(fichier)
  const sans = planifier(reduit)
  const demandees = new Set<string>()
  if (reduit !== fichier) {
    const plein = new Set(
      planifier(fichier).actions.flatMap((a) => cleSuppression(a) ?? []),
    )
    for (const a of sans.actions) {
      const c = cleSuppression(a)
      if (c !== null && !plein.has(c)) demandees.add(c)
    }
  }
  const items = indexItems(local.content)
  return garderActions(
    sans,
    (a) => {
      const c = cleSuppression(a)
      if (c === null) return true
      if (!demandees.has(c)) return false
      if (a.type !== 'supprimerItem') return true
      const ch = items.get(c)?.data.chapter_id
      return ch === undefined || !demandees.has(`chapitre:${String(ch)}`)
    },
    compterGardes,
  )
}
