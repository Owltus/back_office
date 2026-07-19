/*
 * Modèle « émetteur → codes » — logique PURE (aucun React/DOM/Supabase), testable en Node.
 * Signal SÉPARÉ du pull de mots : pour un émetteur donné, la distribution des codes
 * d'imputation qu'on lui a validés (compteurs de co-occurrence). Sert de PRIOR fort pour
 * conditionner l'attribution SANS « collapser » un émetteur multi-articles (sa distribution
 * `{codeA:8, codeB:5}` reste un départage, pas un vote unique). L'attribution reste pilotée
 * par l'ÉDUCATION : rien n'est déduit des libellés d'imputation, seulement de l'appris.
 */

/** Co-occurrence apprise : émetteur (clé normalisée) → { code: nombre de confirmations }. */
export interface IssuerCodes {
  perIssuer: Record<string, Record<string, number>>
}

/** Confirmations minimales avant qu'un émetteur pèse comme FILTRE fort (garde anti
 *  sur-apprentissage à froid). Réglage PRUDENT : il faut 5 factures d'un même émetteur avant
 *  qu'il pèse — assez pour ne pas figer une erreur précoce. À affiner à l'usage. */
export const ISSUER_STRONG_MIN = 5
/** Part du total qu'un code doit atteindre pour dire l'émetteur « concentré » (mono-code). */
export const ISSUER_CONCENTRATED_RATIO = 0.8

export interface IssuerMaturity {
  total: number // Σ confirmations pour cet émetteur
  distinctCodes: number // nb de codes distincts vus
  strong: boolean // assez de preuves pour un prior fort
  concentrated: boolean // mûr ET un code domine (≥ ratio) → filtre quasi certain
}

/** Maturité du signal d'un émetteur : combien on l'a vu, et s'il pointe nettement un code. */
export function issuerMaturity(
  model: IssuerCodes,
  issuerKey: string,
): IssuerMaturity {
  const cell = model.perIssuer[issuerKey] ?? {}
  const counts = Object.values(cell).filter((n) => n > 0)
  const total = counts.reduce((a, b) => a + b, 0)
  const max = counts.length ? Math.max(...counts) : 0
  const strong = total >= ISSUER_STRONG_MIN
  return {
    total,
    distinctCodes: counts.length,
    strong,
    concentrated:
      strong && total > 0 && max / total >= ISSUER_CONCENTRATED_RATIO,
  }
}

/** Prior P(code | émetteur) = confirmations(code) / total. `{}` si émetteur inconnu/vide. */
export function issuerPrior(
  model: IssuerCodes,
  issuerKey: string,
): Record<string, number> {
  const cell = model.perIssuer[issuerKey]
  if (!cell) return {}
  const total = Object.values(cell).reduce((a, b) => a + b, 0)
  if (total <= 0) return {}
  const out: Record<string, number> = {}
  for (const [code, n] of Object.entries(cell)) if (n > 0) out[code] = n / total
  return out
}

/** Incrémente (+1) chaque `code` validé pour `issuerKey` (immuable). Nommé `bump` pour ne
 *  pas heurter le wrapper RPC `learnIssuerCodes` de cloudService (écriture serveur). */
export function bumpIssuerCodes(
  model: IssuerCodes,
  issuerKey: string,
  codes: string[],
): IssuerCodes {
  const perIssuer: IssuerCodes['perIssuer'] = {}
  for (const [k, cell] of Object.entries(model.perIssuer))
    perIssuer[k] = { ...cell }
  const dst = (perIssuer[issuerKey] ??= {})
  for (const c of codes) dst[c] = (dst[c] ?? 0) + 1
  return { perIssuer }
}

/** Seuils de détection d'ANOMALIE (file de revue) : chez un émetteur mûr, un code
 *  marginal (part ≤ MAX_SHARE ET compte ≤ MAX_COUNT) est probablement une erreur. */
export const ISSUER_OUTLIER_MAX_SHARE = 0.1
export const ISSUER_OUTLIER_MAX_COUNT = 1

export interface IssuerOutlier {
  issuerKey: string
  code: string
  count: number // compte du code suspect
  share: number // part de ce code chez l'émetteur
  dominant: string // code dominant de l'émetteur (référence)
}

/** Co-occurrences ABERRANTES : chez un émetteur MÛR (total ≥ ISSUER_STRONG_MIN), un code
 *  marginal (part et compte faibles) — candidat « erreur d'imputation » à confirmer. */
export function issuerOutliers(
  model: IssuerCodes,
  opts?: { maxShare?: number; maxCount?: number },
): IssuerOutlier[] {
  const maxShare = opts?.maxShare ?? ISSUER_OUTLIER_MAX_SHARE
  const maxCount = opts?.maxCount ?? ISSUER_OUTLIER_MAX_COUNT
  const out: IssuerOutlier[] = []
  for (const [key, cell] of Object.entries(model.perIssuer)) {
    const entries = Object.entries(cell).filter(([, n]) => n > 0)
    const total = entries.reduce((s, [, n]) => s + n, 0)
    if (total < ISSUER_STRONG_MIN) continue // seulement chez un émetteur mûr
    let dominant = ''
    let max = 0
    for (const [c, n] of entries) if (n > max) ((max = n), (dominant = c))
    for (const [code, n] of entries) {
      if (code !== dominant && n <= maxCount && n / total <= maxShare) {
        out.push({ issuerKey: key, code, count: n, share: n / total, dominant })
      }
    }
  }
  return out
}

/** Retire COMPLÈTEMENT un couple émetteur→code (immuable) — patch optimiste après un
 *  « désapprendre ». Une entrée d'émetteur vidée de tous ses codes disparaît. */
export function removeIssuerCode(
  model: IssuerCodes,
  issuerKey: string,
  code: string,
): IssuerCodes {
  const perIssuer: IssuerCodes['perIssuer'] = {}
  for (const [k, cell] of Object.entries(model.perIssuer)) {
    if (k !== issuerKey) {
      perIssuer[k] = { ...cell }
      continue
    }
    const next = { ...cell }
    delete next[code]
    if (Object.keys(next).length) perIssuer[k] = next
  }
  return { perIssuer }
}

/** Fusion additive de deux modèles (patch optimiste du cache). */
export function mergeIssuerCodes(a: IssuerCodes, b: IssuerCodes): IssuerCodes {
  const perIssuer: IssuerCodes['perIssuer'] = {}
  for (const [k, cell] of Object.entries(a.perIssuer))
    perIssuer[k] = { ...cell }
  for (const [k, cell] of Object.entries(b.perIssuer)) {
    const dst = (perIssuer[k] ??= {})
    for (const [code, n] of Object.entries(cell))
      dst[code] = (dst[code] ?? 0) + n
  }
  return { perIssuer }
}
