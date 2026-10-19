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

/** Bloc `_metadata` : informatif, jamais requis à l'import. */
export interface MetadataJson {
  description: string
  generated_at: string
  note: string
  schema: unknown
  periodicites: MetadataPeriodiciteJson[]
  /** Consignes pour un LLM (`consignes.ts`) — ajout du Back Office, ignoré par Registre. */
  instructions?: string[]
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
          "Fiche de suivi périodique. N'a PAS de champ description.",
        specific_fields: {
          periodicite_id: { type: 'integer|null', required: false },
        },
      },
      signature_sheet: {
        _description: "Fiche d'émargement.",
        specific_fields: {
          description: { type: 'string', required: false, default: '' },
          nombre: {
            type: 'integer|null',
            required: false,
            default: DEFAUTS.signature_sheet.nombre,
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
      "Table de référence des périodicités de suivi (informative, ignorée à l'import).",
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
      "Le bloc _metadata est purement informatif, ignoré à l'import.",
    matching_priority:
      '1) UUID si présent → recherche dans tout le classeur. 2) Fallback slug+titre (v1).',
    last_write_wins:
      'Si un item est trouvé par UUID, la version la plus récente (updated_at) gagne.',
    soft_delete_respected:
      "Un item supprimé localement (soft delete) n'est pas recréé par le merge — compté comme 'skipped'.",
    move_detection:
      "Un item trouvé par UUID dans un chapitre différent n'est pas re-déplacé. Son contenu est mis à jour si plus récent.",
    no_deletion:
      "Le merge n'efface jamais de données. Les items locaux absents du JSON sont conservés.",
  },
} as const

// ---------------------------------------------------------------------------
// Lecture et validation
// ---------------------------------------------------------------------------

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
    throw new Error(`${contexte} : le champ '${cle}' doit être un texte.`)
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
      `${contexte} : le champ '${cle}' doit être un nombre entier.`,
    )
  }
  return v
}

function lireClasseur(v: unknown): ClasseurDataJson {
  const obj = estObjet(v) ? v : {}
  const ctx = "Bloc 'classeur'"
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
function lireItem(v: unknown, contexte: string, position: number): ItemJson {
  if (!estObjet(v)) {
    throw new Error(
      `${contexte} : l'élément n° ${position} n'est pas un objet.`,
    )
  }
  const kind = chaine(v, 'kind', undefined, contexte)
  if (kind === undefined) {
    throw new Error(
      `${contexte} : l'élément n° ${position} n'a pas de champ 'kind'.`,
    )
  }
  const title = chaine(v, 'title', undefined, contexte)
  if (title === undefined) {
    throw new Error(`${contexte} : l'élément n° ${position} n'a pas de titre.`)
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
  return item
}

function lireChapitre(v: unknown, position: number): ChapterJson {
  if (!estObjet(v)) {
    throw new Error(`Le chapitre n° ${position} n'est pas un objet.`)
  }
  const ctx = `Chapitre n° ${position}`
  const label = chaine(v, 'label', undefined, ctx)
  if (label === undefined) {
    throw new Error(`${ctx} : aucun libellé ('label').`)
  }
  const ctxLabel = `Chapitre '${label}'`
  const itemsBruts = v.items === undefined || v.items === null ? [] : v.items
  if (!Array.isArray(itemsBruts)) {
    throw new Error(`${ctxLabel} : le champ 'items' doit être une liste.`)
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
  return chapitre
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
    throw new Error("Ce fichier n'est pas un JSON valide.")
  }
  if (!estObjet(brut)) {
    throw new Error(
      "Ce fichier n'est pas un export de classeur (objet attendu).",
    )
  }
  const version = brut.format_version
  if (!estEntier(version)) {
    throw new Error(
      "Ce fichier n'est pas un export de classeur : 'format_version' manquant.",
    )
  }
  if (version > FORMAT_VERSION) {
    throw new Error(
      `Ce fichier a été produit par une version plus récente (format ${version}) ; cette application lit les formats 1 et 2.`,
    )
  }
  if (version < 1) {
    throw new Error(`Version de format non supportée : ${version}.`)
  }
  if (!Array.isArray(brut.chapters)) {
    throw new Error(
      "Ce fichier n'est pas un export de classeur : liste 'chapters' absente.",
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

/** `YYYY-MM-DDTHH:MM:SSZ`, comme `now_iso8601` côté Rust. */
function horodatageExport(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Construit le fichier v2 d'un classeur : chapitres non supprimés triés par
 * `sort_order`, `uid` = slug dédoublonné (`-2`, `-3`…), éléments non
 * supprimés triés par `sort_order` avec les seuls champs de leur nature.
 * `maintenant` n'existe que pour les tests (`generated_at`).
 */
export function construireExport(
  classeur: DbClasseur,
  chapters: DbChapter[],
  content: ChapterContent,
  periodicites: DbPeriodicite[],
  maintenant: Date = new Date(),
): ClasseurJson {
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
  const itemsParChapitre = new Map<number, ItemJson[]>()
  for (const it of itemsTries) {
    const liste = itemsParChapitre.get(it.data.chapter_id) ?? []
    liste.push(itemVersJson(it))
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
      description:
        "Classeur exporté depuis le Back Office (page Classeur), au format d'échange Registre.",
      generated_at: horodatageExport(maintenant),
      note: "Lis d'abord `instructions`. Ce bloc _metadata est informatif et ignoré lors de l'import.",
      schema: SCHEMA_DESCRIPTIF,
      periodicites: [...periodicites]
        .sort((a, b) => a.id - b.id)
        .map((p) => ({ id: p.id, label: p.label, nombre: p.nombre })),
      instructions: consignesClasseur(classeur.name),
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

/** Ordre des clés = ordre du struct serde `ItemJson` (lisibilité des diffs). */
function itemVersJson(it: ReturnType<typeof flattenItems>[number]): ItemJson {
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
    case 'tracking_sheet':
      return {
        kind: 'tracking_sheet',
        uuid: it.data.uuid,
        title: it.data.title,
        periodicite_id: it.data.periodicite_id,
        updated_at: it.data.updated_at,
        sort_order: it.data.sort_order,
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
