/*
 * Export JSON d'un classeur — format v2 de Registre, échangeable avec
 * l'application de bureau (`files.rs::do_export_json`).
 *
 * La FORME du fichier (`format_version`, `_metadata`, `classeur`,
 * `chapters[].items[]`) appartient à `merge/schema.ts` (`construireExport`),
 * qui la partage avec l'import : ici on ne fait que sérialiser et
 * télécharger. Indentation à 2 espaces, comme le `serde_json::to_string_pretty`
 * de la source.
 */

import { telechargerTexte } from '#/lib/classeur/download.ts'
import { sanitizeFilename } from '#/lib/classeur/slug.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbPeriodicite,
} from '#/lib/classeur/types.ts'

/** Nom de fichier d'un classeur sans nom (comme Registre). */
const NOM_CLASSEUR_REPLI = 'Classeur'

/** Sérialisation lisible (2 espaces) — séparée pour être testable. */
export function serialiserExport(donnees: unknown): string {
  return JSON.stringify(donnees, null, 2)
}

/** `<nom du classeur>.json`, nettoyé. */
export function nomFichierJson(classeurName: string): string {
  return `${sanitizeFilename(classeurName.trim() || NOM_CLASSEUR_REPLI) || NOM_CLASSEUR_REPLI}.json`
}

/**
 * Télécharge le classeur complet au format JSON v2. `content` porte les
 * éléments de TOUS les chapitres (`fetchClasseurContent`).
 */
export function exporterClasseurJson(
  classeur: DbClasseur,
  chapters: DbChapter[],
  content: ChapterContent,
  periodicites: DbPeriodicite[],
): void {
  const donnees = construireExport(classeur, chapters, content, periodicites)
  telechargerTexte(
    nomFichierJson(classeur.name),
    serialiserExport(donnees),
    'application/json;charset=utf-8',
  )
}
