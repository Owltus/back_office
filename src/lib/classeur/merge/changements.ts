/*
 * Import des CHANGEMENTS rendus par un LLM dans un classeur existant
 * (décision utilisateur du 2026-10-23, remplace l'import d'un fichier
 * complet : « tu n'as pas besoin de tout me renvoyer, juste ce qu'il faut
 * modifier… bien tagué : à supprimer, à déplacer »).
 *
 * Le LLM ne renvoie plus le classeur : une LISTE de changements, chacun
 * marqué de son action. Pourquoi : recopier tout un classeur pour en
 * changer deux lignes laissait le LLM reformuler en silence ce qu'il ne
 * devait pas toucher, et une longue réponse se fait couper. Ici, rien n'est
 * touché qui ne soit pas annoncé.
 *
 *   { "action": "modifier",  "uuid", champs changés seulement,
 *                            et "chapitre" / "apres" s'il change de place }
 *   { "action": "supprimer", "uuid", "title" (ou "label") actuel }
 *   { "action": "deplacer",  "uuid", "title" (ou "label") actuel,
 *                            "chapitre" et / ou "apres" }
 *   { "action": "ajouter",   "kind", champs, "chapitre", "apres", "ref" }
 *
 * Règles, toutes vérifiées par l'application et jamais crues sur parole :
 *   C1 Un changement sans action reconnue est IGNORÉ, avec un avertissement
 *      (décision utilisateur : ce qui n'est pas annoncé ne passe pas).
 *   C2 Un `uuid` désigne un élément ou un chapitre de CE classeur, non
 *      supprimé, et de la nature annoncée (`kind`) ; sinon ignoré.
 *   C3 Supprimer ou déplacer exige AUSSI le titre actuel (casse et espaces
 *      ignorés) : un identifiant mal recopié ne vise jamais le mauvais
 *      élément. Titre différent ou absent : ignoré.
 *   C4 Modifier ne change QUE les champs présents ; un champ absent garde sa
 *      valeur. Un titre vidé est gardé ; `nombre` est borné de 1 à 60 ; une
 *      périodicité inconnue garde l'actuelle (ou le défaut à la création).
 *   C5 Une position se donne par `apres` : l'élément (ou le chapitre) qui
 *      précède, `null` pour le premier, absent pour la fin. Jamais par un
 *      numéro, qui heurterait celui des éléments absents de la réponse.
 *      Les numéros existants sont GARDÉS quand la place le permet ; sinon le
 *      chapitre (ou le classeur) est renuméroté de 1 à n (`ordonnerItem`).
 *   C6 Un élément n'est visé qu'une fois ; le second changement est ignoré.
 *   C7 Supprimer = corbeille (suppression douce, restaurable). Un chapitre
 *      supprimé emporte ses éléments ; un changement qui y vise ou y range un
 *      élément est ignoré.
 *   C8 La PORTÉE (`_metadata.portee`) borne ce qui peut changer : l'export
 *      d'un chapitre ne touche que ce chapitre (ni autre chapitre, ni ordre
 *      des chapitres), celui d'un document que ce document. Un fichier d'un
 *      AUTRE classeur, ou d'un chapitre ou document absent d'ici, est refusé.
 *   C9 Refus de l'aperçu (`exclus`) : appliqués AU CHANGEMENT, avant le
 *      calcul des positions, pour que les renumérotations suivent.
 *
 * Pur : ni React, ni Supabase.
 */

import type {
  ChapterItem,
  DbChapter,
  DbClasseur,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import {
  periodiciteParDefaut,
  resoudrePeriodicite,
} from '#/lib/classeur/merge/merge.ts'
import type {
  ActionFusion,
  ChampsItem,
  EtatLocal,
  MergePreviewItem,
  MergeResult,
  PlanFusion,
  RefChapitre,
} from '#/lib/classeur/merge/merge.ts'
import {
  DEFAUTS,
  estKindConnu,
  lirePorteeObjet,
} from '#/lib/classeur/merge/schema.ts'
import type {
  MetadataPeriodiciteJson,
  Portee,
} from '#/lib/classeur/merge/schema.ts'
import {
  NOMBRE_MAX,
  NOMBRE_MIN,
} from '#/lib/classeur/merge/validationImport.ts'

// ---------------------------------------------------------------------------
// Fichier
// ---------------------------------------------------------------------------

export const ACTIONS = ['modifier', 'supprimer', 'deplacer', 'ajouter'] as const
export type ActionChangement = (typeof ACTIONS)[number]

/** Un changement tel que lu (champs mal typés retirés, voir `lireChangements`). */
export interface ChangementJson {
  action?: string
  kind?: string
  uuid?: string
  ref?: string
  title?: string
  label?: string
  description?: string
  content?: string
  icon?: string
  periodicite_id?: number | null
  nombre?: number
  chapitre?: string
  /** `null` : en premier ; absent : rien dit. */
  apres?: string | null
}

export interface FichierChangements {
  changements: ChangementJson[]
  portee?: Portee
  periodicites: MetadataPeriodiciteJson[]
  /** `_metadata.generated_at` : date de l'export dont part le LLM. */
  exporteLe?: string
  /** Remarques de lecture (changement mal écrit, champ de mauvais type). */
  avertissements: string[]
}

export const MESSAGE_CLASSEUR_COMPLET =
  "Ce fichier contient un classeur entier, pas une liste de changements. Demandez au LLM de ne renvoyer que les changements, comme le dit son mode d'emploi. Pour revenir à une sauvegarde, passez par Points de restauration."
export const MESSAGE_SANS_CHANGEMENTS =
  "Ce fichier n'est pas une réponse du LLM : il n'a pas de liste de changements."
export const MESSAGE_ILLISIBLE =
  "Ce texte n'est pas lisible en entier. Collez toute la réponse du LLM."

const CHAMPS_TEXTE = [
  'action',
  'kind',
  'uuid',
  'ref',
  'title',
  'label',
  'description',
  'content',
  'icon',
  'chapitre',
] as const

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Lit la réponse (déjà extraite par `extraireJson`). Jette une `Error` au
 * message destiné à la personne si ce n'est pas une liste de changements ;
 * un changement mal écrit est seulement signalé.
 */
export function lireChangements(texte: string): FichierChangements {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    throw new Error(MESSAGE_ILLISIBLE)
  }
  if (!estObjet(brut)) throw new Error(MESSAGE_SANS_CHANGEMENTS)
  if (!Array.isArray(brut.changements)) {
    throw new Error(
      Array.isArray(brut.chapters)
        ? MESSAGE_CLASSEUR_COMPLET
        : MESSAGE_SANS_CHANGEMENTS,
    )
  }
  const avertissements: string[] = []
  const changements: ChangementJson[] = []
  brut.changements.forEach((v: unknown, i: number) => {
    const n = `Le changement n° ${String(i + 1)}`
    if (!estObjet(v)) {
      avertissements.push(`${n} est mal écrit : il est ignoré.`)
      changements.push({})
      return
    }
    const c: ChangementJson = {}
    for (const cle of CHAMPS_TEXTE) {
      const x = v[cle]
      if (x === undefined || x === null) continue
      if (typeof x === 'string') c[cle] = x
      else
        avertissements.push(
          `${n} : une information est mal écrite, elle est ignorée.`,
        )
    }
    if (
      typeof v.periodicite_id === 'number' &&
      Number.isInteger(v.periodicite_id)
    )
      c.periodicite_id = v.periodicite_id
    if (typeof v.nombre === 'number' && Number.isFinite(v.nombre))
      c.nombre = v.nombre
    if (v.apres === null) c.apres = null
    else if (typeof v.apres === 'string') c.apres = v.apres
    changements.push(c)
  })
  const meta = estObjet(brut._metadata) ? brut._metadata : {}
  const periodicites: MetadataPeriodiciteJson[] = Array.isArray(
    meta.periodicites,
  )
    ? meta.periodicites.flatMap((p: unknown) =>
        estObjet(p) &&
        typeof p.id === 'number' &&
        Number.isInteger(p.id) &&
        typeof p.label === 'string'
          ? [
              {
                id: p.id,
                label: p.label,
                nombre: typeof p.nombre === 'number' ? p.nombre : 0,
              },
            ]
          : [],
      )
    : []
  const portee = lirePorteeObjet(meta.portee)
  return {
    changements,
    periodicites,
    avertissements,
    ...(portee === null ? {} : { portee }),
    ...(typeof meta.generated_at === 'string' && meta.generated_at !== ''
      ? { exporteLe: meta.generated_at }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Portée
// ---------------------------------------------------------------------------

/** Où l'on réimporte : un chapitre ou un document du classeur. */
export type CiblePortee =
  | { type: 'chapitre'; chapitreId: number }
  | { type: 'document'; documentId: number }

/** D'où l'on importe, ou ce à quoi le fichier s'applique. */
export type ContexteImport = { type: 'classeur' } | CiblePortee

export interface DestinationImport {
  cible: ContexteImport
  /** « Ce fichier concerne le chapitre X. » quand ce n'est pas d'où l'on importe. */
  note: string | null
}

const RESTE_INTACT = 'Le reste du classeur ne change pas.'

function memeCible(a: ContexteImport, b: ContexteImport): boolean {
  if (a.type === 'chapitre' && b.type === 'chapitre')
    return a.chapitreId === b.chapitreId
  if (a.type === 'document' && b.type === 'document')
    return a.documentId === b.documentId
  return a.type === 'classeur' && b.type === 'classeur'
}

/**
 * C8 : ce que le fichier peut changer, lu dans sa portée. Sans portée (le
 * LLM a retiré `_metadata`), le classeur : chaque changement désigne son
 * élément par uuid, rien d'autre ne bouge. Jette pour un fichier d'ailleurs.
 */
export function destinationImport(
  local: EtatLocal,
  fichier: FichierChangements,
  classeur: Pick<DbClasseur, 'uuid' | 'name'>,
  contexte: ContexteImport,
): DestinationImport {
  const portee = fichier.portee
  const conclure = (
    cible: ContexteImport,
    quoi: string,
  ): DestinationImport => ({
    cible,
    note: memeCible(cible, contexte)
      ? null
      : cible.type === 'classeur'
        ? `Ce fichier concerne ${quoi}.`
        : `Ce fichier concerne ${quoi}. ${RESTE_INTACT}`,
  })
  if (portee === undefined || portee.type === 'classeur') {
    if (portee !== undefined && portee.classeur_uuid !== classeur.uuid) {
      const nom = portee.classeur_name.trim()
      throw new Error(
        nom === ''
          ? "Ce fichier vient d'un autre classeur. Importez-le dans le classeur dont il vient."
          : `Ce fichier vient du classeur ${nom}, pas de celui-ci. Importez-le dans ce classeur-là.`,
      )
    }
    return conclure({ type: 'classeur' }, 'tout le classeur')
  }
  if (portee.type === 'chapitre') {
    const ch = local.chapters.find(
      (c) => c.uuid === portee.chapitre_uuid && c.deleted_at === null,
    )
    if (ch === undefined)
      throw new Error(
        `Le chapitre ${portee.chapitre_label} n'est pas dans ce classeur, ou il est à la corbeille.`,
      )
    return conclure(
      { type: 'chapitre', chapitreId: ch.id },
      `le chapitre ${ch.label}`,
    )
  }
  const doc = local.content.documents.find(
    (d) => d.uuid === portee.document_uuid && d.deleted_at === null,
  )
  if (doc === undefined)
    throw new Error(
      `Le document ${portee.document_title} n'est pas dans ce classeur, ou il est à la corbeille.`,
    )
  return conclure(
    { type: 'document', documentId: doc.id },
    `le document ${doc.title}`,
  )
}

// ---------------------------------------------------------------------------
// Planification
// ---------------------------------------------------------------------------

const NATURES: Record<ItemKind | 'chapitre', string> = {
  document: 'Le document',
  tracking_sheet: 'La feuille de suivi',
  signature_sheet: 'La feuille de signature',
  intercalaire: "L'intercalaire",
  chapitre: 'Le chapitre',
}

/** Casse, accents composés et espaces ignorés (C3). */
function normaliser(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
}

const cleItem = (kind: string, id: number) => `${kind}:${String(id)}`
const cleChapitre = (id: number) => `chapitre:${String(id)}`

/** Clé de refus d'un ajout : nature, rang dans la liste, titre (stable). */
function cleAjout(kind: string, rang: number, titre: string): string {
  return `nouveau:${kind}:${String(rang)}:${titre}`
}

/** Une entrée des listes d'ordre : un existant, ou un ajout de ce fichier. */
type Place = string

export interface ResultatChangements {
  plan: PlanFusion
  destination: DestinationImport
  /** Changements retirés par un refus de l'aperçu (C9). */
  ignores: number
}

interface ItemCible {
  type: 'item'
  it: ChapterItem
}
interface ChapitreCible {
  type: 'chapitre'
  ch: DbChapter
}

/**
 * Le plan d'écriture des changements de `fichier` (règles C1 à C9 en tête
 * du module). `exclus` : clés refusées dans l'aperçu (`clesActions` du plan
 * rendu sans refus).
 */
export function planifierChangements(
  local: EtatLocal,
  classeur: Pick<DbClasseur, 'uuid' | 'name'>,
  fichier: FichierChangements,
  contexte: ContexteImport,
  exclus: ReadonlySet<string> = new Set(),
): ResultatChangements {
  const destination = destinationImport(local, fichier, classeur, contexte)
  const cible = destination.cible
  const warnings: string[] = [...fichier.avertissements]
  const resultat: MergeResult = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    deleted: 0,
  }
  let ignores = 0

  // --- index locaux --------------------------------------------------------
  const chapitres = [...local.chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  const chapitresVisibles = chapitres.filter((c) => c.deleted_at === null)
  const parUuid = new Map<string, ItemCible | ChapitreCible>()
  for (const c of chapitres)
    if (c.uuid) parUuid.set(c.uuid, { type: 'chapitre', ch: c })
  const items = flattenItems(local.content)
  for (const it of items)
    if (it.data.uuid) parUuid.set(it.data.uuid, { type: 'item', it })
  const chapitreParId = new Map(chapitres.map((c) => [c.id, c]))
  const documentCible =
    cible.type === 'document'
      ? local.content.documents.find((d) => d.id === cible.documentId)
      : undefined
  const chapitreCible =
    cible.type === 'chapitre'
      ? cible.chapitreId
      : documentCible !== undefined
        ? documentCible.chapter_id
        : null

  const periodicitesFichier = {
    _metadata: {
      description: '',
      generated_at: '',
      note: '',
      schema: null,
      periodicites: fichier.periodicites,
    },
  }

  // --- 1. validation de chaque changement ----------------------------------
  type Valide =
    | {
        a: 'modifier' | 'deplacer'
        cle: string
        cibleItem: ChapterItem
        champs: ChampsItem | null
        vers?: string
        apres?: string | null
      }
    | { a: 'supprimer'; cle: string; cibleItem: ChapterItem }
    | {
        a: 'ajouter'
        cle: string
        place: Place
        champs: ChampsItem
        vers: string
        apres?: string | null
      }
    | {
        a: 'modifierChapitre' | 'deplacerChapitre'
        ch: DbChapter
        label: string
        icon: string
        description: string
        apres?: string | null
      }
    | { a: 'supprimerChapitre'; cle: string; ch: DbChapter }
    | {
        a: 'ajouterChapitre'
        place: Place
        label: string
        icon: string
        description: string
        apres?: string | null
      }

  const valides: Valide[] = []
  const vises = new Set<string>()
  // Références des ajouts (`ref`), pour `chapitre` et `apres`.
  const refsChapitres = new Map<string, Place>()
  const refsItems = new Map<string, Place>()
  // Clés des ajouts refusés, pour placer en fin sans avertir.
  const refsRefusees = new Set<string>()

  // Pré-passe : les `ref` des ajouts, pour qu'un changement puisse viser un
  // chapitre ajouté plus loin dans la liste.
  // Un chapitre ajouté n'est référencé que s'il sera créé (jamais refusable).
  fichier.changements.forEach((c, i) => {
    if (
      c.action?.trim().toLocaleLowerCase('fr') !== 'ajouter' ||
      c.ref === undefined
    )
      return
    if (c.kind !== 'chapitre') refsItems.set(c.ref, `nouveau:${String(i)}`)
    else if (
      cible.type === 'classeur' &&
      (c.label ?? c.title ?? '').trim() !== ''
    )
      refsChapitres.set(c.ref, `nouveauChapitre:${String(i)}`)
  })

  const nom = (kind: string, titre: string | undefined) => {
    const n = Object.hasOwn(NATURES, kind)
      ? NATURES[kind as ItemKind | 'chapitre']
      : 'Un élément'
    const t = titre?.trim() ?? ''
    return t === '' ? n : `${n} ${t}`
  }
  const ignorer = (quoi: string, raison: string) => {
    warnings.push(`${quoi} : ${raison}, ce changement est ignoré.`)
    resultat.skipped += 1
  }

  // Chapitres supprimés par ce fichier (C7), connus avant les éléments.
  const chapitresSupprimes = new Set<number>()
  fichier.changements.forEach((c) => {
    if (c.action !== 'supprimer' || c.uuid === undefined) return
    const t = parUuid.get(c.uuid)
    if (t?.type === 'chapitre' && t.ch.deleted_at === null) {
      const titre = c.label ?? c.title
      if (titre !== undefined && normaliser(titre) === normaliser(t.ch.label)) {
        if (cible.type === 'classeur' && !exclus.has(cleChapitre(t.ch.id)))
          chapitresSupprimes.add(t.ch.id)
      }
    }
  })

  /** `chapitre` d'un changement : un chapitre visible ou un ajout ; sinon `null`. */
  const resoudreVers = (v: string): string | null => {
    const ajout = refsChapitres.get(v)
    if (ajout !== undefined) return cible.type === 'classeur' ? ajout : null
    const t = parUuid.get(v)
    if (t?.type !== 'chapitre' || t.ch.deleted_at !== null) return null
    if (chapitresSupprimes.has(t.ch.id)) return null
    if (chapitreCible !== null && t.ch.id !== chapitreCible) return null
    return cleChapitre(t.ch.id)
  }

  fichier.changements.forEach((c, i) => {
    const action = c.action?.trim().toLocaleLowerCase('fr')
    const titreAnnonce = c.title ?? c.label
    if (
      action === undefined ||
      !(ACTIONS as readonly string[]).includes(action)
    ) {
      // Nommé par ce qu'il vise ici quand l'uuid est connu (C1).
      const vise = c.uuid === undefined ? undefined : parUuid.get(c.uuid)
      ignorer(
        vise === undefined
          ? nom(c.kind ?? '', titreAnnonce)
          : vise.type === 'chapitre'
            ? nom('chapitre', vise.ch.label)
            : nom(vise.it.kind, vise.it.data.title),
        action === undefined
          ? "aucune action n'est indiquée (modifier, supprimer, déplacer ou ajouter)"
          : `l'action ${c.action ?? ''} est inconnue`,
      )
      return
    }

    // --- ajouter ----------------------------------------------------------
    if (action === 'ajouter') {
      if (c.kind === 'chapitre') {
        const label = c.label ?? c.title ?? ''
        if (cible.type !== 'classeur')
          return ignorer(
            nom('chapitre', label),
            "un chapitre s'ajoute depuis l'export du classeur entier",
          )
        if (label.trim() === '')
          return ignorer('Un chapitre ajouté', "il n'a pas de nom")
        valides.push({
          a: 'ajouterChapitre',
          place: `nouveauChapitre:${String(i)}`,
          label,
          icon: c.icon ?? DEFAUTS.chapter.icon,
          description: c.description ?? '',
          ...(c.apres !== undefined ? { apres: c.apres } : {}),
        })
        return
      }
      if (c.kind === undefined || !estKindConnu(c.kind))
        return ignorer(nom('', c.title), "sa nature n'est pas indiquée")
      const kind = c.kind
      const titre = c.title ?? ''
      const cle = cleAjout(kind, i, titre)
      if (cible.type === 'document')
        return ignorer(
          nom(kind, titre),
          "on ajoute un élément depuis l'export du chapitre ou du classeur",
        )
      if (titre.trim() === '')
        return ignorer(nom(kind, ''), "il n'a pas de titre")
      if (exclus.has(cle)) {
        ignores += 1
        refsRefusees.add(`nouveau:${String(i)}`)
        return
      }
      const vers =
        c.chapitre !== undefined
          ? resoudreVers(c.chapitre)
          : chapitreCible !== null
            ? cleChapitre(chapitreCible)
            : null
      if (vers === null)
        return ignorer(
          nom(kind, titre),
          c.chapitre === undefined
            ? "le chapitre où le ranger n'est pas indiqué"
            : 'son chapitre est introuvable ici',
        )
      const champs = champsCreation(kind, c, titre)
      if (champs === null) return
      valides.push({
        a: 'ajouter',
        cle,
        place: `nouveau:${String(i)}`,
        champs,
        vers,
        ...(c.apres !== undefined ? { apres: c.apres } : {}),
      })
      return
    }

    // --- modifier, supprimer, déplacer : un existant --------------------
    if (c.uuid === undefined || c.uuid.trim() === '')
      return ignorer(
        nom(c.kind ?? '', titreAnnonce),
        'son identifiant (uuid) manque',
      )
    const t = parUuid.get(c.uuid)
    if (t === undefined)
      return ignorer(
        nom(c.kind ?? '', titreAnnonce),
        'il est introuvable dans ce classeur',
      )
    const kindLocal = t.type === 'chapitre' ? 'chapitre' : t.it.kind
    const titreLocal = t.type === 'chapitre' ? t.ch.label : t.it.data.title
    const quoi = nom(kindLocal, titreLocal)
    if (c.kind !== undefined && c.kind !== kindLocal)
      return ignorer(quoi, 'sa nature ne peut pas changer')
    const supprimeLocal =
      t.type === 'chapitre'
        ? t.ch.deleted_at !== null
        : t.it.data.deleted_at !== null
    if (supprimeLocal) return ignorer(quoi, 'il est déjà à la corbeille')
    const idVise =
      t.type === 'chapitre'
        ? cleChapitre(t.ch.id)
        : cleItem(t.it.kind, t.it.data.id)
    if (vises.has(idVise))
      return ignorer(quoi, 'il est déjà visé par un autre changement')
    // C3
    if (action === 'supprimer' || action === 'deplacer') {
      if (
        titreAnnonce === undefined ||
        normaliser(titreAnnonce) !== normaliser(titreLocal)
      )
        return ignorer(
          quoi,
          titreAnnonce === undefined
            ? 'son titre actuel manque pour confirmer'
            : `le titre donné (${titreAnnonce.trim()}) n'est pas le sien`,
        )
    }

    // C8 : dans la portée.
    if (t.type === 'chapitre') {
      if (cible.type === 'document')
        return ignorer(quoi, "l'export d'un document ne change que ce document")
      if (
        cible.type === 'chapitre' &&
        (t.ch.id !== cible.chapitreId || action !== 'modifier')
      )
        return ignorer(
          quoi,
          t.ch.id !== cible.chapitreId
            ? "l'export d'un chapitre ne change que ce chapitre"
            : "on supprime ou déplace un chapitre depuis l'export du classeur entier",
        )
    } else {
      if (cible.type === 'document' && t.it.data.id !== cible.documentId)
        return ignorer(quoi, "l'export d'un document ne change que ce document")
      if (
        cible.type === 'chapitre' &&
        t.it.data.chapter_id !== cible.chapitreId
      )
        return ignorer(quoi, "l'export d'un chapitre ne change que ce chapitre")
      if (chapitresSupprimes.has(t.it.data.chapter_id))
        return ignorer(quoi, 'son chapitre part à la corbeille')
      if (chapitreParId.get(t.it.data.chapter_id)?.deleted_at !== null)
        return ignorer(quoi, 'son chapitre est à la corbeille')
    }
    vises.add(idVise)
    // Un changement ignoré plus loin ne bloque pas un autre changement du
    // même élément (trouvé par la propriété de l'ordre, 2026-10-23).
    const rejeter = (raison: string) => {
      vises.delete(idVise)
      ignorer(quoi, raison)
    }

    // --- chapitre existant ----------------------------------------------
    if (t.type === 'chapitre') {
      const ch = t.ch
      if (action === 'supprimer') {
        const cle = cleChapitre(ch.id)
        if (exclus.has(cle)) {
          ignores += 1
          return
        }
        valides.push({ a: 'supprimerChapitre', cle, ch })
        return
      }
      const label =
        action === 'modifier' && c.label !== undefined && c.label.trim() !== ''
          ? c.label
          : ch.label
      if (
        action === 'modifier' &&
        c.label !== undefined &&
        c.label.trim() === ''
      )
        warnings.push(
          `${quoi} : un nom vide n'est pas possible, le nom actuel est gardé.`,
        )
      const icon = action === 'modifier' ? (c.icon ?? ch.icon) : ch.icon
      const description =
        action === 'modifier'
          ? (c.description ?? ch.description)
          : ch.description
      if (action === 'deplacer' && c.apres === undefined)
        return rejeter("la place où le mettre (apres) n'est pas indiquée")
      valides.push({
        a: action === 'deplacer' ? 'deplacerChapitre' : 'modifierChapitre',
        ch,
        label,
        icon,
        description,
        ...(c.apres !== undefined && cible.type === 'classeur'
          ? { apres: c.apres }
          : {}),
      })
      return
    }

    // --- élément existant -----------------------------------------------
    const it = t.it
    const cle = cleItem(it.kind, it.data.id)
    if (exclus.has(cle)) {
      ignores += 1
      return
    }
    if (action === 'supprimer') {
      valides.push({ a: 'supprimer', cle, cibleItem: it })
      return
    }
    let vers: string | undefined
    if (c.chapitre !== undefined) {
      const r = resoudreVers(c.chapitre)
      if (r === null) {
        if (action === 'deplacer')
          return rejeter('le chapitre où le ranger est introuvable ici')
        warnings.push(
          `${quoi} : le chapitre où le ranger est introuvable ici, il reste à sa place.`,
        )
      } else if (r !== cleChapitre(it.data.chapter_id)) vers = r
    }
    const bouge = vers !== undefined || c.apres !== undefined
    if (cible.type === 'document' && bouge) {
      warnings.push(
        `${quoi} : l'export d'un document ne le déplace pas, il reste à sa place.`,
      )
    }
    if (action === 'deplacer' && (!bouge || cible.type === 'document'))
      return rejeter(
        "la place où le mettre (chapitre ou apres) n'est pas indiquée",
      )
    valides.push({
      a: action === 'deplacer' ? 'deplacer' : 'modifier',
      cle,
      cibleItem: it,
      champs: action === 'modifier' ? champsModification(it, c, quoi) : null,
      ...(cible.type !== 'document' && vers !== undefined ? { vers } : {}),
      ...(cible.type !== 'document' && c.apres !== undefined
        ? { apres: c.apres }
        : {}),
    })
  })

  // --- 2. listes d'ordre ---------------------------------------------------
  // Éléments par chapitre (clé `chapitre:id` ou `nouveauChapitre:i`).
  const listes = new Map<string, Place[]>()
  const actuels = new Map<Place, number>()
  const fixes = new Set<Place>()
  for (const c of chapitresVisibles) listes.set(cleChapitre(c.id), [])
  for (const it of items) {
    if (it.data.deleted_at !== null) continue
    const l = listes.get(cleChapitre(it.data.chapter_id))
    if (l === undefined) continue
    const p = cleItem(it.kind, it.data.id)
    l.push(p)
    actuels.set(p, it.data.sort_order)
    fixes.add(p)
  }
  const ordreChapitres: Place[] = chapitresVisibles.map((c) =>
    cleChapitre(c.id),
  )
  for (const c of chapitresVisibles)
    actuels.set(cleChapitre(c.id), c.sort_order)
  const chapitresFixes = new Set(ordreChapitres)
  const causesParListe = new Map<string, string[]>()
  const chapitreDe = new Map<Place, string>()
  for (const [ch, l] of listes) for (const p of l) chapitreDe.set(p, ch)

  const resoudreApres = (v: string): Place | null => {
    const ajout = refsItems.get(v) ?? refsChapitres.get(v)
    if (ajout !== undefined) return ajout
    const t = parUuid.get(v)
    if (t === undefined) return null
    return t.type === 'chapitre'
      ? cleChapitre(t.ch.id)
      : cleItem(t.it.kind, t.it.data.id)
  }

  // Seules les listes où quelque chose ARRIVE sont renumérotées : une liste
  // sans changement garde ses numéros, même irréguliers (doublons, trous).
  const listesTouchees = new Set<Place[]>()

  /** Insère `p` dans `liste` après `apres` (C5) ; rend faux si `apres` n'y est pas. */
  const inserer = (
    liste: Place[],
    p: Place,
    apres: string | null | undefined,
  ): boolean => {
    listesTouchees.add(liste)
    if (apres === null) {
      liste.unshift(p)
      return true
    }
    if (apres === undefined) {
      liste.push(p)
      return true
    }
    const voisin = resoudreApres(apres)
    const j = voisin === null ? -1 : liste.indexOf(voisin)
    if (j === -1) {
      liste.push(p)
      return voisin !== null && refsRefusees.has(voisin)
    }
    liste.splice(j + 1, 0, p)
    return true
  }

  const nouveauxChapitres = new Map<Place, number>()
  for (const v of valides) {
    if (v.a === 'ajouterChapitre') {
      nouveauxChapitres.set(v.place, nouveauxChapitres.size)
      listes.set(v.place, [])
    }
  }
  for (const v of valides) {
    switch (v.a) {
      case 'ajouterChapitre':
        if (!inserer(ordreChapitres, v.place, v.apres))
          warnings.push(
            `Le chapitre ${v.label} : le chapitre après lequel le placer est introuvable, il est mis à la fin.`,
          )
        break
      case 'deplacerChapitre':
      case 'modifierChapitre': {
        if (v.apres === undefined) break
        const p = cleChapitre(v.ch.id)
        ordreChapitres.splice(ordreChapitres.indexOf(p), 1)
        chapitresFixes.delete(p)
        if (!inserer(ordreChapitres, p, v.apres))
          warnings.push(
            `Le chapitre ${v.ch.label} : le chapitre après lequel le placer est introuvable, il est mis à la fin.`,
          )
        break
      }
      case 'supprimerChapitre': {
        const p = cleChapitre(v.ch.id)
        ordreChapitres.splice(ordreChapitres.indexOf(p), 1)
        break
      }
      case 'supprimer': {
        const p = cleItem(v.cibleItem.kind, v.cibleItem.data.id)
        const l = listes.get(chapitreDe.get(p) ?? '')
        l?.splice(l.indexOf(p), 1)
        break
      }
      case 'ajouter': {
        const l = listes.get(v.vers)
        if (l === undefined) break
        if (!inserer(l, v.place, v.apres))
          warnings.push(
            `${nom(v.champs.kind, v.champs.input.title)} : l'élément après lequel le placer n'est pas dans ce chapitre, il est mis à la fin.`,
          )
        chapitreDe.set(v.place, v.vers)
        causesParListe.set(v.vers, [
          ...(causesParListe.get(v.vers) ?? []),
          v.cle,
        ])
        break
      }
      case 'modifier':
      case 'deplacer': {
        if (v.vers === undefined && v.apres === undefined) break
        const p = cleItem(v.cibleItem.kind, v.cibleItem.data.id)
        const de = chapitreDe.get(p) ?? ''
        const vers = v.vers ?? de
        const source = listes.get(de)
        const dest = listes.get(vers)
        if (source === undefined || dest === undefined) break
        source.splice(source.indexOf(p), 1)
        fixes.delete(p)
        // Changement de chapitre sans `apres` : à la fin (C5).
        if (!inserer(dest, p, v.apres))
          warnings.push(
            `${nom(v.cibleItem.kind, v.cibleItem.data.title)} : l'élément après lequel le placer n'est pas dans ce chapitre, il est mis à la fin.`,
          )
        chapitreDe.set(p, vers)
        causesParListe.set(vers, [...(causesParListe.get(vers) ?? []), v.cle])
        break
      }
    }
  }

  const numeros = new Map<Place, number>()
  for (const [, l] of listes)
    if (listesTouchees.has(l))
      for (const [p, n] of numeroter(l, actuels, fixes)) numeros.set(p, n)
  const numerosChapitres = listesTouchees.has(ordreChapitres)
    ? numeroter(ordreChapitres, actuels, chapitresFixes)
    : new Map<Place, number>()

  // --- 3. actions ----------------------------------------------------------
  const actions: ActionFusion[] = []
  const refChapitre = (p: string): RefChapitre => {
    const n = nouveauxChapitres.get(p)
    return n !== undefined
      ? { type: 'nouveau', index: n }
      : { type: 'local', id: Number(p.slice('chapitre:'.length)) }
  }
  const libelleChapitre = new Map<string, { label: string; icon: string }>()
  for (const c of chapitresVisibles) libelleChapitre.set(cleChapitre(c.id), c)

  // Chapitres créés (dans l'ordre du fichier, index croissant).
  for (const v of valides) {
    if (v.a !== 'ajouterChapitre') continue
    libelleChapitre.set(v.place, v)
    actions.push({
      type: 'creerChapitre',
      index: nouveauxChapitres.get(v.place) ?? 0,
      uuid: null,
      label: v.label,
      icon: v.icon,
      description: v.description,
      sort_order: numerosChapitres.get(v.place) ?? 1,
    })
    resultat.inserted += 1
  }
  // Chapitres changés, puis renumérotés.
  const chapitresTouches = new Set<number>()
  for (const v of valides) {
    if (v.a !== 'modifierChapitre' && v.a !== 'deplacerChapitre') continue
    const p = cleChapitre(v.ch.id)
    // Comme pour un élément : renuméroté sans avoir bougé = `ordonnerChapitre`.
    const bougeLui = !chapitresFixes.has(p)
    if (bougeLui) chapitresTouches.add(v.ch.id)
    const n = numerosChapitres.get(p)
    const ordre =
      bougeLui && n !== undefined && n !== v.ch.sort_order ? n : undefined
    const memes =
      v.label === v.ch.label &&
      v.icon === v.ch.icon &&
      v.description === v.ch.description
    if (memes && ordre === undefined) {
      resultat.unchanged += 1
      continue
    }
    libelleChapitre.set(p, v)
    actions.push({
      type: 'modifierChapitre',
      id: v.ch.id,
      label: v.label,
      icon: v.icon,
      description: v.description,
      ...(ordre !== undefined ? { sort_order: ordre } : {}),
    })
    resultat.updated += 1
  }
  for (const c of chapitresVisibles) {
    if (chapitresTouches.has(c.id)) continue
    const n = numerosChapitres.get(cleChapitre(c.id))
    if (n !== undefined && n !== c.sort_order)
      actions.push({
        type: 'ordonnerChapitre',
        id: c.id,
        sort_order: n,
        causes: [],
      })
  }

  // Éléments : créations, modifications et déplacements, dans l'ordre du fichier.
  const itemsTouches = new Set<string>()
  for (const v of valides) {
    if (v.a === 'ajouter') {
      actions.push({
        type: 'creerItem',
        chapitre: refChapitre(v.vers),
        uuid: null,
        sort_order: numeros.get(v.place) ?? 1,
        item: v.champs,
        cle: v.cle,
      })
      resultat.inserted += 1
      continue
    }
    if (v.a !== 'modifier' && v.a !== 'deplacer') continue
    const it = v.cibleItem
    const p = cleItem(it.kind, it.data.id)
    const depart = cleChapitre(it.data.chapter_id)
    const versCh = chapitreDe.get(p) ?? depart
    const change = versCh !== depart
    // Un élément resté à sa place mais renuméroté par l'arrivée d'un voisin
    // reçoit son numéro à part (`ordonnerItem`) : refuser sa modification ne
    // doit pas défaire l'ordre des autres, et l'aperçu ne le dit pas déplacé.
    const bougeLui = !fixes.has(p)
    if (bougeLui) itemsTouches.add(p)
    const n = numeros.get(p)
    const ordre =
      bougeLui && n !== undefined && n !== it.data.sort_order ? n : undefined
    const champs = v.champs ?? champsActuels(it)
    if (!champsDifferents(champs, it) && !change && ordre === undefined) {
      resultat.unchanged += 1
      continue
    }
    actions.push({
      type: 'modifierItem',
      id: it.data.id,
      item: champs,
      ...(change ? { chapitre: refChapitre(versCh) } : {}),
      ...(ordre !== undefined ? { sort_order: ordre } : {}),
    })
    resultat.updated += 1
  }
  for (const it of items) {
    if (it.data.deleted_at !== null) continue
    const p = cleItem(it.kind, it.data.id)
    if (itemsTouches.has(p)) continue
    const n = numeros.get(p)
    if (n === undefined || n === it.data.sort_order) continue
    actions.push({
      type: 'ordonnerItem',
      kind: it.kind,
      id: it.data.id,
      sort_order: n,
      causes: causesParListe.get(chapitreDe.get(p) ?? '') ?? [],
    })
  }

  // Corbeille en dernier : éléments, puis chapitres.
  for (const v of valides) {
    if (v.a !== 'supprimer') continue
    actions.push({
      type: 'supprimerItem',
      kind: v.cibleItem.kind,
      id: v.cibleItem.data.id,
    })
    resultat.deleted += 1
  }
  for (const v of valides) {
    if (v.a !== 'supprimerChapitre') continue
    actions.push({ type: 'supprimerChapitre', id: v.ch.id })
    resultat.deleted += 1
  }

  // --- 4. aperçu (une ligne par action, sauf les renumérotations) -----------
  const apercu: MergePreviewItem[] = []
  const itemsParCle = new Map(
    items.map((it) => [cleItem(it.kind, it.data.id), it]),
  )
  const ligne = (
    action: MergePreviewItem['action'],
    kind: string,
    title: string,
    ch: string,
  ) => {
    const l = libelleChapitre.get(ch)
    apercu.push({
      action,
      kind,
      title,
      chapter_label: l?.label ?? '',
      icon: l?.icon ?? '',
    })
  }
  for (const a of actions) {
    switch (a.type) {
      case 'creerChapitre':
        ligne(
          'insert',
          'chapter',
          a.label,
          [...nouveauxChapitres].find(([, n]) => n === a.index)?.[0] ?? '',
        )
        break
      case 'modifierChapitre':
        ligne('update', 'chapter', a.label, cleChapitre(a.id))
        break
      case 'supprimerChapitre': {
        const ch = chapitreParId.get(a.id)
        ligne('delete', 'chapter', ch?.label ?? '', cleChapitre(a.id))
        break
      }
      case 'creerItem':
        ligne(
          'insert',
          a.item.kind,
          a.item.input.title,
          a.chapitre.type === 'local'
            ? cleChapitre(a.chapitre.id)
            : ([...nouveauxChapitres].find(
                ([, n]) =>
                  a.chapitre.type === 'nouveau' && n === a.chapitre.index,
              )?.[0] ?? ''),
        )
        break
      case 'modifierItem': {
        const p = cleItem(a.item.kind, a.id)
        ligne(
          'update',
          a.item.kind,
          a.item.input.title,
          chapitreDe.get(p) ?? '',
        )
        break
      }
      case 'supprimerItem': {
        const it = itemsParCle.get(cleItem(a.kind, a.id))
        ligne(
          'delete',
          a.kind,
          it?.data.title ?? '',
          it === undefined ? '' : cleChapitre(it.data.chapter_id),
        )
        break
      }
      default:
        break
    }
  }

  return { plan: { actions, resultat, apercu, warnings }, destination, ignores }

  // --- champs (C4) -----------------------------------------------------------

  function champsCreation(
    kind: ItemKind,
    c: ChangementJson,
    titre: string,
  ): ChampsItem | null {
    const quoi = nom(kind, titre)
    switch (kind) {
      case 'document':
        return {
          kind,
          input: {
            title: titre,
            description: c.description ?? '',
            content: c.content ?? '',
          },
        }
      case 'intercalaire':
        return {
          kind,
          input: { title: titre, description: c.description ?? '' },
        }
      case 'signature_sheet':
        return {
          kind,
          input: {
            title: titre,
            description: c.description ?? '',
            nombre:
              c.nombre === undefined
                ? DEFAUTS.signature_sheet.nombre
                : nombreBorne(c.nombre, quoi, DEFAUTS.signature_sheet.nombre),
          },
        }
      case 'tracking_sheet': {
        const r = resoudrePeriodicite(
          c.periodicite_id,
          periodicitesFichier,
          local.periodicites,
        )
        if (r.id !== null)
          return { kind, input: { title: titre, periodicite_id: r.id } }
        const defaut = periodiciteParDefaut(local.periodicites)
        if (defaut === null) {
          ignorer(quoi, "aucune périodicité n'est disponible")
          return null
        }
        const libelle =
          local.periodicites?.find((p) => p.id === defaut)?.label ??
          'la première'
        warnings.push(
          c.periodicite_id === undefined || c.periodicite_id === null
            ? `${quoi} : sa périodicité n'est pas indiquée, ${libelle} est appliquée.`
            : `${quoi} : sa périodicité est inconnue ici, ${libelle} est appliquée.`,
        )
        return { kind, input: { title: titre, periodicite_id: defaut } }
      }
    }
  }

  function champsModification(
    it: ChapterItem,
    c: ChangementJson,
    quoi: string,
  ): ChampsItem {
    const base = champsActuels(it)
    let title = base.input.title
    if (c.title !== undefined) {
      if (c.title.trim() === '')
        warnings.push(
          `${quoi} : un titre vide n'est pas possible, le titre actuel est gardé.`,
        )
      else title = c.title
    }
    switch (base.kind) {
      case 'document':
        return {
          kind: 'document',
          input: {
            title,
            description: c.description ?? base.input.description,
            content: c.content ?? base.input.content,
          },
        }
      case 'intercalaire':
        return {
          kind: 'intercalaire',
          input: {
            title,
            description: c.description ?? base.input.description,
          },
        }
      case 'signature_sheet':
        return {
          kind: 'signature_sheet',
          input: {
            title,
            description: c.description ?? base.input.description,
            nombre:
              c.nombre === undefined
                ? base.input.nombre
                : nombreBorne(c.nombre, quoi, base.input.nombre),
          },
        }
      case 'tracking_sheet': {
        let periodicite_id = base.input.periodicite_id
        if (c.periodicite_id !== undefined && c.periodicite_id !== null) {
          const r = resoudrePeriodicite(
            c.periodicite_id,
            periodicitesFichier,
            local.periodicites,
          )
          if (r.id === null)
            warnings.push(
              `${quoi} : sa nouvelle périodicité est inconnue ici, l'actuelle est gardée.`,
            )
          else periodicite_id = r.id
        }
        return { kind: 'tracking_sheet', input: { title, periodicite_id } }
      }
    }
  }

  function nombreBorne(n: number, quoi: string, repli: number): number {
    if (!Number.isInteger(n)) {
      warnings.push(
        `${quoi} : le nombre de lignes doit être un nombre entier, ${String(repli)} est gardé.`,
      )
      return repli
    }
    const borne = Math.min(NOMBRE_MAX, Math.max(NOMBRE_MIN, n))
    if (borne !== n)
      warnings.push(
        `${quoi} : ${String(n)} lignes n'est pas possible (de ${String(NOMBRE_MIN)} à ${String(NOMBRE_MAX)}), ${String(borne)} est appliqué.`,
      )
    return borne
  }
}

/** Les champs actuels d'un élément, dans la forme d'écriture. */
function champsActuels(it: ChapterItem): ChampsItem {
  switch (it.kind) {
    case 'document':
      return {
        kind: 'document',
        input: {
          title: it.data.title,
          description: it.data.description,
          content: it.data.content,
        },
      }
    case 'tracking_sheet':
      return {
        kind: 'tracking_sheet',
        input: { title: it.data.title, periodicite_id: it.data.periodicite_id },
      }
    case 'signature_sheet':
      return {
        kind: 'signature_sheet',
        input: {
          title: it.data.title,
          description: it.data.description,
          nombre: it.data.nombre,
        },
      }
    case 'intercalaire':
      return {
        kind: 'intercalaire',
        input: { title: it.data.title, description: it.data.description },
      }
  }
}

function champsDifferents(champs: ChampsItem, it: ChapterItem): boolean {
  const actuels = champsActuels(it)
  return JSON.stringify(actuels.input) !== JSON.stringify(champs.input)
}

// ---------------------------------------------------------------------------
// Numérotation (C5)
// ---------------------------------------------------------------------------

/**
 * Numéros d'ordre de `liste` (ordre voulu). Les éléments `fixes` (restés à
 * leur place) gardent leur numéro actuel quand c'est possible : chaque
 * groupe d'éléments placés entre deux fixes prend les numéros libres qui
 * suivent le précédent. S'il n'y a pas la place, ou si les fixes ne sont pas
 * déjà en ordre strictement croissant, toute la liste est renumérotée de 1
 * à n. Pur ; exporté pour les tests.
 */
export function numeroter(
  liste: readonly string[],
  actuels: ReadonlyMap<string, number>,
  fixes: ReadonlySet<string>,
): Map<string, number> {
  const toutRenumeroter = () => new Map(liste.map((p, i) => [p, i + 1]))
  const resultat = new Map<string, number>()
  let precedent = 0
  let enAttente: string[] = []
  const placer = (plafond: number): boolean => {
    if (precedent + enAttente.length >= plafond) return false
    enAttente.forEach((p, k) => resultat.set(p, precedent + k + 1))
    enAttente = []
    return true
  }
  for (const p of liste) {
    const n = actuels.get(p)
    if (!fixes.has(p) || n === undefined) {
      enAttente.push(p)
      continue
    }
    // Un fixe pas plus grand que le précédent échoue ici aussi (aucune place).
    if (!placer(n)) return toutRenumeroter()
    resultat.set(p, n)
    precedent = n
  }
  placer(Number.POSITIVE_INFINITY)
  return resultat
}

// ---------------------------------------------------------------------------
// Éléments changés dans l'application depuis l'export
// ---------------------------------------------------------------------------

/** Instant en millisecondes ; `null` si illisible. */
function instant(texte: string): number | null {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?(.*)$/.exec(
    texte.trim(),
  )
  if (m === null) return null
  const ms = (m.at(2) ?? '').slice(0, 3).padEnd(3, '0')
  const t = Date.parse(`${m[1]}.${ms}${m[3] === '' ? 'Z' : m[3]}`)
  return Number.isNaN(t) ? null : t
}

/**
 * Clés des MODIFICATIONS de texte d'éléments changés dans l'application
 * APRÈS l'export dont part le LLM (`_metadata.generated_at`) : sa version
 * est faite sur l'ancien texte. L'aperçu les propose non importées ; la
 * personne peut les reprendre. Sans date d'export, rien n'est signalé.
 */
export function clesChangeesDepuisExport(
  local: EtatLocal,
  fichier: FichierChangements,
  plan: PlanFusion,
): string[] {
  const depuis =
    fichier.exporteLe === undefined ? null : instant(fichier.exporteLe)
  if (depuis === null) return []
  const locaux = new Map(
    flattenItems(local.content).map((it) => [cleItem(it.kind, it.data.id), it]),
  )
  return plan.actions.flatMap((a) => {
    if (a.type !== 'modifierItem') return []
    const cle = cleItem(a.item.kind, a.id)
    const loc = locaux.get(cle)
    if (loc === undefined || !champsDifferents(a.item, loc)) return []
    const t = instant(loc.data.updated_at)
    return t !== null && t > depuis ? [cle] : []
  })
}

// ---------------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------------

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`
}

/** « 3 ajouts, 2 modifications, 1 mis à la corbeille ». */
export function resumerImport(plan: PlanFusion): string {
  const r = plan.resultat
  if (r.inserted + r.updated + r.deleted === 0) return 'Rien à importer'
  const parts: string[] = []
  if (r.inserted > 0) parts.push(pluriel(r.inserted, 'ajout', 'ajouts'))
  if (r.updated > 0)
    parts.push(pluriel(r.updated, 'modification', 'modifications'))
  if (r.deleted > 0) parts.push(`${String(r.deleted)} mis à la corbeille`)
  if (r.skipped > 0) parts.push(pluriel(r.skipped, 'ignoré', 'ignorés'))
  return parts.join(', ')
}
