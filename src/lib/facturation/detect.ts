import { SEED_RULES } from '#/lib/facturation/constants.ts'
import type {
  Detection,
  InvoiceHints,
  SupplierRule,
} from '#/lib/facturation/types.ts'

/*
 * Détection SANS IA : matching déterministe de mots-clés fournisseur → code
 * comptable. Aucune magie — chaque suggestion est traçable à une règle et à un
 * mot-clé précis (explicable, auditable). Les règles « apprises » par
 * l'utilisateur sont persistées en `localStorage` : à la première rencontre d'un
 * fournisseur, l'humain assigne le code ; les fois suivantes, il est proposé seul.
 */

const LS_KEY = 'facturation:regles-apprises'

/** Minuscules + suppression des accents, pour un matching robuste. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\x00-\x7f]/g, '')
}

/** Règles apprises lues depuis `localStorage` (jamais d'exception propagée). */
export function loadLearnedRules(): SupplierRule[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SupplierRule[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Ensemble courant des règles : livrées + apprises. */
export function allRules(): SupplierRule[] {
  return [...SEED_RULES, ...loadLearnedRules()]
}

/**
 * Mémorise une correspondance fournisseur → code. Écrase toute règle apprise du
 * même fournisseur (normalisé) pour éviter les doublons. Retourne la liste à jour.
 */
export function rememberRule(supplier: string, code: string): SupplierRule[] {
  const key = normalize(supplier).trim()
  if (!key) return loadLearnedRules()
  const kept = loadLearnedRules().filter(
    (r) => normalize(r.supplier).trim() !== key,
  )
  const next: SupplierRule[] = [
    ...kept,
    {
      id: `learned:${key}`,
      supplier: supplier.trim(),
      code,
      keywords: [key],
      learned: true,
    },
  ]
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* quota / mode privé : on ignore, la règle vivra le temps de la session */
    }
  }
  return next
}

/** Oublie une règle apprise (par id). Retourne la liste à jour. */
export function forgetRule(id: string): SupplierRule[] {
  const next = loadLearnedRules().filter((r) => r.id !== id)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  return next
}

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
 * Détecte le fournisseur et le code comptable suggéré à partir du texte.
 * Score = nombre de mots-clés d'une règle présents dans le texte ; on retient la
 * règle au meilleur score. La confiance grimpe avec le nombre de mots-clés
 * confirmés et pour une règle apprise (correspondance déjà validée par l'humain).
 */
export function detect(
  rawText: string,
  rules: SupplierRule[] = allRules(),
): Detection {
  const text = normalize(rawText)
  const hints = extractHints(rawText)

  let bestRule: SupplierRule | null = null
  let bestScore = 0
  let bestKeyword: string | null = null

  for (const rule of rules) {
    let score = 0
    let firstHit: string | null = null
    for (const kw of rule.keywords) {
      if (kw && text.includes(kw)) {
        score++
        if (!firstHit) firstHit = kw
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestRule = rule
      bestKeyword = firstHit
    }
  }

  if (!bestRule) {
    return {
      supplier: null,
      code: null,
      matchedKeyword: null,
      confidence: 0,
      learned: false,
      hints,
    }
  }

  const base = bestRule.learned ? 0.75 : 0.6
  const confidence = Math.min(0.97, base + 0.12 * (bestScore - 1))
  return {
    supplier: bestRule.supplier,
    code: bestRule.code,
    matchedKeyword: bestKeyword,
    confidence,
    learned: !!bestRule.learned,
    hints,
  }
}
