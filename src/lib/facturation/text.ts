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

/** Suffixes juridiques ignorés lors de la COMPARAISON de noms d'émetteurs. */
const LEGAL_SUFFIXES = new Set([
  'sarl',
  'sas',
  'sasu',
  'sa',
  'eurl',
  'sci',
  'snc',
  'sce',
])

/**
 * Normalisation RENFORCÉE, réservée à la COMPARAISON de noms d'émetteurs (dédup /
 * suggestion floue) : `normalize` + ponctuation → espace, espaces compactés, retrait
 * des suffixes juridiques finaux (« Martin SARL » ≈ « Martin »). SÉPARÉE de `normalize`
 * (partagée avec la tokenisation des nuages) pour ne pas altérer le scoring.
 */
export function normalizeIssuer(s: string): string {
  const words = normalize(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words.pop()
  }
  return words.join(' ')
}

/**
 * CLÉ CANONIQUE d'un émetteur — l'IDENTITÉ unique utilisée pour APPRENDRE, CURER et DÉTECTER.
 * Toute dérivation de clé émetteur DOIT passer par ici — sinon le même fournisseur se fragmente
 * en sous-comptes (l'UI le montre « connu » mais l'apprend ailleurs), et le filtre émetteur
 * n'atteint jamais son seuil de maturité.
 *
 * Deux régimes, par ordre de fiabilité :
 *  - `siren` fourni (SIRET/SIREN lu sur la facture, cf. `siret.ts`) → clé `siren:<9 chiffres>`.
 *    Identité robuste : insensible aux noms courts (EDF, RTE, SFR) et à un nom mal océrisé.
 *    On regroupe par SIREN (l'ENTREPRISE), jamais par SIRET (l'établissement).
 *  - sinon (repli, INCHANGÉ) → `normalizeIssuer(supplier)` : c'est EXACTEMENT la normalisation
 *    que le combobox emploie pour dédupliquer à l'écran (« Martin », « Martin SARL », « MARTIN, »
 *    et « Martin  » donnent tous la même clé).
 */
export const issuerKey = (supplier: string, siren?: string): string =>
  siren ? `siren:${siren}` : normalizeIssuer(supplier)
