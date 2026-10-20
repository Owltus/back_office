import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/*
 * Ce que la personne donne à un import (refonte du 2026-10-20 de la saisie,
 * partagée par l'import d'un classeur et celui d'un chapitre ou d'un
 * document) : un fichier, ou le texte collé de la réponse d'une IA. Pur, sans
 * React : la lecture applique la même borne de taille aux deux.
 */

export type SourceImport =
  { type: 'fichier'; file: File } | { type: 'texte'; texte: string }

export function tailleOctets(texte: string): number {
  return new TextEncoder().encode(texte).length
}

/** Le texte de la source, borné à `MAX_JSON_BYTES`. */
export async function lireSource(source: SourceImport): Promise<string> {
  if (source.type === 'texte') {
    if (tailleOctets(source.texte) > MAX_JSON_BYTES)
      throw new Error('Texte trop volumineux pour un import.')
    return source.texte
  }
  const trop = fileTooLarge(source.file, MAX_JSON_BYTES)
  if (trop) throw new Error(trop)
  return source.file.text()
}

/** Taille lisible : « 820 octets », « 12 ko », « 1,4 Mo ». */
export function tailleLisible(octets: number): string {
  if (octets < 1024) return `${String(octets)} octets`
  if (octets < 1024 * 1024)
    return `${String(Math.max(1, Math.round(octets / 1024)))} ko`
  const mo = octets / (1024 * 1024)
  return `${mo.toFixed(1).replace('.', ',')} Mo`
}

/** Poids de la source, pour la ligne repliée. */
export function tailleSource(source: SourceImport): number {
  return source.type === 'fichier'
    ? source.file.size
    : tailleOctets(source.texte)
}
