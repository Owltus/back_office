import { normalize } from '#/lib/facturation/text.ts'
import { BUDGET_LINES, SEED_RULES } from '#/lib/facturation/constants.ts'

/*
 * Nuages de mots pour l'imputation comptable — logique PURE (aucun React/DOM/
 * Supabase), testable en Node. Chaque code d'imputation a un sac de mots
 * (fréquences). Les poids sont 100 % AUTOMATIQUES (IDF au niveau des codes : un
 * mot répandu partout vaut ~0, un mot rare et concentré vaut fort). Le scoring
 * TF-IDF/cosinus produit une vraie probabilité ; on s'abstient si la preuve est
 * mince. Sans IA / sans embeddings — que de la statistique de fréquences.
 */

export interface WordPool {
  perCode: Record<string, Record<string, number>> // code → { token: count }
}

export interface Scored {
  code: string
  proba: number // softmax des scores (affichage), somme ≈ 1 sur les candidats
  score: number // cosinus brut (présélection / abstention)
  words: string[] // mots ayant le plus contribué (explicabilité)
}

// Mots vides FR + termes de facture ubiquitaires (aucun pouvoir discriminant).
const STOPWORDS = new Set([
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
  'okko',
  'nantes', // nom + ville de l'hôtel : présents sur toutes les factures
])

/** Plafond de tokens conservés par code (bornage — voir aussi l'élagage SQL). */
export const STORAGE_TOP_K = 300
/** Cosinus minimal pour proposer un code (sinon abstention). */
export const CLOUD_MIN = 0.15
/** Un 2e/3e code n'est pré-sélectionné que si son score atteint cette fraction du
 *  MEILLEUR — sinon une seule imputation. « Souvent un, parfois plusieurs. » */
export const CLOUD_KEEP_RATIO = 0.75
/** Nombre maximal de codes pré-sélectionnés (borne dure). */
export const CLOUD_MAX = 3
const BM25_K = 1.5
const SEED_WEIGHT = 4 // mot-clé livré : graine forte (survit au filtre hapax)
const HINT_WEIGHT = 2 // mot d'un `hint` : graine plus faible

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

interface Stats {
  N: number
  df: Record<string, number> // nb de codes contenant le token
  cf: Record<string, number> // fréquence globale (anti-hapax)
  codes: string[]
}

function computeStats(pool: WordPool): Stats {
  const codes = Object.keys(pool.perCode)
  const df: Record<string, number> = {}
  const cf: Record<string, number> = {}
  for (const c of codes)
    for (const [t, n] of Object.entries(pool.perCode[c])) {
      df[t] = (df[t] ?? 0) + 1
      cf[t] = (cf[t] ?? 0) + n
    }
  return { N: codes.length, df, cf, codes }
}

/** Poids automatique : mot présent partout → 0 ; rare+concentré → fort ; vu une
 *  seule fois (cf < 2) → 0 (bruit ignoré). */
function idf(t: string, s: Stats): number {
  if ((s.cf[t] ?? 0) < 2) return 0
  const df = s.df[t] ?? s.N
  return Math.log(s.N / df)
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
    const w = satTf(n) * idf(t, s)
    if (w > 0) v[t] = w
  }
  return v
}

/**
 * Score une facture contre tous les codes : cosinus TF-IDF entre la facture et
 * chaque nuage. Retourne les codes triés par score, avec proba (softmax) et les
 * mots qui ont le plus voté. Liste vide si rien d'informatif (→ abstention).
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
    const words = contrib
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map((x) => x[0])
    scored.push({ code: c, score: dot / (qn * vn), proba: 0, words })
  }

  softmaxInto(scored)
  return scored.sort((a, b) => b.score - a.score)
}

/** Renseigne `proba` = softmax des scores (température basse → écarts marqués). */
function softmaxInto(scored: Scored[]): void {
  if (scored.length === 0) return
  const T = 0.15
  const max = Math.max(...scored.map((x) => x.score))
  let sum = 0
  const exps = scored.map((x) => {
    const e = Math.exp((x.score - max) / T)
    sum += e
    return e
  })
  scored.forEach((x, i) => {
    x.proba = sum > 0 ? exps[i] / sum : 0
  })
}

/** Codes à pré-sélectionner : le MEILLEUR (s'il dépasse le seuil), plus les
 *  suivants seulement s'ils sont PROCHES du meilleur (≥ CLOUD_KEEP_RATIO × top).
 *  Un vainqueur net → un seul code ; deux comparables → deux. Borné à CLOUD_MAX. */
export function preselect(scored: Scored[]): string[] {
  if (scored.length === 0 || scored[0].score < CLOUD_MIN) return []
  const top = scored[0].score
  return scored
    .filter((x) => x.score >= top * CLOUD_KEEP_RATIO)
    .slice(0, CLOUD_MAX)
    .map((x) => x.code)
}

/** Vrai si la preuve est trop mince pour trancher (à imputer à la main). */
export function abstains(scored: Scored[]): boolean {
  return scored.length === 0 || scored[0].score < CLOUD_MIN
}

/** Compte les tokens d'une facture (pour l'apprentissage delta). */
export function countTokens(rawText: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of tokenize(rawText)) out[t] = (out[t] ?? 0) + 1
  return out
}

/** Ajoute des tokens forts (ex. nom d'émetteur) à un delta d'apprentissage. */
export function addStrong(
  deltas: Record<string, number>,
  tokens: string[],
  weight: number,
): void {
  for (const t of tokens) deltas[t] = (deltas[t] ?? 0) + weight
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
 * Pool de départ (amorçage à froid), TOUJOURS disponible côté client : mots-clés
 * des SEED_RULES (poids fort) + `hint` et `label` des BUDGET_LINES (poids faible).
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
  for (const l of BUDGET_LINES) {
    if (l.hint) add(l.code, l.hint, HINT_WEIGHT)
    add(l.code, l.label, HINT_WEIGHT)
  }
  return { perCode }
}
