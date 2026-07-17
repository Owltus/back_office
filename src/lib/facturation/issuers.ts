import { normalize } from '#/lib/facturation/text.ts'

/*
 * Reconnaissance d'un émetteur DÉJÀ vu — logique PURE (testable en Node). On tient
 * un dictionnaire des noms d'émetteurs saisis (normalisés) ; sur une nouvelle
 * facture, si le texte contient un émetteur connu, on le propose. Sans IA : simple
 * recherche de sous-chaîne. Un fournisseur au gabarit d'en-tête constant est ainsi
 * reconnu dès la 2e facture. Un émetteur inconnu n'est jamais deviné (renvoie null).
 */

export interface Issuer {
  name: string // nom normalisé (clé)
  display: string // nom lisible à afficher
  count: number // nombre de confirmations
}

/** Émetteur connu présent dans le texte (sous-chaîne, nom ≥ 4 car.), le plus
 *  confirmé d'abord (puis le nom le plus long). null si aucun. */
export function matchIssuer(rawText: string, issuers: Issuer[]): Issuer | null {
  const text = normalize(rawText)
  let best: Issuer | null = null
  for (const it of issuers) {
    if (it.name.length < 4 || !text.includes(it.name)) continue
    if (
      !best ||
      it.count > best.count ||
      (it.count === best.count && it.name.length > best.name.length)
    )
      best = it
  }
  return best
}
