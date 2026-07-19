import { normalize } from '#/lib/facturation/text.ts'
import { SEED_RULES } from '#/lib/facturation/constants.ts'

/*
 * Nuages de mots pour l'imputation comptable — logique PURE (aucun React/DOM/
 * Supabase), testable en Node. Chaque code d'imputation a un sac de mots
 * (fréquences). Les poids sont 100 % AUTOMATIQUES et APPRIS DES DONNÉES : le
 * « poids de discriminance » (disc) mesure à quel point un mot est CONCENTRÉ sur
 * une imputation plutôt qu'étalé sur toutes (idf normalisé au nombre de codes).
 * Un mot répandu partout tombe au PLANCHER (jamais 0 : « filtrer, pas ignorer »),
 * un mot concentré vaut ~1. Le scoring TF-IDF/cosinus produit une vraie
 * probabilité ; on s'abstient si la preuve est mince. Sans IA / sans embeddings —
 * que de la statistique de fréquences, comparée d'une imputation à l'autre.
 */

export interface WordPool {
  perCode: Record<string, Record<string, number>> // code → { token: count }
}

export interface Scored {
  code: string
  proba: number // confiance ABSOLUE 0..1 (force × corroboration) — tri, présélection, AFFICHAGE
  score: number // cosinus brut (résemblance) — sert UNIQUEMENT à la porte d'abstention
  words: string[] // mots ayant le plus contribué (explicabilité)
}

// Amorçage « à froid » — liste VOLONTAIREMENT TRÈS COURTE : uniquement la grammaire FR, le
// squelette universel d'une facture et l'identité de l'hôtel — des mots sans AUCUN pouvoir
// discriminant quel que soit le fournisseur. Tout le RESTE (paiement, mentions légales, adresse,
// nom du fournisseur, du client…) n'est PLUS listé en dur : c'est le poids de discriminance appris
// (disc, cf. computeStats) qui le dévalue tout seul à partir des données, à mesure que la base
// grandit. On n'efface donc qu'un socle minimal ; on ne « décide » plus du bruit à la main.
const STOPWORDS = new Set([
  // Squelette universel d'une facture (jamais discriminant)
  'facture',
  'total',
  'ttc',
  'ht',
  'tva',
  'montant',
  'date',
  'numero',
  'num',
  'commande',
  'client',
  'reference',
  'ref',
  'quantite',
  'prix',
  'unitaire',
  'net',
  'brut',
  'remise',
  'euro',
  'euros',
  'page',
  'code',
  'article',
  // Grammaire FR (mots vides)
  'de',
  'des',
  'du',
  'la',
  'le',
  'les',
  'un',
  'une',
  'et',
  'ou',
  'en',
  'au',
  'aux',
  'pour',
  'par',
  'sur',
  'avec',
  'sans',
  'sous',
  'dans',
  'chez',
  'vers',
  'nos',
  'vos',
  'votre',
  'notre',
  'ce',
  'cette',
  'ces',
  'son',
  'sa',
  'ses',
  'leur',
  'leurs',
  'que',
  'qui',
  'est',
  'sont',
  'plus',
  'moins',
  // Identité de l'hôtel : sur TOUTES les factures, jamais discriminant
  'okko',
  'nantes',
])

/** Plafond de tokens conservés par code (bornage — voir aussi l'élagage SQL). */
export const STORAGE_TOP_K = 300
/** Cosinus minimal pour proposer un code (sinon abstention). */
export const CLOUD_MIN = 0.15
/** Un 2e/3e code n'est pré-sélectionné que si sa PROBA atteint cette fraction du
 *  MEILLEUR — sinon une seule imputation. « Souvent un, parfois plusieurs. » */
export const CLOUD_KEEP_RATIO = 0.75
/** Nombre maximal de codes pré-sélectionnés (borne dure). */
export const CLOUD_MAX = 3
/** Proba au-delà de laquelle un nuage est jugé FORT : assez fiable pour être proposé
 *  même quand une règle (couche 1) tranche sur un autre code. Aligné sur le palier
 *  « fiable » (vert) de l'affichage → « ce que l'UI colorerait en vert compte ». */
export const CLOUD_STRONG = 0.5
const BM25_K = 1.5
/** PLANCHER du poids de discriminance : un mot totalement transverse (présent dans TOUTES les
 *  imputations) ne vaut PAS 0 mais ce plancher — il pèse peu, mais n'est jamais effacé. Incarne
 *  le choix « réduire le poids, jamais ignorer ». Réglable à l'usage. */
export const DISC_FLOOR = 0.12
/** Corroboration : `n / (n + K)` mots votants. 1 mot → 0,25 ; 3 → 0,5 ; 9 → 0,75. */
const EVIDENCE_K = 3
const SEED_WEIGHT = 4 // mot-clé livré : graine forte (survit au filtre hapax)

/** Seuils de MATURITÉ du modèle APPRIS (serveur, hors graine). En dessous, la base
 *  manque de références fiables et le système ne doit pas se prononcer avec assurance.
 *  Heuristiques (pas un nombre de factures) à ajuster à l'usage. */
export const MATURITY_MIN_CODES = 3 // codes non vides pour sortir de « vide »
export const MATURITY_OK_TOKENS = 60 // volume de tokens appris pour être « ok »

export interface Maturity {
  codes: number // nb de codes alimentés dans l'appris serveur
  tokens: number // somme des count appris
  level: 'vide' | 'faible' | 'ok'
}

/**
 * Mesure heuristique de la richesse de l'appris SERVEUR (pas la graine) : plus il y a
 * de codes alimentés et de tokens, plus les suggestions sont fiables. Sert à afficher
 * un avertissement et à tempérer la confiance affichée quand la base est immature.
 */
export function maturity(serverPool: WordPool): Maturity {
  let codes = 0
  let tokens = 0
  for (const cell of Object.values(serverPool.perCode)) {
    const counts = Object.values(cell)
    if (counts.length === 0) continue
    codes++
    for (const n of counts) tokens += n
  }
  const level: Maturity['level'] =
    tokens === 0
      ? 'vide'
      : codes < MATURITY_MIN_CODES || tokens < MATURITY_OK_TOKENS
        ? 'faible'
        : 'ok'
  return { codes, tokens, level }
}

/** Saturation du TF (BM25) : 100 factures identiques ne noient pas un code. */
const satTf = (tf: number) => (tf * (BM25_K + 1)) / (tf + BM25_K)

/**
 * normalize → découpe en mots → hygiène : longueur 3–24, PAS de chiffre (écarte
 * dates, montants, n° de facture, réfs = source principale de bruit), hors mots
 * vides. C'est ce filtre qui garde le vocabulaire propre à grande échelle.
 */
export function tokenize(rawText: string): string[] {
  return normalize(rawText)
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= 3 && t.length <= 24 && !/\d/.test(t) && !STOPWORDS.has(t),
    )
}

export interface Stats {
  N: number
  cf: Record<string, number> // fréquence globale (anti-hapax)
  disc: Record<string, number> // poids de discriminance ∈ [DISC_FLOOR, 1], appris inter-codes
  codes: string[]
}

/**
 * Statistiques du pool : fréquence globale (cf) et surtout le POIDS DE DISCRIMINANCE (disc) de
 * chaque token, appris de sa répartition d'une imputation à l'autre — le cœur du « comparer les
 * pools d'une imputation à l'autre ». concentration = log(N/df)/log(N) ∈ [0,1] : 1 = le token
 * n'apparaît que dans UN code (signal fort), 0 = il est dans TOUS (transverse : adresse, paiement,
 * mentions…). disc = DISC_FLOOR + (1-DISC_FLOOR)·concentration → jamais 0. Avec un seul code (N≤1)
 * aucune discrimination possible → disc = 1 partout.
 */
export function computeStats(pool: WordPool): Stats {
  const codes = Object.keys(pool.perCode)
  const N = codes.length
  const df: Record<string, number> = {}
  const cf: Record<string, number> = {}
  for (const c of codes)
    for (const [t, n] of Object.entries(pool.perCode[c])) {
      df[t] = (df[t] ?? 0) + 1
      cf[t] = (cf[t] ?? 0) + n
    }
  const disc: Record<string, number> = {}
  const lnN = N > 1 ? Math.log(N) : 0
  for (const [t, d] of Object.entries(df)) {
    const conc = lnN > 0 ? Math.min(1, Math.max(0, Math.log(N / d) / lnN)) : 1
    disc[t] = DISC_FLOOR + (1 - DISC_FLOOR) * conc
  }
  return { N, cf, disc, codes }
}

/** Poids d'un token au scoring = sa DISCRIMINANCE apprise (disc). SEUL effacement : l'hapax global
 *  (cf < 2 = vu une unique fois dans TOUTE la base → bruit OCR/typo, jamais un signal) ne vote pas.
 *  Aucun autre poids nul : un mot transverse pèse le PLANCHER, il n'est pas ignoré. */
function tokenWeight(t: string, s: Stats): number {
  if ((s.cf[t] ?? 0) < 2) return 0
  return s.disc[t] ?? DISC_FLOOR
}

function l2(vec: Record<string, number>): number {
  let sum = 0
  for (const v of Object.values(vec)) sum += v * v
  return Math.sqrt(sum)
}

/** Vecteur TF-IDF (avec saturation TF) d'un sac de tokens comptés. */
function vectorize(
  counts: Record<string, number>,
  s: Stats,
): Record<string, number> {
  const v: Record<string, number> = {}
  for (const [t, n] of Object.entries(counts)) {
    const w = satTf(n) * tokenWeight(t, s)
    if (w > 0) v[t] = w
  }
  return v
}

/**
 * Score une facture contre tous les codes : cosinus TF-IDF entre la facture et
 * chaque nuage. Retourne les codes triés par PROBA (la confiance réellement affichée
 * = force × corroboration), avec les mots ayant le plus voté. Trier par proba plutôt
 * que par cosinus brut évite l'incohérence « le système propose en tête un code à 3 %
 * (cosinus élevé mais un seul mot votant) alors qu'un code à 72 % existe » : le tri et
 * l'affichage parlent enfin de la même chose. Liste vide si rien d'informatif.
 */
export function scoreInvoice(rawText: string, pool: WordPool): Scored[] {
  const s = computeStats(pool)
  if (s.N === 0) return []

  const tf: Record<string, number> = {}
  for (const t of tokenize(rawText)) tf[t] = (tf[t] ?? 0) + 1
  const q = vectorize(tf, s)
  const qn = l2(q)
  if (qn === 0) return []

  const scored: Scored[] = []
  for (const c of s.codes) {
    const v = vectorize(pool.perCode[c], s)
    const vn = l2(v)
    if (vn === 0) continue
    let dot = 0
    const contrib: Array<[string, number]> = []
    for (const [t, qv] of Object.entries(q)) {
      const cv = v[t]
      if (cv) {
        const part = qv * cv
        dot += part
        contrib.push([t, part])
      }
    }
    if (dot <= 0) continue
    const cos = dot / (qn * vn)
    const words = contrib
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map((x) => x[0])
    // Confiance HONNÊTE et ABSOLUE : force du match (cosinus) × corroboration
    // (combien de mots ont voté). Peu de mots OU match faible → % bas. Jamais
    // gonflé par une normalisation relative — « ne pas savoir est une donnée ».
    const evidence = contrib.length / (contrib.length + EVIDENCE_K)
    scored.push({ code: c, score: cos, proba: cos * evidence, words })
  }

  return scored.sort((a, b) => b.proba - a.proba)
}

/** Meilleur cosinus (résemblance géométrique) parmi les scores. Distinct de la proba :
 *  répond à « la facture ressemble-t-elle à UN nuage ? » (existence), pas « lequel et
 *  avec quelle confiance ? ». Sert la porte d'abstention. Les scores étant triés par
 *  proba, on ne peut plus lire scored[0].score → on prend le max explicite. */
function bestCosine(scored: Scored[]): number {
  let m = 0
  for (const s of scored) if (s.score > m) m = s.score
  return m
}

/** Codes à pré-sélectionner : le plus PROBABLE (s'il y a de quoi trancher), plus les
 *  suivants seulement si leur proba est PROCHE du meilleur (≥ CLOUD_KEEP_RATIO × top).
 *  Un vainqueur net → un seul code ; deux comparables → deux. Borné à CLOUD_MAX. */
export function preselect(scored: Scored[]): string[] {
  if (abstains(scored)) return []
  const top = scored[0].proba
  return scored
    .filter((x) => x.proba >= top * CLOUD_KEEP_RATIO)
    .slice(0, CLOUD_MAX)
    .map((x) => x.code)
}

/** Vrai si la preuve est trop mince pour trancher (à imputer à la main) : aucun nuage
 *  ne RESSEMBLE assez à la facture (meilleur cosinus < CLOUD_MIN). Gardé sur le cosinus
 *  (et non la proba, toujours ≤ cosinus) pour ne pas sur-abstenir sur un match d'un
 *  seul mot fort — la corroboration se reflète ensuite dans le % affiché, pas ici. */
export function abstains(scored: Scored[]): boolean {
  return scored.length === 0 || bestCosine(scored) < CLOUD_MIN
}

/** Compte les tokens d'une facture (pour l'apprentissage delta). */
export function countTokens(rawText: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of tokenize(rawText)) out[t] = (out[t] ?? 0) + 1
  return out
}

export interface RankedWord {
  token: string
  count: number
  /** Pouvoir votant RÉEL = satTf(count) × discriminance. 0 = hapax (bruit) ; faible = transverse
   *  (adresse, paiement…) ; fort = discriminant. Sert à la fois à trier l'affichage et il reflète
   *  EXACTEMENT ce qui pèse au scoring. */
  weight: number
}

/**
 * Mots d'un code CLASSÉS par pouvoir discriminant réel (fort d'abord). RIEN n'est masqué : un mot
 * transverse descend et pèse le plancher, il n'est jamais retiré. Le poids se JUGE sur TOUT le pool
 * (`stats = computeStats(pool)`), donc en comparant les imputations entre elles — pas sur la seule
 * cellule. Source UNIQUE partagée par l'affichage (galaxie, revue) et fidèle au scoring.
 */
export function rankWords(
  cell: Record<string, number>,
  stats: Stats,
): RankedWord[] {
  return Object.entries(cell)
    .map(([token, count]) => ({
      token,
      count,
      weight: satTf(count) * tokenWeight(token, stats),
    }))
    .sort((a, b) => b.weight - a.weight || b.count - a.count)
}

/** Cosinus minimal entre deux nuages de codes pour les juger CONFUSABLES (candidats à la
 *  revue). À affiner : sous TF-IDF, deux codes très proches plafonnent car les tokens
 *  partagés voient leur idf baisser. */
export const CONFUSABLE_MIN = 0.6

export interface CodePair {
  a: string
  b: string
  cosine: number
}

/** Cosinus TF-IDF entre les nuages de deux codes (même métrique que le scoring, mais
 *  nuage-vs-nuage). 0 si l'un est vide. */
export function codeCosine(pool: WordPool, a: string, b: string): number {
  const s = computeStats(pool)
  const va = vectorize(pool.perCode[a] ?? {}, s)
  const vb = vectorize(pool.perCode[b] ?? {}, s)
  const na = l2(va)
  const nb = l2(vb)
  if (na === 0 || nb === 0) return 0
  let dot = 0
  for (const [t, x] of Object.entries(va)) {
    const y = vb[t]
    if (y) dot += x * y
  }
  return dot / (na * nb)
}

/** Paires de codes dont le cosinus ≥ `minCosine`, triées décroissant — « codes qui se
 *  ressemblent trop » (à inspecter). Un seul `computeStats` partagé. */
export function confusableCodes(
  pool: WordPool,
  minCosine = CONFUSABLE_MIN,
): CodePair[] {
  const s = computeStats(pool)
  const codes = s.codes
  const vecs = new Map(codes.map((c) => [c, vectorize(pool.perCode[c], s)]))
  const norms = new Map(codes.map((c) => [c, l2(vecs.get(c)!)]))
  const out: CodePair[] = []
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = codes[i]
      const b = codes[j]
      const na = norms.get(a)!
      const nb = norms.get(b)!
      if (na === 0 || nb === 0) continue
      const va = vecs.get(a)!
      const vb = vecs.get(b)!
      let dot = 0
      for (const [t, x] of Object.entries(va)) {
        const y = vb[t]
        if (y) dot += x * y
      }
      const cosine = dot / (na * nb)
      if (cosine >= minCosine) out.push({ a, b, cosine })
    }
  }
  return out.sort((x, y) => y.cosine - x.cosine)
}

/** Fusionne deux pools (somme des comptes) — graine + serveur. */
export function mergePools(a: WordPool, b: WordPool): WordPool {
  const perCode: WordPool['perCode'] = {}
  for (const src of [a, b])
    for (const [c, cell] of Object.entries(src.perCode)) {
      const dst = (perCode[c] ??= {})
      for (const [t, n] of Object.entries(cell)) dst[t] = (dst[t] ?? 0) + n
    }
  return { perCode }
}

/**
 * Pool de départ (amorçage à froid), TOUJOURS disponible côté client : UNIQUEMENT les
 * mots-clés des SEED_RULES (noms de FOURNISSEURS spécifiques : booking, mazars, adyen…).
 * On n'amorce PLUS le pull avec le `hint`/`label` des BUDGET_LINES : ce sont les intitulés
 * des imputations, et laisser le libellé « Gaz » injecter « gaz » dans le nuage ferait
 * imputer par le NOM de la ligne au lieu de l'ÉDUCATION (contexte réel appris). Les
 * hint/label restent utilisés pour la RECHERCHE du modal (CodePicker), pas l'attribution.
 * Fusionné avec le pool serveur au chargement.
 */
export function seedPool(): WordPool {
  const perCode: WordPool['perCode'] = {}
  const add = (code: string, text: string, weight: number) => {
    const cell = (perCode[code] ??= {})
    for (const t of tokenize(text)) cell[t] = (cell[t] ?? 0) + weight
  }
  for (const r of SEED_RULES)
    for (const kw of r.keywords) add(r.code, kw, SEED_WEIGHT)
  return { perCode }
}
