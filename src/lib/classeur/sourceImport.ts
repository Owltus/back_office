import { MAX_JSON_BYTES, fileTooLarge } from '#/lib/shared/files.ts'

/*
 * Ce que la personne donne à un import (refonte du 2026-10-20 de la saisie,
 * partagée par l'import d'un classeur et celui d'un chapitre ou d'un
 * document) : un fichier, ou le texte collé de la réponse d'un LLM. Pur, sans
 * React : la lecture applique la même borne de taille aux deux.
 */

export type SourceImport =
  { type: 'fichier'; file: File } | { type: 'texte'; texte: string }

export function tailleOctets(texte: string): number {
  return new TextEncoder().encode(texte).length
}

/**
 * Un fichier qui n'est pas du texte (photo, PDF, document Word…) déposé
 * par erreur (trouvé au navigateur le 2026-10-22 : une photo déposée
 * donnait « son numéro de version manque », ses octets contenant des
 * accolades).
 */
export const MESSAGE_PAS_UN_EXPORT =
  "Ce fichier n'est pas un export : une photo, un PDF ou un fichier Word ne s'importe pas ici. Choisissez le fichier .json exporté, ou collez la réponse du LLM."

const TYPES_BINAIRES =
  /^(image|audio|video|font)\/|^application\/(pdf|zip|vnd\.|msword|octet-stream)/
const EXTENSIONS_BINAIRES =
  /\.(png|jpe?g|gif|webp|heic|bmp|tiff?|pdf|docx?|xlsx?|pptx?|odt|ods|zip|mp4|mov|mp3)$/i

/** Le texte de la source, borné à `MAX_JSON_BYTES`. */
export async function lireSource(source: SourceImport): Promise<string> {
  if (source.type === 'texte') {
    if (tailleOctets(source.texte) > MAX_JSON_BYTES)
      throw new Error('Texte trop volumineux pour un import.')
    return source.texte
  }
  const { file } = source
  if (TYPES_BINAIRES.test(file.type) || EXTENSIONS_BINAIRES.test(file.name))
    throw new Error(MESSAGE_PAS_UN_EXPORT)
  const trop = fileTooLarge(file, MAX_JSON_BYTES)
  if (trop) throw new Error(trop)
  const texte = await file.text()
  // Un caractère nul ne se trouve dans aucun texte : un binaire renommé.
  if (texte.includes('\u0000')) throw new Error(MESSAGE_PAS_UN_EXPORT)
  return texte
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
