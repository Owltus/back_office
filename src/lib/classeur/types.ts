/*
 * Types de la page Classeur — miroirs des tables `classeur_*`
 * (supabase/classeur_2026-09-25.sql), en snake_case comme la base.
 *
 * Portés de Registre (`src/pages/chapter/types.ts`, `src/lib/navigation.ts`).
 * Différences avec la source : `chapter_id` est un entier (FK) et non un
 * texte, `uuid` est toujours présent (défaut en base), les dates sont des
 * chaînes ISO. Tout est JSON-sûr : ces objets sont écrits tels quels par le
 * cache persisté (`lib/queryPersist.ts`, règle `survitAuJson`).
 */

/** Ligne de `classeur_classeurs`. */
export interface DbClasseur {
  id: number
  uuid: string
  name: string
  icon: string
  etablissement: string
  etablissement_complement: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** Ligne de `classeur_chapters`. */
export interface DbChapter {
  id: number
  uuid: string
  classeur_id: number
  label: string
  icon: string
  description: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** Ligne de `classeur_periodicites` (référentiel, lecture seule). */
export interface DbPeriodicite {
  id: number
  label: string
  /** Nombre de colonnes du tableau de suivi imprimé. */
  nombre: number
  sort_order: number
}

/** Ligne de `classeur_documents` — un document Markdown. */
export interface DbDocument {
  id: number
  uuid: string
  chapter_id: number
  title: string
  description: string
  content: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** Ligne de `classeur_tracking_sheets` — feuille de suivi périodique. */
export interface DbTrackingSheet {
  id: number
  uuid: string
  chapter_id: number
  title: string
  periodicite_id: number
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** Ligne de `classeur_signature_sheets` — feuille d'émargement. */
export interface DbSignatureSheet {
  id: number
  uuid: string
  chapter_id: number
  title: string
  description: string
  /** Nombre de lignes de signature (1..60). */
  nombre: number
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** Ligne de `classeur_intercalaires` — page de séparation. */
export interface DbIntercalaire {
  id: number
  uuid: string
  chapter_id: number
  title: string
  description: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Genre d'un point de restauration (`classeur_merge_history.kind`) :
 * `auto` mineur pris avant une session de modifications ; `manuel` majeur
 * nommé par l'utilisateur ; `fusion` avant un import JSON ; `securite` avant
 * une restauration. Voir `lib/classeur/restauration.ts`.
 */
export type PointKind = 'auto' | 'manuel' | 'fusion' | 'securite'

/** Ligne de `classeur_merge_history` (sans l'instantané, volumineux). */
export interface DbMergeHistoryEntry {
  id: number
  classeur_id: number
  merged_at: string
  kind: PointKind
  /** Libellé d'un point manuel. */
  label: string
  /** Nom du fichier d'une fusion. */
  source_name: string
  inserted: number
  updated: number
  unchanged: number
  skipped: number
  /** Poids de l'instantané en octets (posé par trigger). */
  taille: number | null
}

/** Les quatre natures d'élément d'un chapitre. */
export type ItemKind =
  'document' | 'tracking_sheet' | 'signature_sheet' | 'intercalaire'

export const ITEM_KINDS: readonly ItemKind[] = [
  'document',
  'tracking_sheet',
  'signature_sheet',
  'intercalaire',
]

/** Élément d'un chapitre, discriminé par sa nature. */
export type ChapterItem =
  | { kind: 'document'; data: DbDocument }
  | { kind: 'tracking_sheet'; data: DbTrackingSheet }
  | { kind: 'signature_sheet'; data: DbSignatureSheet }
  | { kind: 'intercalaire'; data: DbIntercalaire }

/** Les quatre familles d'un chapitre, lues en une fois. */
export interface ChapterContent {
  documents: DbDocument[]
  tracking_sheets: DbTrackingSheet[]
  signature_sheets: DbSignatureSheet[]
  intercalaires: DbIntercalaire[]
}

/** Table Supabase de chaque nature d'élément. */
export const ITEM_TABLE: Record<ItemKind, string> = {
  document: 'classeur_documents',
  tracking_sheet: 'classeur_tracking_sheets',
  signature_sheet: 'classeur_signature_sheets',
  intercalaire: 'classeur_intercalaires',
}

/** Libellé humain de chaque nature (singulier, sans article). */
export const ITEM_LABEL: Record<ItemKind, string> = {
  document: 'document',
  tracking_sheet: 'feuille de suivi',
  signature_sheet: 'feuille de signature',
  intercalaire: 'intercalaire',
}

/** Statut de conformité d'un chapitre. */
export type ChapterStatus = 'conforme' | 'a_verifier' | 'non_conforme'

/** Un chapitre est « conforme » dès qu'il contient au moins un élément. */
export function computeStatus(itemCount: number): ChapterStatus {
  return itemCount >= 1 ? 'conforme' : 'a_verifier'
}

/** Aplatit le contenu d'un chapitre en une liste triée par `sort_order`. */
export function flattenItems(content: ChapterContent): ChapterItem[] {
  const items: ChapterItem[] = [
    ...content.documents.map((data) => ({ kind: 'document' as const, data })),
    ...content.tracking_sheets.map((data) => ({
      kind: 'tracking_sheet' as const,
      data,
    })),
    ...content.signature_sheets.map((data) => ({
      kind: 'signature_sheet' as const,
      data,
    })),
    ...content.intercalaires.map((data) => ({
      kind: 'intercalaire' as const,
      data,
    })),
  ]
  return items.sort(
    (a, b) => a.data.sort_order - b.data.sort_order || a.data.id - b.data.id,
  )
}
