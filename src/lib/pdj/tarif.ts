/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — détection DYNAMIQUE du tarif unitaire par code.
 *
 * Le prix d'un PDJ n'est écrit nulle part (le In-House ne porte que « … INCL »),
 * mais dans l'Addon Production le REVENU d'un code est toujours un MULTIPLE de son
 * prix unitaire (dans les vraies données : PDJ → multiples de 19, PDJBB → de 10,
 * PDJGROUP10 → de 10). On en déduit le tarif SANS RIEN écrire en dur : c'est le
 * plus grand montant dont une forte majorité des revenus journaliers du code sont
 * des multiples exacts. Si demain le prix change (25 €…), les revenus deviennent
 * multiples de 25 → la détection renvoie 25 toute seule.
 *
 * Les jours « remise / gratuité / avoir » (revenus non multiples, 0, négatifs) sont
 * des minoritaires : ils n'empêchent pas la détection (seuil de 2/3) et remontent
 * ailleurs comme anomalies.
 * ------------------------------------------------------------------------ */

/** Part minimale des revenus devant s'expliquer par le tarif retenu (sinon null). */
const SUPPORT_MIN = 0.5

/**
 * Détecte le prix unitaire TTC (en €) d'un code à partir de ses revenus TTC
 * journaliers. Renvoie null si indétectable (trop peu de données, ou trop dispersé
 * → à signaler comme « tarif non détecté »). Calcul en CENTIMES (entiers) pour
 * éviter les pièges du flottant.
 *
 * Principe : le tarif est le PLUS GRAND montant qui divise le MAXIMUM de revenus.
 * Ses diviseurs (P/2, P/3) divisent autant de jours mais sont plus petits ; ses
 * multiples (2P, 3P) sont plus grands mais divisent moins de jours. Le tarif est
 * donc le plus grand candidat atteignant le score maximal — robuste aux remises.
 */
export function detectUnitPrice(revenues: number[]): number | null {
  const cents = revenues
    .map((r) => Math.round(r * 100))
    .filter((c) => c > 0)
  if (cents.length < 3) return null

  // Candidats plausibles (1 € à 50 €) dérivés des revenus eux-mêmes (revenu ÷ k).
  const candidates = new Set<number>()
  for (const c of cents) {
    for (let k = 1; k <= 60; k++) {
      const cand = Math.round(c / k)
      if (cand >= 100 && cand <= 5000) candidates.add(cand)
    }
  }

  // Nb de revenus dont chaque candidat est un multiple exact.
  let maxMult = 0
  const multOf = new Map<number, number>()
  for (const cand of candidates) {
    let m = 0
    for (const c of cents) if (c % cand === 0) m++
    multOf.set(cand, m)
    if (m > maxMult) maxMult = m
  }
  if (maxMult / cents.length < SUPPORT_MIN) return null

  // Le PLUS GRAND candidat atteignant ce maximum = le tarif.
  let best = 0
  for (const [cand, m] of multOf) if (m === maxMult && cand > best) best = cand
  return best > 0 ? best / 100 : null
}

/**
 * Tarifs détectés par code à partir des lignes Addon (revenu TTC par code/jour).
 * Un code sans tarif détectable est ABSENT de la map (→ alerte côté appelant).
 */
export function detectTarifs(
  addon: { code: string; revenue_ttc: number }[],
): Map<string, number> {
  const byCode = new Map<string, number[]>()
  for (const a of addon) {
    const list = byCode.get(a.code) ?? []
    list.push(a.revenue_ttc)
    byCode.set(a.code, list)
  }
  const tarifs = new Map<string, number>()
  for (const [code, revs] of byCode) {
    const p = detectUnitPrice(revs)
    if (p != null) tarifs.set(code, p)
  }
  return tarifs
}
