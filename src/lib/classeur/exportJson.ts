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

/** `<classeur> - <chapitre>[ - <document>].json`, nettoyé (export limité). */
export function nomFichierPortee(...parties: string[]): string {
  const nom = parties
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join(' - ')
  return nomFichierJson(nom)
}

/** Type MIME des fichiers JSON téléchargés. */
export const MIME_JSON = 'application/json;charset=utf-8'

/**
 * Le TEXTE de l'export du classeur complet : exactement ce que Copier met
 * dans le presse-papiers et ce que Télécharger écrit dans le fichier (une
 * seule source pour les deux gestes). `content` porte les éléments de TOUS
 * les chapitres (`fetchClasseurContent`).
 */
export function texteExportClasseur(
  classeur: DbClasseur,
  chapters: DbChapter[],
  content: ChapterContent,
  periodicites: DbPeriodicite[],
  maintenant?: Date,
): string {
  return serialiserExport(
    construireExport(classeur, chapters, content, periodicites, maintenant),
  )
}

/** Issue d'une copie : dans le presse-papiers, ou téléchargée à la place. */
export type IssueCopie = 'copie' | 'telecharge'

/** Ce dont la copie a besoin du presse-papiers (injectable pour les tests). */
export type PressePapiers = Pick<Clipboard, 'writeText'>

/**
 * Le presse-papiers du navigateur, ou `undefined` : il est ABSENT hors
 * contexte sécurisé (http autre que localhost) malgré son type DOM.
 */
function pressePapiersDuNavigateur(): PressePapiers | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as { clipboard?: PressePapiers }).clipboard
}

/**
 * « Copier pour une IA » (étape 3 du plan `classeur-echange-ia-2026-10-19`,
 * D3 : TOUT le JSON, mode d'emploi compris, l'IA guide dès le collage).
 * Copie `texte` dans le presse-papiers ; si le navigateur refuse (API
 * absente, page non sécurisée, permission, activation perdue après une
 * lecture réseau), le fichier est TÉLÉCHARGÉ à la place, sous `nomFichier` :
 * la personne a toujours son export, qu'elle joint à la conversation. Ne
 * lève jamais pour un refus du presse-papiers.
 */
export async function copierOuTelecharger(
  texte: string,
  nomFichier: string,
  presse: PressePapiers | undefined = pressePapiersDuNavigateur(),
): Promise<IssueCopie> {
  try {
    if (presse === undefined) throw new Error('Presse-papiers absent')
    await presse.writeText(texte)
    return 'copie'
  } catch {
    telechargerTexte(nomFichier, texte, MIME_JSON)
    return 'telecharge'
  }
}
