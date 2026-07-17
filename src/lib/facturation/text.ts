/*
 * Normalisation de texte partagée par la facturation (détection par règles ET
 * nuages de mots). Isolée ici pour éviter un cycle d'imports entre detect.ts et
 * wordpool.ts.
 */

/** Minuscules + suppression des accents (NFD) et de tout caractère non-ASCII,
 *  pour un matching robuste. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\x00-\x7f]/g, '')
}
