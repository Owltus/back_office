import { SEED_RULES } from '#/lib/facturation/constants.ts'
import { normalize } from '#/lib/facturation/text.ts'
import {
  abstains,
  preselect,
  scoreInvoice,
  type WordPool,
} from '#/lib/facturation/wordpool.ts'
import type {
  Detection,
  InvoiceHints,
  SupplierRule,
} from '#/lib/facturation/types.ts'

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
 * Quand une règle tranche (mot-clé précis), ses codes SEULS sont retenus (signal
 * fiable, non dilué par les nuages encore bruités). Sinon les nuages pilotent, mais
 * de façon PARCIMONIEUSE : le meilleur code, plus un 2e/3e seulement s'ils sont
 * comparables. « Souvent une seule imputation, parfois plusieurs. »
 */
export function detect(
  rawText: string,
  rules: SupplierRule[] = allRules(),
  pool?: WordPool,
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
  matches.sort((a, b) => b.score - a.score)
  const ruleCodes = [...new Set(matches.map((m) => m.rule.code))]
  const best = matches[0]

  // Couche 2 : nuages de mots (parcimonieux).
  const scored = pool ? scoreInvoice(rawText, pool) : []
  const scores = scored.slice(0, 5)

  if (best) {
    // Une règle tranche → ses codes SEULS (pas de dilution par les nuages).
    const base = best.rule.learned ? 0.75 : 0.6
    const confidence = Math.min(0.97, base + 0.12 * (best.score - 1))
    return {
      supplier: best.rule.supplier,
      code: best.rule.code,
      codes: ruleCodes,
      matchedKeyword: best.keyword,
      confidence,
      learned: !!best.rule.learned,
      hints,
      scores,
      abstained: false,
    }
  }

  // Aucune règle → les nuages pilotent (proba réelle, mots votants), parcimonieux.
  const top = scored[0]
  return {
    supplier: null,
    code: top?.code ?? null,
    codes: preselect(scored),
    matchedKeyword: top?.words[0] ?? null,
    confidence: top?.proba ?? 0,
    learned: false,
    hints,
    scores,
    abstained: abstains(scored),
  }
}
