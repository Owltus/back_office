import { SEED_RULES } from '#/lib/facturation/constants.ts'
import { normalize } from '#/lib/facturation/text.ts'
import {
  abstains,
  CLOUD_KEEP_RATIO,
  CLOUD_MAX,
  CLOUD_STRONG,
  maturity,
  preselect,
  scoreInvoice,
  type WordPool,
} from '#/lib/facturation/wordpool.ts'
import type {
  Detection,
  InvoiceHints,
  SupplierRule,
} from '#/lib/facturation/types.ts'

/**
 * Signal ÉMETTEUR pour l'attribution (filtre fort). `prior` = P(code | émetteur) issu du
 * modèle appris (issuerCodes.ts) ; `concentrated` = l'émetteur pointe nettement un code
 * (mûr + mono-code) et autorise donc un filtre DUR / une proposition même si les mots sont
 * muets. Fourni par l'appelant SEULEMENT si l'émetteur est assez mûr (sinon `undefined` →
 * aucun effet, l'attribution reste 100 % pilotée par les mots).
 */
export interface IssuerHint {
  prior: Record<string, number>
  concentrated: boolean
  /** Codes interdits pour cet émetteur (denylist) : retirés de tous les candidats. */
  deny?: Set<string>
}

/** Plancher du prior : un code non vu chez l'émetteur (prior 0) est moins favorisé, pas
 *  annulé — départage, pas exclusion (sauf émetteur concentré). Valeur de départ. */
const EPS_PRIOR = 0.15

/** Code(s) dominant(s) d'un prior émetteur (pour le cas « mots muets, émetteur fort »). */
function topPriorCodes(prior: Record<string, number>): string[] {
  const e = Object.entries(prior).sort((a, b) => b[1] - a[1])
  if (!e.length) return []
  const top = e[0][1]
  return e
    .filter(([, p]) => p >= top * CLOUD_KEEP_RATIO)
    .slice(0, CLOUD_MAX)
    .map(([c]) => c)
}

export { normalize }

/*
 * Détection SANS IA, en DEUX couches, toutes deux explicables :
 *  1. Matching déterministe de mots-clés (SEED_RULES) → couche prioritaire.
 *  2. Nuages de mots (wordpool) → vraie probabilité, multi-imputation, abstention.
 * Chaque suggestion reste traçable (règle+mot-clé, ou mots ayant voté). Plus de
 * persistance localStorage : l'apprentissage vit dans les nuages (Supabase).
 */

/** Règles de matching déterministe livrées (couche prioritaire). Plus de règles
 *  apprises en localStorage : l'apprentissage vit dans les nuages (Supabase). */
export function allRules(): SupplierRule[] {
  return SEED_RULES
}

/** Longueur minimale d'un nom d'émetteur normalisé pour être exploité — en deçà,
 *  le matching par sous-chaîne (« sa », « or ») ferait des faux positifs. */
export const MIN_LEARN_LEN = 4

/** Vrai si un nom d'émetteur est assez long pour servir de token fort. */
export const canLearn = (supplier: string): boolean =>
  normalize(supplier).trim().length >= MIN_LEARN_LEN

// --- Indices best-effort (montrés en aide, jamais critiques) --------------

const DATE_RE = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/
const INVOICE_RE =
  /facture\s*(?:n[°o]?|numero)?\s*[:#]?\s*([a-z0-9][a-z0-9\-\/]{2,})/i
const AMOUNT_RE = /(\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2}))\s*(?:€|eur|ttc)/gi

/** yyyy-mm-dd si une date jj/mm/aaaa est trouvée, sinon null. */
function extractDate(text: string): string | null {
  const m = DATE_RE.exec(text)
  if (!m) return null
  const [, d, mo, y] = m
  const year = y.length === 2 ? `20${y}` : y
  const dd = d.padStart(2, '0')
  const mm = mo.padStart(2, '0')
  if (Number(mm) > 12 || Number(dd) > 31) return null
  return `${year}-${mm}-${dd}`
}

/** Plus gros montant « … € / TTC » trouvé — heuristique du total. */
function extractAmount(text: string): string | null {
  let best: string | null = null
  let bestVal = -1
  for (const m of text.matchAll(AMOUNT_RE)) {
    const val = Number(m[1].replace(/[ .]/g, '').replace(',', '.'))
    if (Number.isFinite(val) && val > bestVal) {
      bestVal = val
      best = m[1]
    }
  }
  return best
}

function extractHints(rawText: string): InvoiceHints {
  const inv = INVOICE_RE.exec(rawText)
  return {
    date: extractDate(rawText),
    invoiceNumber: inv ? inv[1].toUpperCase() : null,
    amount: extractAmount(rawText),
  }
}

/**
 * Détecte les imputations en DEUX couches :
 *  1. Règles déterministes (mot-clé → code) : PRIORITAIRES, jamais diluées.
 *  2. Nuages de mots (si `pool` fourni) : vraie probabilité, codes supplémentaires
 *     au-dessus du seuil, mots ayant voté, et abstention si preuve mince.
 * Quand une règle tranche (mot-clé précis), ses codes priment — mais si les nuages sont
 * MÛRS et soutiennent FORTEMENT un autre code (proba ≥ CLOUD_STRONG), on le propose AUSSI
 * (une règle peut viser un code que le corps de la facture dément : mot-clé « martin » →
 * code A à 3 %, alors que le texte ressemble à B à 72 %). Les codes retenus sont ordonnés
 * par confiance, donc le plus probable remonte en tête. Sinon les nuages pilotent, de
 * façon PARCIMONIEUSE : le meilleur, plus un 2e/3e seulement s'ils sont comparables.
 */
export function detect(
  rawText: string,
  rules: SupplierRule[] = allRules(),
  pool?: WordPool,
  issuer?: IssuerHint,
): Detection {
  const text = normalize(rawText)
  const hints = extractHints(rawText)

  // Couche 1 : règles dont au moins un mot-clé apparaît, meilleur score d'abord.
  const matches: { rule: SupplierRule; score: number; keyword: string }[] = []
  for (const rule of rules) {
    let score = 0
    let firstHit: string | null = null
    for (const kw of rule.keywords) {
      if (kw && text.includes(kw)) {
        score++
        if (!firstHit) firstHit = kw
      }
    }
    if (score > 0 && firstHit) matches.push({ rule, score, keyword: firstHit })
  }
  // DENYLIST : « cet émetteur ne va JAMAIS sur ce code » → on retire les codes bannis de
  // TOUTES les sources (règles, nuages, prior), sinon une couche les ré-injecterait.
  const deny = issuer?.deny
  const allowed = (code: string): boolean => !deny?.has(code)

  matches.sort((a, b) => b.score - a.score)
  const ruleCodes = [...new Set(matches.map((m) => m.rule.code))].filter(
    allowed,
  )
  const best = matches.find((m) => allowed(m.rule.code)) // meilleure règle NON bannie

  // Couche 2 : nuages de mots (parcimonieux). L'abstention est jugée sur les MOTS SEULS
  // (cosinus), avant tout effet émetteur — on ne laisse pas le prior « inventer » un code.
  const scoredRaw = pool ? scoreInvoice(rawText, pool) : []
  const scored = deny ? scoredRaw.filter((s) => allowed(s.code)) : scoredRaw
  const wordsAbstain = abstains(scored)

  // FILTRE ÉMETTEUR : re-pondère la proba de chaque code par le prior P(code|émetteur)
  // (départage), puis re-trie. Un code non vu chez l'émetteur reste possible (plancher
  // EPS_PRIOR). Uniquement si un prior NON VIDE existe : un émetteur immature (prior {}, le
  // hint ne portant qu'une denylist) déflaterait sinon TOUTES les probas ×EPS_PRIOR de façon
  // uniforme — inoffensif pour le classement mais fatal au chemin `strong` (seuil CLOUD_STRONG
  // devenu inatteignable) et trompeur pour les confiances affichées. Le filtrage `deny` reste,
  // lui, appliqué en amont sur `scored`.
  const hasPrior = !!issuer && Object.keys(issuer.prior).length > 0
  const weighted = hasPrior
    ? scored
        .map((s) => ({
          ...s,
          proba: s.proba * (EPS_PRIOR + (issuer!.prior[s.code] ?? 0)),
        }))
        .sort((a, b) => b.proba - a.proba)
    : scored

  // `scores` (affichage) avec l'origine de chaque suggestion.
  const scores = weighted.slice(0, 5).map((s) => ({
    code: s.code,
    proba: s.proba,
    words: s.words,
    source: (issuer && (issuer.prior[s.code] ?? 0) > 0 ? 'issuer' : 'words') as
      'issuer' | 'words',
  }))

  if (best) {
    const base = best.rule.learned ? 0.75 : 0.6
    const confidence = Math.min(0.97, base + 0.12 * (best.score - 1))
    // Les nuages MÛRS (re-pondérés émetteur) peuvent corriger/compléter la règle.
    const mature = pool ? maturity(pool).level === 'ok' : false
    const strong = mature
      ? weighted
          .filter((s) => s.proba >= CLOUD_STRONG && !ruleCodes.includes(s.code))
          .map((s) => s.code)
      : []
    const confOf = (code: string): number =>
      weighted.find((s) => s.code === code)?.proba ?? confidence
    const codes = [...new Set([...ruleCodes, ...strong])]
      .sort((a, b) => confOf(b) - confOf(a))
      .slice(0, CLOUD_MAX)
    return {
      supplier: best.rule.supplier,
      code: best.rule.code,
      codes,
      matchedKeyword: best.keyword,
      confidence,
      learned: !!best.rule.learned,
      hints,
      scores,
      abstained: false,
    }
  }

  // Aucune règle → les nuages pilotent. Les MOTS priment : l'émetteur a déjà re-pondéré
  // `weighted` (départage), mais il ne FILTRE JAMAIS un code soutenu par les mots (pas de
  // filtre dur). Seule exception : mots muets → l'émetteur concentré propose son code, mais
  // marqué « à vérifier » (fromIssuerOnly), jamais comme une suggestion normale.
  const top = weighted[0]
  let codes: string[]
  let issuerOnly = false
  if (!wordsAbstain) {
    codes = preselect(weighted)
  } else if (issuer?.concentrated) {
    codes = topPriorCodes(issuer.prior).filter(allowed) // denylist respectée
    issuerOnly = codes.length > 0
  } else {
    codes = [] // abstention (comportement historique)
  }

  const abstained = wordsAbstain && codes.length === 0
  return {
    supplier: null,
    // `code` suit le 1er code RETENU (codes[0]) : dans le cas « mots muets + émetteur
    // concentré », `top` pointerait un code-mot pourtant rejeté, désaligné de `codes`.
    code: codes[0] ?? top?.code ?? null,
    codes,
    matchedKeyword: top?.words[0] ?? null,
    confidence: top?.proba ?? (codes[0] ? (issuer?.prior[codes[0]] ?? 0) : 0),
    learned: false,
    hints,
    scores,
    abstained,
    fromIssuerOnly: issuerOnly,
  }
}

/**
 * Re-score une facture DÉJÀ lue à partir de son texte, sans ré-extraire le PDF.
 * Sert à ré-imputer en séance les factures ouvertes quand le pool s'enrichit (après
 * le tamponnage d'une autre facture). On garde `rules = undefined` pour ne rien
 * changer au comportement de la couche 1.
 */
export function redetect(
  text: string,
  pool: WordPool,
  issuer?: IssuerHint,
): { detection: Detection; codes: string[] } {
  const detection = detect(text, undefined, pool, issuer)
  return { detection, codes: detection.codes }
}
