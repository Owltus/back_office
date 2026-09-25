/*
 * Import de fichiers texte déposés sur un chapitre — fonctions PURES
 * (portées de Registre, `pages/chapter/DropZone.tsx`, qui n'acceptait que
 * `.md` et ne bornait pas la taille).
 *
 * Un fichier `.md` ou `.txt` devient un DOCUMENT du chapitre : titre = nom
 * du fichier sans extension, contenu = texte brut. La borne de taille vient
 * de `lib/shared/files.ts` (`MAX_MARKDOWN_BYTES`).
 */

import { MAX_MARKDOWN_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/** Extensions acceptées (minuscules, avec le point). */
export const EXTENSIONS_ACCEPTEES: readonly string[] = ['.md', '.txt']

/** Vrai si le nom de fichier porte une extension acceptée (casse ignorée). */
export function estFichierTexte(nom: string): boolean {
  const n = nom.toLowerCase()
  return EXTENSIONS_ACCEPTEES.some((ext) => n.endsWith(ext))
}

/** Titre d'un document importé : le nom sans extension, `Sans titre` si vide. */
export function titreDepuisNom(nom: string): string {
  const sansExt = nom
    .trim()
    .replace(/\.(md|txt)$/i, '')
    .trim()
  return sansExt === '' ? 'Sans titre' : sansExt
}

export interface FichierImporte {
  title: string
  content: string
}

export interface TriFichiers {
  /** Fichiers acceptés, à lire. */
  acceptes: File[]
  /** Un message par fichier refusé (extension ou taille). */
  refus: string[]
}

/**
 * Trie une liste de fichiers déposés : extension acceptée ET taille sous la
 * borne. Les refus sont des phrases courtes, prêtes à afficher.
 */
export function trierFichiers(fichiers: ReadonlyArray<File>): TriFichiers {
  const acceptes: File[] = []
  const refus: string[] = []
  for (const f of fichiers) {
    if (!estFichierTexte(f.name)) {
      refus.push(`Fichier ignoré (seuls .md et .txt sont acceptés) : ${f.name}`)
      continue
    }
    const trop = fileTooLarge(f, MAX_MARKDOWN_BYTES)
    if (trop) {
      refus.push(trop)
      continue
    }
    acceptes.push(f)
  }
  return { acceptes, refus }
}

/** Lit les fichiers acceptés en texte, dans l'ordre. */
export async function lireFichiers(
  fichiers: ReadonlyArray<File>,
): Promise<FichierImporte[]> {
  return Promise.all(
    fichiers.map(async (f) => ({
      title: titreDepuisNom(f.name),
      content: await f.text(),
    })),
  )
}
