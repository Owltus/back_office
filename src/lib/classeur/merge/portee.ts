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
 * La RÉPONSE du LLM n'est plus ce fichier (décision utilisateur du
 * 2026-10-23) : une liste de changements balisés, planifiée par
 * `changements.ts`, qui borne ce qui change à la portée. Ce module garde
 * l'export, la lecture d'une réponse collée (`extraireJson`) et ce que
 * partagent l'aperçu et les refus (clés, lignes avant / après, filtrage).
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
  MetadataJson,
  Portee,
} from '#/lib/classeur/merge/schema.ts'
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
  'Cette réponse ne contient pas de changements à importer. Demandez au LLM la liste des changements, dans un seul bloc.'
export const MESSAGE_COUPE =
  'La réponse est coupée : la fin de la liste manque. Demandez au LLM de la renvoyer en entier, dans un seul bloc.'
export const MESSAGE_PLUSIEURS =
  'Cette réponse contient plusieurs listes de changements. Collez seulement celle à importer, ou demandez au LLM un seul bloc.'

/** Premières clés d'un export (ordre de `construireExport`, ou d'un LLM). */
const DEBUT_EXPORT =
  /^\{\s*"(format_version|_metadata|classeur|chapters|changements)"/

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
  return (
    Array.isArray(v.changements) ||
    Array.isArray(v.chapters) ||
    typeof v.format_version === 'number'
  )
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

const cleItem = (kind: string, id: number) => `${kind}:${id}`

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
 *   - mise à la corbeille d'un chapitre : `chapitre:id`, refusable comme un
 *     élément ;
 *   - création imposée par un changement (`creerItem.cle`) : celle-ci ;
 *   - renumérotation seule (`ordonnerItem`, `ordonnerChapitre`) : `null`,
 *     elle suit les changements qui l'imposent (`causes`) ;
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
      return (
        a.cle ??
        `nouveau:${a.item.kind}:${String(a.sort_order)}:${a.item.input.title}`
      )
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

/**
 * Ligne d'aperçu attendue pour une action : son `action` et son `kind` ;
 * `null` pour une renumérotation, qui n'a pas de ligne.
 */
function signatureApercu(a: ActionFusion): [ActionApercu, string] | null {
  switch (a.type) {
    case 'ordonnerItem':
    case 'ordonnerChapitre':
      return null
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
    const signature = signatureApercu(a)
    if (signature === null) return -1
    const [action, kind] = signature
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
  const ignores = retirees.size
  // Une renumérotation dont TOUS les changements qui l'imposaient sont
  // refusés n'a plus lieu d'être (le plan appliqué est recalculé sans eux).
  plan.actions.forEach((a, i) => {
    if (
      (a.type === 'ordonnerItem' || a.type === 'ordonnerChapitre') &&
      a.causes.length > 0 &&
      a.causes.every((c) => exclus.has(c))
    )
      retirees.add(i)
  })

  const resultat = { ...plan.resultat }
  for (const i of retirees) {
    const a = plan.actions[i]
    if (a.type === 'ordonnerItem' || a.type === 'ordonnerChapitre') continue
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
    ignores,
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
  /**
   * Ligne d'un chapitre : ce qui lui arrive. Un chapitre CRÉÉ ou RETIRÉ DE
   * LA CORBEILLE (un fichier exporté avant sa suppression le contient
   * encore) ne se lit pas « modifié » (trouvé au navigateur le 2026-10-22).
   */
  actionChapitre?: 'creation' | 'restauration' | 'modification' | 'deplacement'
  /**
   * Élément qui change de chapitre : le libellé du chapitre qu'il QUITTE
   * (« déplacé depuis X » ; la ligne est rangée sous celui où il arrive).
   */
  provenance?: string
  /**
   * Élément changé dans l'application depuis l'export dont vient le fichier
   * (`clesChangeesDepuisExport`) : proposé non importé.
   */
  depuisExport?: true
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
    // Une renumérotation n'a pas de ligne (`chapitresDesLignes` non plus).
    if (a.type === 'ordonnerItem' || a.type === 'ordonnerChapitre') return
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
        ...(corbeille
          ? {}
          : {
              actionChapitre:
                a.type === 'creerChapitre'
                  ? ('creation' as const)
                  : a.type === 'restaurerChapitre'
                    ? ('restauration' as const)
                    : a.sort_order !== undefined &&
                        ch !== undefined &&
                        ch.icon === a.icon &&
                        memesTextes(avant, apres)
                      ? ('deplacement' as const)
                      : ('modification' as const),
            }),
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
    const provenance =
      a.type === 'modifierItem' &&
      a.chapitre !== undefined &&
      existant !== undefined
        ? local.chapters.find((c) => c.id === existant.data.chapter_id)?.label
        : undefined
    lignes.push({
      ...(provenance === undefined ? {} : { provenance }),
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
  return plan.actions.flatMap((a) => {
    let cle: string
    switch (a.type) {
      case 'ordonnerItem':
      case 'ordonnerChapitre':
        return []
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
    return [{ cle, libelle: libelles.get(cle) ?? 'Sans chapitre' }]
  })
}

function indexItems(content: ChapterContent): Map<string, ChapterItem> {
  const m = new Map<string, ChapterItem>()
  for (const it of flattenItems(content))
    m.set(cleItem(it.kind, it.data.id), it)
  return m
}
