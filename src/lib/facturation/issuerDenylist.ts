/*
 * Denylist émetteur↔code — logique PURE (aucun React/DOM/Supabase). Un garde BINAIRE :
 * « cet émetteur ne va JAMAIS sur ce code ». Distinct du signal fréquentiel (issuerCodes) :
 * ici, présence = interdit. Sert à retirer un code des candidats pour un émetteur donné.
 */

export interface IssuerDenylist {
  perIssuer: Record<string, Set<string>>
}

/** Vrai si le code est interdit pour cet émetteur. */
export function isDenied(
  model: IssuerDenylist,
  issuerKey: string,
  code: string,
): boolean {
  return model.perIssuer[issuerKey]?.has(code) ?? false
}

/** Ensemble des codes interdits pour cet émetteur (vide si aucun). */
export function deniedCodes(
  model: IssuerDenylist,
  issuerKey: string,
): Set<string> {
  return model.perIssuer[issuerKey] ?? new Set()
}

/** Fusion (union) de deux denylists — patch optimiste du cache. */
export function mergeDenylist(
  a: IssuerDenylist,
  b: IssuerDenylist,
): IssuerDenylist {
  const perIssuer: Record<string, Set<string>> = {}
  for (const [k, set] of Object.entries(a.perIssuer))
    perIssuer[k] = new Set(set)
  for (const [k, set] of Object.entries(b.perIssuer)) {
    const dst = (perIssuer[k] ??= new Set())
    for (const c of set) dst.add(c)
  }
  return { perIssuer }
}

/** Retire une interdiction (immuable) — patch optimiste du cache après un « unban ».
 *  Une entrée d'émetteur vidée de tous ses codes disparaît (pas de coquille vide). */
export function removeDeny(
  model: IssuerDenylist,
  issuerKey: string,
  code: string,
): IssuerDenylist {
  const perIssuer: Record<string, Set<string>> = {}
  for (const [k, set] of Object.entries(model.perIssuer)) {
    if (k !== issuerKey) {
      perIssuer[k] = new Set(set)
      continue
    }
    const next = new Set(set)
    next.delete(code)
    if (next.size) perIssuer[k] = next
  }
  return { perIssuer }
}
