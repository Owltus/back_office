/*
 * Similarité de chaînes — logique PURE (aucun React/DOM), testable en Node. Sert à
 * repérer une faute de frappe proche d'un émetteur DÉJÀ connu (« vouliez-vous dire… »).
 * Distance de Levenshtein + ratio normalisé. Sans IA, juste de l'édition de caractères.
 */

/** Distance d'édition (insertions/suppressions/substitutions) entre `a` et `b`. */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/** Ratio de similarité 0..1 (1 = identique, 0 = tout différent). */
export function similarity(a: string, b: string): number {
  const m = Math.max(a.length, b.length)
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m
}

/**
 * Meilleur nom de `names` PROCHE de `query` (ratio ≥ `minRatio`) mais NON identique.
 * Renvoie `null` si `query` correspond déjà exactement à un nom (rien à corriger) ou si
 * aucun n'est assez proche. Déterministe : à ratio égal, le premier rencontré gagne.
 */
export function closestName(
  query: string,
  names: string[],
  minRatio = 0.85,
): string | null {
  let best: string | null = null
  let bestRatio = minRatio
  for (const name of names) {
    if (name === query) return null // déjà canonique → aucune suggestion
    const r = similarity(query, name)
    if (r > bestRatio) {
      bestRatio = r
      best = name
    }
  }
  return best
}
