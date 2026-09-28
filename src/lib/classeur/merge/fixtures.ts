/*
 * Constructeurs de données POUR LES TESTS de `lib/classeur/merge` (aucun
 * usage applicatif). Chaque constructeur rend une ligne complète et JSON-sûre
 * à partir des seuls champs qui comptent pour le cas testé.
 */

import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbDocument,
  DbIntercalaire,
  DbPeriodicite,
  DbSignatureSheet,
  DbTrackingSheet,
} from '#/lib/classeur/types.ts'
import type {
  ChapterJson,
  ClasseurJson,
  ItemJson,
} from '#/lib/classeur/merge/schema.ts'
import type { EtatLocal } from '#/lib/classeur/merge/merge.ts'

export const T0 = '2026-01-01T00:00:00+00:00'

/** Référentiel local : ids volontairement éloignés de ceux de Registre (1..9). */
export const PERIODICITES: DbPeriodicite[] = [
  { id: 41, label: 'Mensuel', nombre: 8, sort_order: 1 },
  { id: 44, label: 'Annuel', nombre: 8, sort_order: 4 },
  { id: 49, label: 'Non défini', nombre: 8, sort_order: 9 },
]

export function classeur(over: Partial<DbClasseur> = {}): DbClasseur {
  return {
    id: 1,
    uuid: 'cl-uuid',
    name: 'Registre de sécurité',
    icon: 'Shield',
    etablissement: 'OKKO Nantes',
    etablissement_complement: '',
    sort_order: 1,
    deleted_at: null,
    created_at: T0,
    updated_at: T0,
    created_by: null,
    acces_tous: 'lecture',
    ...over,
  }
}

export function chapitre(
  over: Partial<DbChapter> & Pick<DbChapter, 'id' | 'label'>,
): DbChapter {
  return {
    uuid: `ch-${over.id}`,
    classeur_id: 1,
    icon: 'FileText',
    description: '',
    sort_order: 1,
    deleted_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  }
}

type Base = { id: number; chapter_id: number; title: string }

export function document(over: Partial<DbDocument> & Base): DbDocument {
  return {
    uuid: `doc-${over.id}`,
    description: '',
    content: '',
    sort_order: 1,
    deleted_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  }
}

export function suivi(over: Partial<DbTrackingSheet> & Base): DbTrackingSheet {
  return {
    uuid: `ts-${over.id}`,
    periodicite_id: 41,
    sort_order: 1,
    deleted_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  }
}

export function signature(
  over: Partial<DbSignatureSheet> & Base,
): DbSignatureSheet {
  return {
    uuid: `sig-${over.id}`,
    description: '',
    nombre: 14,
    sort_order: 1,
    deleted_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  }
}

export function intercalaire(
  over: Partial<DbIntercalaire> & Base,
): DbIntercalaire {
  return {
    uuid: `int-${over.id}`,
    description: '',
    sort_order: 1,
    deleted_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  }
}

export function contenu(over: Partial<ChapterContent> = {}): ChapterContent {
  return {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
    ...over,
  }
}

/** `periodicites: null` = état local SANS référentiel (champ absent). */
export function etat(
  chapters: DbChapter[],
  content: Partial<ChapterContent> = {},
  periodicites: DbPeriodicite[] | null = PERIODICITES,
): EtatLocal {
  const e: EtatLocal = { chapters, content: contenu(content) }
  if (periodicites !== null) e.periodicites = periodicites
  return e
}

export function chJson(
  over: Partial<ChapterJson> & Pick<ChapterJson, 'label'>,
): ChapterJson {
  return {
    uid: over.label.toLowerCase(),
    icon: 'FileText',
    description: '',
    sort_order: 1,
    items: [],
    ...over,
  }
}

export function itJson(
  over: Partial<ItemJson> & Pick<ItemJson, 'kind' | 'title'>,
): ItemJson {
  return { sort_order: 1, ...over }
}

export function fichier(
  chapters: ChapterJson[],
  over: Partial<ClasseurJson> = {},
): ClasseurJson {
  return {
    format_version: 2,
    classeur: {
      name: 'Registre de sécurité',
      icon: 'Shield',
      etablissement: 'OKKO Nantes',
      etablissement_complement: '',
    },
    chapters,
    ...over,
  }
}
