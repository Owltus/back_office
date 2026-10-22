/*
 * Format d'échange JSON « Classeur v2 » — porté de Registre
 * (`src-tauri/src/commands/files.rs` : `CLASSEUR_SCHEMA`, structs serde
 * `ClasseurJson`/`ChapterJson`/`ItemJson`/`MetadataJson`, `parse_import_json`,
 * `do_export_json`).
 *
 * Deux garanties, testées par `schema.test.ts` :
 *   - un fichier exporté ici se réimporte dans l'application de bureau
 *     (mêmes champs, mêmes noms, `_metadata` complet) ;
 *   - un export de Registre (v1 ou v2) se lit ici, avec les mêmes défauts
 *     que le schéma descriptif.
 *
 * Pur : ni React, ni Supabase. Tout objet rendu est nu (JSON-sûr).
 */

import { slugify } from '#/lib/classeur/slug.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbPeriodicite,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { ITEM_KINDS, flattenItems } from '#/lib/classeur/types.ts'
import { consignesClasseur } from '#/lib/classeur/merge/consignes.ts'

// ---------------------------------------------------------------------------
// Types du fichier
// ---------------------------------------------------------------------------

/** Version de format produite par l'export. Les versions 1 et 2 sont lues. */
export const FORMAT_VERSION = 2

/** Bloc `classeur` du fichier. */
export interface ClasseurDataJson {
  name: string
  icon: string
  etablissement: string
  etablissement_complement: string
}

/** Périodicité embarquée dans `_metadata` (informative chez Registre ; ici
 * elle sert à apparier `periodicite_id` PAR LIBELLÉ, les ids différant d'une
 * base à l'autre). */
export interface MetadataPeriodiciteJson {
  id: number
  label: string
  nombre: number
}

/**
 * Ce que représente un export (`_metadata.portee`, ajout du Back Office,
 * ignoré par Registre) : un classeur entier (D10 du plan
 * `classeur-echange-ia-2026-10-19` : avertir quand on importe le fichier
 * d'un autre classeur), un chapitre ou un document (refuser un fichier
 * appliqué au mauvais endroit).
 */
export type Portee =
  | { type: 'classeur'; classeur_uuid: string; classeur_name: string }
  | { type: 'chapitre'; chapitre_uuid: string; chapitre_label: string }
  | {
      type: 'document'
      document_uuid: string
      document_title: string
      chapitre_label: string
    }

/** Bloc `_metadata` : informatif, jamais requis à l'import. */
export interface MetadataJson {
  description: string
  generated_at: string
  note: string
  schema: unknown
  periodicites: MetadataPeriodiciteJson[]
  /** Consignes pour un LLM (`consignes.ts`) — ajout du Back Office, ignoré par Registre. */
  instructions?: string[]
  /** Portée de l'export (voir `Portee`) ; absente d'un point de restauration. */
  portee?: Portee
}

/**
 * Élément d'un chapitre. `kind` reste une chaîne libre comme chez Registre :
 * un type inconnu traverse le parse (compatibilité ascendante) et c'est la
 * fusion qui le compte en `skipped` avec un avertissement, exactement comme
 * `do_merge` ; l'import comme nouveau classeur l'ignore en silence comme
 * `do_import_json`. Les champs absents sont omis (pas `undefined` explicite)
 * pour que `JSON.stringify` rende la même forme que serde
 * (`skip_serializing_if = "Option::is_none"`).
 */
export interface ItemJson {
  kind: string
  uuid?: string
  title: string
  description?: string
  content?: string
  periodicite_id?: number | null
  nombre?: number | null
  updated_at?: string
  sort_order: number
  /**
   * Feuille de suivi : LIBELLÉ de sa périodicité (D8 du plan
   * `classeur-echange-ia-2026-10-19`), posé à l'export pour qu'une IA n'ait
   * pas à faire la jointure avec `_metadata.periodicites`. Rappel seulement :
   * c'est `periodicite_id` qui compte. `lireItem` le relit (aller-retour
   * exact) pour que la validation de l'import (`validationImport.ts`, étape
   * 6) signale un libellé changé sans l'id ; la fusion l'ignore. Registre
   * l'ignore aussi (pas de `deny_unknown_fields` sur `ItemJson`).
   */
  periodicite?: string
  /**
   * Demande EXPLICITE de suppression (décision utilisateur du 2026-10-20) :
   * l'élément reste dans le fichier, marqué `"supprimer": true`, et l'import
   * le met à la corbeille (suppression douce, refusable dans l'aperçu). Un
   * élément ABSENT du fichier n'est jamais supprimé. Relu seulement s'il vaut
   * `true` ; jamais écrit par un export ; ignoré par Registre (pas de
   * `deny_unknown_fields`) et par tout autre chemin que l'import dans un
   * classeur existant (`planifierImport`).
   */
  supprimer?: true
}

export interface ChapterJson {
  /** Slug unique dans le fichier : `slugify(label)`, suffixé `-2`, `-3`… en cas de doublon. */
  uid: string
  uuid?: string
  label: string
  icon: string
  description: string
  sort_order: number
  items: ItemJson[]
  /** Comme `ItemJson.supprimer` : le chapitre part à la corbeille avec son contenu. */
  supprimer?: true
}

export interface ClasseurJson {
  format_version: number
  _metadata?: MetadataJson
  classeur: ClasseurDataJson
  chapters: ChapterJson[]
}

/** Garde de type : `kind` est l'une des quatre natures connues. */
export function estKindConnu(kind: string): kind is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(kind)
}

// ---------------------------------------------------------------------------
// Schéma descriptif (miroir de CLASSEUR_SCHEMA, embarqué dans _metadata.schema)
// ---------------------------------------------------------------------------

/** Défauts du schéma, appliqués par `parseImportJson` aux champs absents. */
export const DEFAUTS = {
  classeur: {
    name: 'Mon classeur',
    icon: 'BookOpen',
    etablissement: '',
    etablissement_complement: '',
  },
  chapter: { icon: 'FileText', description: '' },
  signature_sheet: { nombre: 14 },
} as const

export const SCHEMA_DESCRIPTIF = {
  _description:
    'Schéma descriptif du format JSON Classeur v2. Ce bloc permet de comprendre, valider ou générer un fichier conforme sans accès au code source.',
  format_version: {
    type: 'integer',
    required: true,
    description:
      "Version du format de fichier. Valeur actuelle : 2. Les fichiers v1 (sans uuid/updated_at) sont acceptés à l'import avec un fallback sur le matching par slug+titre.",
  },
  classeur: {
    _description:
      'Conteneur principal. Un classeur regroupe des chapitres thématiques pouvant contenir tout type de documentation (technique, réglementaire, organisationnelle, etc.).',
    fields: {
      name: {
        type: 'string',
        required: true,
        default: DEFAUTS.classeur.name,
        description: "Nom du classeur affiché dans l'interface.",
      },
      icon: {
        type: 'string',
        required: true,
        default: DEFAUTS.classeur.icon,
        description:
          "Nom d'une icône Lucide React (ex: BookOpen, Shield, Wrench). Liste ouverte — toute icône Lucide valide est acceptée. Si le nom est invalide, l'affichage utilise FileText en fallback.",
      },
      etablissement: {
        type: 'string',
        required: true,
        default: '',
        description:
          "Nom de l'entité, de l'organisation ou du site associé au classeur.",
      },
      etablissement_complement: {
        type: 'string',
        required: true,
        default: '',
        description:
          "Complément d'information (adresse, service, référence, etc.).",
      },
    },
  },
  chapter: {
    _description:
      'Section thématique du classeur. Un classeur contient un tableau de chapitres ordonnés.',
    fields: {
      uid: {
        type: 'string',
        required: true,
        description:
          'Identifiant slug unique du chapitre dans le classeur. Généré via slugify(label).',
      },
      uuid: {
        type: 'string',
        required: false,
        description:
          "Identifiant universel unique (UUIDv4). Utilisé en priorité pour le matching lors d'un merge. Absent dans les exports v1.",
      },
      label: {
        type: 'string',
        required: true,
        description: 'Titre du chapitre affiché dans la navigation.',
      },
      icon: {
        type: 'string',
        required: true,
        default: DEFAUTS.chapter.icon,
        description: "Nom d'une icône Lucide React.",
      },
      description: {
        type: 'string',
        required: true,
        default: '',
        description: 'Description libre du chapitre.',
      },
      sort_order: {
        type: 'integer',
        required: true,
        description: "Position d'affichage du chapitre.",
      },
      items: {
        type: 'array',
        required: true,
        description: 'Liste ordonnée des éléments du chapitre.',
      },
    },
  },
  items: {
    _description:
      'Chaque chapitre contient des items de 4 types. Les types inconnus sont ignorés silencieusement (forward compatibility).',
    common_fields: {
      kind: {
        type: 'string',
        required: true,
        enum: ['document', 'tracking_sheet', 'signature_sheet', 'intercalaire'],
      },
      uuid: {
        type: 'string',
        required: false,
        description: "UUIDv4 de l'item. Matching prioritaire au merge.",
      },
      title: {
        type: 'string',
        required: true,
        description: "Titre de l'item.",
      },
      updated_at: {
        type: 'string',
        required: false,
        description:
          'Horodatage ISO 8601 de la dernière modification. Utilisé pour le Last-Write-Wins au merge.',
      },
      sort_order: { type: 'integer', required: true },
    },
    types: {
      document: {
        _description:
          'Document texte libre en Markdown (GitHub), avec les conventions de la page décrites dans `_metadata.instructions` : images légendées à taille automatique, blocs `:::photos` (grille de photos) et `:::etape` (consigne et photo côte à côte), `===` saut de page.',
        specific_fields: {
          description: { type: 'string', required: false, default: '' },
          content: { type: 'string', required: false, default: '' },
        },
      },
      tracking_sheet: {
        _description:
          "Fiche de suivi périodique : tableau vide rempli à la main à chaque contrôle. N'a PAS de champ description.",
        specific_fields: {
          periodicite_id: {
            type: 'integer|null',
            required: false,
            description: 'Un id de _metadata.periodicites.',
          },
          periodicite: {
            type: 'string',
            required: false,
            description:
              "Libellé de la périodicité, ajouté à l'export pour la lecture. Ignoré à l'import : seul periodicite_id compte.",
          },
        },
      },
      signature_sheet: {
        _description:
          "Fiche d'émargement : lignes nom, date, signature, pour une formation ou une prise de connaissance.",
        specific_fields: {
          description: { type: 'string', required: false, default: '' },
          nombre: {
            type: 'integer|null',
            required: false,
            default: DEFAUTS.signature_sheet.nombre,
            description:
              'Nombre de lignes à signer sur la feuille (entier de 1 à 60 dans le Back Office).',
          },
        },
      },
      intercalaire: {
        _description: 'Page de séparation visuelle.',
        specific_fields: {
          description: { type: 'string', required: false, default: '' },
        },
      },
    },
  },
  periodicites: {
    _description:
      "Table de référence des périodicités de suivi. Registre (bureau) l'ignore à l'import ; le Back Office s'en sert pour retrouver la périodicité d'une fiche de suivi par son LIBELLÉ, les id différant d'une base à l'autre.",
    fields: {
      id: {
        type: 'integer',
        description: 'Identifiant référencé par tracking_sheet.periodicite_id.',
      },
      label: { type: 'string', description: 'Libellé de la périodicité.' },
      nombre: {
        type: 'integer',
        description: 'Nombre de colonnes dans le tableau de suivi.',
      },
    },
  },
  import_rules: {
    _description: "Règles de validation et de comportement à l'import.",
    format_version: 'Accepte 1 ou 2.',
    metadata_ignored:
      "Registre ignore le bloc _metadata à l'import. Le Back Office en lit periodicites (voir ce bloc) et portee (ce que l'export représente : un fichier de chapitre ou de document n'est importé que dans sa portée, celui d'un autre classeur est signalé) ; le reste est informatif.",
    matching_priority:
      '1) UUID si présent → recherche dans tout le classeur. 2) Fallback slug+titre (v1).',
    last_write_wins:
      "Fusion : si un item est trouvé par UUID, la version la plus récente (updated_at) gagne. Back Office, en remplacement, à l'import d'un fichier rendu par une IA et à l'import d'un chapitre ou d'un document : le fichier fait foi, horodatages ignorés.",
    soft_delete_respected:
      "Fusion : un item supprimé localement (soft delete) n'est pas recréé, compté comme 'skipped'. Back Office, en remplacement : il est restauré.",
    move_detection:
      "Registre : un item trouvé par UUID dans un chapitre différent n'est pas re-déplacé, son contenu est mis à jour si plus récent. Back Office : quand le fichier l'emporte, l'item est aussi déplacé dans le chapitre du fichier.",
    no_deletion:
      'Registre : le merge n\'efface jamais, les items locaux absents du JSON sont conservés. Back Office : un item ou un chapitre absent du JSON n\'est jamais supprimé non plus ; pour en supprimer un, le garder avec "supprimer": true (il part en corbeille restaurable).',
  },
} as const

// ---------------------------------------------------------------------------
// Lecture et validation
// ---------------------------------------------------------------------------

/**
 * Les champs du fichier, dits avec des mots (les messages de lecture
 * s'adressent à une personne, pas à un développeur : jamais `title`,
 * `chapters` ni `format_version` à l'écran).
 */
const NOMS_CHAMPS: Record<string, string> = {
  name: 'le nom',
  icon: "l'icône",
  etablissement: "l'établissement",
  etablissement_complement: 'le complément',
  uid: 'le repère',
  uuid: "l'identifiant",
  label: 'le nom',
  description: 'la description',
  title: 'le titre',
  content: 'le texte',
  kind: 'la nature',
  periodicite_id: 'la périodicité',
  nombre: 'le nombre de lignes',
  updated_at: 'la date',
  sort_order: "l'ordre",
}

function nomChamp(cle: string): string {
  return Object.hasOwn(NOMS_CHAMPS, cle) ? NOMS_CHAMPS[cle] : 'une information'
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function estEntier(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

/** Chaîne si présente, défaut si absente/nulle, erreur si d'un autre type. */
function chaine(
  obj: Record<string, unknown>,
  cle: string,
  defaut: string | undefined,
  contexte: string,
): string | undefined {
  const v = obj[cle]
  if (v === undefined || v === null) return defaut
  if (typeof v !== 'string') {
    throw new Error(`${contexte} : ${nomChamp(cle)} doit être un texte.`)
  }
  return v
}

/** Entier si présent, `null` si null, défaut si absent, erreur sinon. */
function entier(
  obj: Record<string, unknown>,
  cle: string,
  contexte: string,
): number | null | undefined {
  const v = obj[cle]
  if (v === undefined) return undefined
  if (v === null) return null
  if (!estEntier(v)) {
    throw new Error(
      `${contexte} : ${nomChamp(cle)} doit être un nombre entier.`,
    )
  }
  return v
}

function lireClasseur(v: unknown): ClasseurDataJson {
  const obj = estObjet(v) ? v : {}
  const ctx = 'Le classeur'
  return {
    name: chaine(obj, 'name', DEFAUTS.classeur.name, ctx) as string,
    icon: chaine(obj, 'icon', DEFAUTS.classeur.icon, ctx) as string,
    etablissement: chaine(obj, 'etablissement', '', ctx) as string,
    etablissement_complement: chaine(
      obj,
      'etablissement_complement',
      '',
      ctx,
    ) as string,
  }
}

/**
 * Normalise un élément : champs communs, puis SEULS les champs spécifiques
 * à sa nature (un `nombre` sur un document est retiré ; une feuille de suivi
 * n'a jamais de description). Un type inconnu ne garde que les champs
 * communs. Les défauts du schéma sont appliqués aux champs spécifiques
 * absents ou nuls (`nombre` null → 14, `description` absente → '').
 */
function lireItem(v: unknown, chapitre: string, position: number): ItemJson {
  if (!estObjet(v)) {
    throw new Error(`${chapitre} : l'élément n° ${position} est mal écrit.`)
  }
  const titre = typeof v.title === 'string' ? v.title.trim() : ''
  const contexte =
    titre === ''
      ? `${chapitre}, élément n° ${position}`
      : `${chapitre}, élément ${titre}`
  const kind = chaine(v, 'kind', undefined, contexte)
  if (kind === undefined) {
    throw new Error(
      `${chapitre} : l'élément n° ${position} n'a pas de nature (document, feuille de suivi, feuille de signature ou intercalaire).`,
    )
  }
  const title = chaine(v, 'title', undefined, contexte)
  if (title === undefined) {
    throw new Error(`${chapitre} : l'élément n° ${position} n'a pas de titre.`)
  }
  const item: ItemJson = { kind, title, sort_order: position }
  const uuid = chaine(v, 'uuid', undefined, contexte)
  if (uuid !== undefined) item.uuid = uuid

  switch (kind) {
    case 'document':
      item.description = chaine(v, 'description', '', contexte)
      item.content = chaine(v, 'content', '', contexte)
      break
    case 'tracking_sheet': {
      const p = entier(v, 'periodicite_id', contexte)
      if (p !== undefined) item.periodicite_id = p
      break
    }
    case 'signature_sheet': {
      item.description = chaine(v, 'description', '', contexte)
      const n = entier(v, 'nombre', contexte)
      item.nombre =
        n === undefined || n === null ? DEFAUTS.signature_sheet.nombre : n
      break
    }
    case 'intercalaire':
      item.description = chaine(v, 'description', '', contexte)
      break
    default:
      break
  }

  const updated_at = chaine(v, 'updated_at', undefined, contexte)
  if (updated_at !== undefined) item.updated_at = updated_at
  const sort_order = entier(v, 'sort_order', contexte)
  if (sort_order !== undefined && sort_order !== null)
    item.sort_order = sort_order
  // D8 : rappel du libellé d'une feuille de suivi, EN DERNIER comme à
  // l'export, relu tel quel s'il est un texte (sinon ignoré).
  if (kind === 'tracking_sheet' && typeof v.periodicite === 'string')
    item.periodicite = v.periodicite
  // Suppression demandée : `true` seul (toute autre valeur est ignorée).
  if (v.supprimer === true) item.supprimer = true
  return item
}

function lireChapitre(v: unknown, position: number): ChapterJson {
  if (!estObjet(v)) {
    throw new Error(`Le chapitre n° ${position} est mal écrit.`)
  }
  const ctx = `Chapitre n° ${position}`
  const label = chaine(v, 'label', undefined, ctx)
  if (label === undefined) {
    throw new Error(`${ctx} : il n'a pas de nom.`)
  }
  const ctxLabel = `Chapitre ${label}`
  const itemsBruts = v.items === undefined || v.items === null ? [] : v.items
  if (!Array.isArray(itemsBruts)) {
    throw new Error(`${ctxLabel} : sa liste d'éléments est mal écrite.`)
  }
  const sort_order = entier(v, 'sort_order', ctxLabel)
  const chapitre: ChapterJson = {
    uid: chaine(v, 'uid', slugify(label), ctxLabel) as string,
    label,
    icon: chaine(v, 'icon', DEFAUTS.chapter.icon, ctxLabel) as string,
    description: chaine(
      v,
      'description',
      DEFAUTS.chapter.description,
      ctxLabel,
    ) as string,
    sort_order:
      sort_order === undefined || sort_order === null ? position : sort_order,
    items: itemsBruts.map((it, i) => lireItem(it, ctxLabel, i + 1)),
  }
  const uuid = chaine(v, 'uuid', undefined, ctxLabel)
  if (uuid !== undefined) chapitre.uuid = uuid
  if (v.supprimer === true) chapitre.supprimer = true
  return chapitre
}

/**
 * `_metadata.portee` si bien formée, sinon `null` (fichier de Registre, point
 * de restauration, ou portée abîmée par l'IA : traitée comme absente).
 */
export function lirePorteeObjet(p: unknown): Portee | null {
  if (!estObjet(p)) return null
  const texteOu = (v: unknown) => (typeof v === 'string' ? v : '')
  if (p.type === 'classeur' && typeof p.classeur_uuid === 'string') {
    return {
      type: 'classeur',
      classeur_uuid: p.classeur_uuid,
      classeur_name: texteOu(p.classeur_name),
    }
  }
  if (p.type === 'chapitre' && typeof p.chapitre_uuid === 'string') {
    return {
      type: 'chapitre',
      chapitre_uuid: p.chapitre_uuid,
      chapitre_label: texteOu(p.chapitre_label),
    }
  }
  if (p.type === 'document' && typeof p.document_uuid === 'string') {
    return {
      type: 'document',
      document_uuid: p.document_uuid,
      document_title: texteOu(p.document_title),
      chapitre_label: texteOu(p.chapitre_label),
    }
  }
  return null
}

/** `_metadata.periodicites` si bien formé, sinon `undefined` (bloc informatif). */
function lireMetadata(v: unknown): MetadataJson | undefined {
  if (!estObjet(v)) return undefined
  const periodicites: MetadataPeriodiciteJson[] = []
  if (Array.isArray(v.periodicites)) {
    for (const p of v.periodicites) {
      if (
        estObjet(p) &&
        estEntier(p.id) &&
        typeof p.label === 'string' &&
        estEntier(p.nombre)
      ) {
        periodicites.push({ id: p.id, label: p.label, nombre: p.nombre })
      }
    }
  }
  const metadata: MetadataJson = {
    description: typeof v.description === 'string' ? v.description : '',
    generated_at: typeof v.generated_at === 'string' ? v.generated_at : '',
    note: typeof v.note === 'string' ? v.note : '',
    schema: v.schema ?? null,
    periodicites,
  }
  if (
    Array.isArray(v.instructions) &&
    v.instructions.every((x) => typeof x === 'string')
  ) {
    metadata.instructions = v.instructions
  }
  const portee = lirePorteeObjet(v.portee)
  if (portee !== null) metadata.portee = portee
  return metadata
}

/**
 * Lit et valide un fichier d'import. Accepte les formats 1 (sans uuid ni
 * updated_at) et 2 ; refuse au-delà avec un message explicite. Les champs
 * absents prennent les défauts du schéma ; les types inconnus traversent
 * (voir `ItemJson`). Jette une `Error` dont le message est destiné à
 * l'utilisateur.
 */
export function parseImportJson(texte: string): ClasseurJson {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    throw new Error(
      "Ce texte n'est pas lisible en entier. Collez toute la réponse du LLM, ou choisissez le fichier exporté.",
    )
  }
  if (!estObjet(brut)) {
    throw new Error("Ce fichier n'est pas un export de classeur.")
  }
  const version = brut.format_version
  if (!estEntier(version)) {
    throw new Error(
      "Ce fichier n'est pas un export de classeur : son numéro de version manque.",
    )
  }
  if (version > FORMAT_VERSION) {
    throw new Error(
      `Ce fichier vient d'une version plus récente (format ${version}). Cette application lit les formats 1 et 2.`,
    )
  }
  if (version < 1) {
    throw new Error(
      `Ce fichier a un numéro de version inconnu (${version}). Cette application lit les formats 1 et 2.`,
    )
  }
  if (!Array.isArray(brut.chapters)) {
    throw new Error(
      "Ce fichier n'est pas un export de classeur : il n'a pas de liste de chapitres.",
    )
  }

  const resultat: ClasseurJson = {
    format_version: version,
    classeur: lireClasseur(brut.classeur),
    chapters: brut.chapters.map((c, i) => lireChapitre(c, i + 1)),
  }
  const metadata = lireMetadata(brut._metadata)
  if (metadata !== undefined) resultat._metadata = metadata
  return resultat
}

// ---------------------------------------------------------------------------
// Export (forme exacte de do_export_json)
// ---------------------------------------------------------------------------

/**
 * `_metadata.note` des exports (chaîne exigée par Registre). Elle renvoie
 * l'IA à son mode d'emploi ; `_metadata` reste intouchable pour elle.
 */
export const NOTE_EXPORT =
  "Lis d'abord `instructions` : c'est ton mode d'emploi. Ne modifie pas ce bloc _metadata."

/** `_metadata.description` et `note` d'un POINT DE RESTAURATION (sans mode d'emploi). */
export const DESCRIPTION_INSTANTANE =
  "Point de restauration d'un classeur du Back Office (page Classeur), au format d'échange Registre."
export const NOTE_INSTANTANE =
  "Sauvegarde : ce bloc _metadata est informatif. Pour travailler avec un LLM, exportez le classeur depuis l'application."

/**
 * Options de `construireExport` (étape 4 du plan
 * `classeur-echange-ia-2026-10-19`, D6).
 */
export interface OptionsExport {
  /**
   * `true` (défaut) : export destiné à une personne, donc à une IA, avec le
   * mode d'emploi (`instructions`). `false` : POINT DE RESTAURATION (auto,
   * manuel, fusion, sécurité) : pas de mode d'emploi, qui pèserait sur
   * chaque instantané en base sans y servir. Les cinq clés exigées par
   * Registre restent, dont `periodicites` que la restauration relit (E3).
   */
  pourIa?: boolean
}

/** `YYYY-MM-DDTHH:MM:SSZ`, comme `now_iso8601` côté Rust. */
function horodatageExport(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Construit le fichier v2 d'un classeur : chapitres non supprimés triés par
 * `sort_order`, `uid` = slug dédoublonné (`-2`, `-3`…), éléments non
 * supprimés triés par `sort_order` avec les seuls champs de leur nature.
 * `maintenant` n'existe que pour les tests (`generated_at`) ; `options`
 * distingue un export pour une IA (défaut) d'un point de restauration.
 */
export function construireExport(
  classeur: DbClasseur,
  chapters: DbChapter[],
  content: ChapterContent,
  periodicites: DbPeriodicite[],
  maintenant: Date = new Date(),
  options: OptionsExport = {},
): ClasseurJson {
  const pourIa = options.pourIa ?? true
  const itemsTries = flattenItems({
    documents: content.documents.filter((d) => d.deleted_at === null),
    tracking_sheets: content.tracking_sheets.filter(
      (d) => d.deleted_at === null,
    ),
    signature_sheets: content.signature_sheets.filter(
      (d) => d.deleted_at === null,
    ),
    intercalaires: content.intercalaires.filter((d) => d.deleted_at === null),
  })
  const libelles = new Map(periodicites.map((p) => [p.id, p.label]))
  const itemsParChapitre = new Map<number, ItemJson[]>()
  for (const it of itemsTries) {
    const liste = itemsParChapitre.get(it.data.chapter_id) ?? []
    liste.push(itemVersJson(it, libelles))
    itemsParChapitre.set(it.data.chapter_id, liste)
  }

  const chapitresTries = chapters
    .filter((c) => c.deleted_at === null)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const compteSlugs = new Map<string, number>()
  const chapitres: ChapterJson[] = chapitresTries.map((c) => {
    const base = slugify(c.label)
    const n = (compteSlugs.get(base) ?? 0) + 1
    compteSlugs.set(base, n)
    return {
      uid: n === 1 ? base : `${base}-${n}`,
      uuid: c.uuid,
      label: c.label,
      icon: c.icon,
      description: c.description,
      sort_order: c.sort_order,
      items: itemsParChapitre.get(c.id) ?? [],
    }
  })

  return {
    format_version: FORMAT_VERSION,
    _metadata: {
      description: pourIa
        ? "Classeur exporté depuis le Back Office (page Classeur), au format d'échange Registre."
        : DESCRIPTION_INSTANTANE,
      generated_at: horodatageExport(maintenant),
      note: pourIa ? NOTE_EXPORT : NOTE_INSTANTANE,
      schema: SCHEMA_DESCRIPTIF,
      periodicites: [...periodicites]
        .sort((a, b) => a.id - b.id)
        .map((p) => ({ id: p.id, label: p.label, nombre: p.nombre })),
      ...(pourIa
        ? {
            instructions: consignesClasseur(classeur.name),
            // D10 : l'import dira si le fichier vient d'un autre classeur.
            portee: {
              type: 'classeur' as const,
              classeur_uuid: classeur.uuid,
              classeur_name: classeur.name,
            },
          }
        : {}),
    },
    // `COALESCE(icon, 'BookOpen')` côté Rust : une icône vide prend le défaut.
    classeur: {
      name: classeur.name,
      icon: classeur.icon || DEFAUTS.classeur.icon,
      etablissement: classeur.etablissement,
      etablissement_complement: classeur.etablissement_complement,
    },
    chapters: chapitres,
  }
}

/**
 * Ordre des clés = ordre du struct serde `ItemJson` (lisibilité des diffs) ;
 * le libellé `periodicite` d'une feuille de suivi (D8) vient EN DERNIER, et
 * seulement si sa périodicité est connue.
 */
function itemVersJson(
  it: ReturnType<typeof flattenItems>[number],
  libelles: ReadonlyMap<number, string>,
): ItemJson {
  switch (it.kind) {
    case 'document':
      return {
        kind: 'document',
        uuid: it.data.uuid,
        title: it.data.title,
        description: it.data.description,
        content: it.data.content,
        updated_at: it.data.updated_at,
        sort_order: it.data.sort_order,
      }
    case 'tracking_sheet': {
      const libelle = libelles.get(it.data.periodicite_id)
      return {
        kind: 'tracking_sheet',
        uuid: it.data.uuid,
        title: it.data.title,
        periodicite_id: it.data.periodicite_id,
        updated_at: it.data.updated_at,
        sort_order: it.data.sort_order,
        ...(libelle === undefined ? {} : { periodicite: libelle }),
      }
    }
    case 'signature_sheet':
      return {
        kind: 'signature_sheet',
        uuid: it.data.uuid,
        title: it.data.title,
        description: it.data.description,
        nombre: it.data.nombre,
        updated_at: it.data.updated_at,
        sort_order: it.data.sort_order,
      }
    case 'intercalaire':
      return {
        kind: 'intercalaire',
        uuid: it.data.uuid,
        title: it.data.title,
        description: it.data.description,
        updated_at: it.data.updated_at,
        sort_order: it.data.sort_order,
      }
  }
}
