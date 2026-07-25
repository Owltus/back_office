/*
 * Mémoire émetteur → compte — logique PURE (testable en Node, sans React/DOM/Supabase).
 *
 * Dérivée de l'HISTORIQUE des factures apprises (vue Supabase facturation_issuer_memory,
 * agrégée depuis facturation_learned_docs). Sert à PRÉ-SÉLECTIONNER le compte qu'un émetteur
 * utilise habituellement pour un code donné, quand ce code porte plusieurs comptes (p. ex. un
 * même code d'énergie ventilé sur deux comptes selon le fournisseur). Le CODE reste piloté par
 * l'apprentissage existant (wordpool / issuer_codes) ; le compte n'est qu'une PRÉCISION apprise
 * par-dessus, jamais un filtre.
 */

/** issuerKey → code analytique → compte → nombre de factures où ce couple a été validé. */
export interface IssuerMemory {
  perIssuer: Record<string, Record<string, Record<string, number>>>
}

/** Le compte que `issuer` a le plus souvent posé sur `code` (mémoire de l'historique). Renvoie
 *  '' si l'émetteur n'a pas d'historique pour ce code, ou si son seul historique est un compte
 *  vide (factures apprises avant l'ajout du compte). Égalité départagée par le premier rencontré
 *  (stable). */
export function preferredCompte(
  mem: IssuerMemory,
  issuer: string,
  code: string,
): string {
  if (!issuer) return ''
  const byCompte = mem.perIssuer[issuer]?.[code]
  if (!byCompte) return ''
  let best = ''
  let bestN = 0
  for (const [compte, n] of Object.entries(byCompte)) {
    if (!compte) continue // ignore l'historique sans compte (factures pré-migration)
    if (n > bestN) {
      best = compte
      bestN = n
    }
  }
  return best
}

/** Tous les couples (code, compte) déjà utilisés par `issuer`, classés du plus fréquent au
 *  moins fréquent (départage stable : code puis compte). Les comptes vides (historique
 *  pré-migration) sont ignorés. Renvoie `[]` si l'émetteur est vide ou inconnu. Sert à
 *  PROPOSER les imputations habituelles d'un émetteur dans l'atelier (jamais à les imposer). */
export function issuerCandidates(
  mem: IssuerMemory,
  issuer: string,
): { code: string; compte: string; n: number }[] {
  if (!issuer) return []
  const byCode = mem.perIssuer[issuer]
  if (!byCode) return []
  const out: { code: string; compte: string; n: number }[] = []
  for (const [code, byCompte] of Object.entries(byCode)) {
    for (const [compte, n] of Object.entries(byCompte)) {
      if (!compte) continue // ignore l'historique sans compte
      out.push({ code, compte, n })
    }
  }
  out.sort(
    (a, b) =>
      b.n - a.n ||
      a.code.localeCompare(b.code) ||
      a.compte.localeCompare(b.compte),
  )
  return out
}
