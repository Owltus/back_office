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
 * des minoritaires : ils n'empêchent pas la détection (SUPPORT_MIN, et surtout
 * SUPPORT_TOLERANCE au départage) et remontent ailleurs comme anomalies.
 *
 * LIMITE CONNUE, mesurée le 2026-09-12 : la détection ne suit PAS un vrai
 * changement de tarif tant que l'ancien reste majoritaire, et quand les deux
 * s'équilibrent elle tombe sur un diviseur commun (19 € puis 25 € à parts
 * égales → 5 €). Ce défaut est antérieur et n'a jamais été rencontré en
 * production ; le corriger suppose de raisonner sur la RÉCENCE des revenus, ce
 * qu'une simple fenêtre glissante ne suffit pas à faire (elle traverse la même
 * zone de diviseur commun). À reprendre le jour où le prix changera.
 * ------------------------------------------------------------------------ */

/** Part minimale des revenus devant s'expliquer par le tarif retenu (sinon null). */
const SUPPORT_MIN = 0.5

/** Tolérance au DÉPARTAGE : un candidat expliquant au moins cette part du
 *  meilleur score reste en lice, et c'est alors le plus GRAND qui gagne.
 *  Absorbe les journées atypiques (remise, geste commercial, avoir) sans
 *  lesquelles un tarif s'établirait à l'unité près — cf. l'incident du
 *  2026-09-12 documenté dans `detectUnitPrice`. */
const SUPPORT_TOLERANCE = 0.95

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

  // Le plus grand candidat dont le support est QUASI maximal.
  //
  // La comparaison était stricte (`m === maxMult`), et c'est ce qui a cassé le
  // 2026-09-12 : une SEULE journée Addon non multiple de 19 € (296,00 €, sur
  // 254 jours d'historique) a suffi à faire tomber le tarif PDJ de 19,00 € à
  // 1,00 €, divisant par 19 le CA affiché partout — board, PDF, analytique
  // annuelle et mensuelle, bande RepJour.
  //
  // Le mécanisme : 1,00 € divisait les 254 revenus (dont l'intrus), 19,00 € n'en
  // divisait plus que 253. Avec une égalité STRICTE, le score de 254 l'emportait,
  // et « le plus grand candidat » ne départageait plus rien puisqu'un seul
  // candidat atteignait ce maximum. Une exception commerciale sur une journée
  // suffisait donc à renverser un tarif établi sur huit mois.
  //
  // La tolérance rétablit l'intention d'origine : le tarif est le plus grand
  // montant qui explique la QUASI-TOTALITÉ des recettes, pas celui qui les
  // explique toutes à une unité près. 19,00 € (253/254) l'emporte de nouveau sur
  // 1,00 € (254/254), et tout diviseur plus petit (9,50 €, 4,75 €…) reste écarté
  // par la préférence au plus grand.
  const supportFloor = maxMult * SUPPORT_TOLERANCE
  let best = 0
  for (const [cand, m] of multOf) if (m >= supportFloor && cand > best) best = cand
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
