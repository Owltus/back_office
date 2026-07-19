import { normalize } from '#/lib/facturation/text.ts'
import type { ExtractMethod } from '#/lib/facturation/types.ts'

/*
 * Empreinte SHA-256 d'un document de facturation — 100 % navigateur (crypto.subtle), pur
 * (aucun React/Supabase), testable. Sert d'IDENTITÉ à un PDF pour : détecter un doublon au
 * dépôt, et retrouver dans le journal d'apprentissage EXACTEMENT ce qu'une facture a appris
 * (pour la désapprendre sans re-déposer le PDF). Le choix « texte vs octets » dépend de la
 * source (cf. hashDocument) : le texte natif est déterministe, l'OCR non.
 */

async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Hash du TEXTE extrait, NORMALISÉ (absorbe casse/accents) : stable pour un PDF natif, et
 *  identique même si le même PDF est ré-exporté tant que le texte extrait est le même. */
export const hashText = (text: string): Promise<string> =>
  sha256Hex(new TextEncoder().encode(normalize(text)))

/** Hash des OCTETS du fichier : identité robuste, indépendante de l'extraction (pour l'OCR,
 *  dont le texte n'est pas reproductible d'un scan à l'autre). */
export const hashBytes = (buf: ArrayBuffer): Promise<string> => sha256Hex(buf)

/** Empreinte d'un document selon sa source (décision D1) : PDF natif → hash du texte
 *  (identité sémantique) ; scan OCR → hash des octets (seul stable). */
export async function hashDocument(
  method: ExtractMethod,
  text: string,
  file: File,
): Promise<string> {
  return method === 'native'
    ? hashText(text)
    : hashBytes(await file.arrayBuffer())
}
