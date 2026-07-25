import type { BudgetLine } from '#/lib/facturation/types.ts'

/*
 * Registre du référentiel des imputations comptables — logique PURE (aucun React/DOM/Supabase).
 * Une imputation = un COUPLE (code analytique + compte). Le CODE porte le libellé, la
 * section (category) et les tags (identiques sur tous ses comptes) ; le COMPTE est une
 * précision, avec sa propre description (hint). Le code reste l'unité PILOTE : le moteur
 * d'apprentissage (détection/nuages/émetteur) continue de raisonner par code, le compte
 * se choisit/s'apprend par-dessus.
 *
 * La donnée vit dans Supabase (table facturation_ref_imputations) et est chargée par la
 * query ['facturation','budgetLines'] (useFacturationModel) via setBudgetLines(). Ce module
 * garde des accès SYNCHRONES (budgetLabel/budgetTag/comptesForCode) car ils sont utilisés en
 * plein render et au niveau module (galaxie, tooltips). Tant que rien n'est chargé, on REPLIE
 * (repli gracieux, jamais d'exception).
 */

let LINES: BudgetLine[] = []
let LABEL = new Map<string, string>() // code -> libellé
let CATEGORY = new Map<string, string>() // code -> section comptable
let TAG = new Map<string, string>() // code -> 1er tag (domaine)
let COMPTES = new Map<string, string[]>() // code -> comptes (ordre du plan)
let HINT = new Map<string, string>() // "code|compte" -> description du couple

/** Clé canonique d'une imputation : `code|compte`. Source unique de l'encodage. */
export const imputationKey = (code: string, compte: string): string =>
  `${code}|${compte}`

/** Remplace en bloc le référentiel courant (appelé par la query). Reconstruit les index. */
export function setBudgetLines(lines: BudgetLine[]): void {
  LINES = lines
  LABEL = new Map()
  CATEGORY = new Map()
  TAG = new Map()
  COMPTES = new Map()
  HINT = new Map()
  for (const l of lines) {
    // libellé / section / tag : par CODE (1re occurrence fait foi, elles sont identiques).
    if (!LABEL.has(l.code)) {
      LABEL.set(l.code, l.label)
      CATEGORY.set(l.code, l.category)
      TAG.set(l.code, l.tags[0] ?? '')
    }
    // comptes : liste ordonnée et dédupliquée par code.
    const list = COMPTES.get(l.code) ?? []
    if (l.compte && !list.includes(l.compte)) list.push(l.compte)
    COMPTES.set(l.code, list)
    // description : par couple.
    HINT.set(imputationKey(l.code, l.compte), l.hint ?? '')
  }
}

/** Le référentiel courant (ordre du plan, une entrée par couple). Vide tant que non chargé. */
export const allBudgetLines = (): BudgetLine[] => LINES

/** Libellé d'un code (identique sur tous ses comptes), ou le code brut si inconnu (repli). */
export const budgetLabel = (code: string): string => LABEL.get(code) ?? code

/** Section comptable d'un code, ou '' si inconnue. */
export const budgetCategory = (code: string): string => CATEGORY.get(code) ?? ''

/** Domaine (1er tag) d'un code, ou '' si inconnu. */
export const budgetTag = (code: string): string => TAG.get(code) ?? ''

/** Comptes rattachés à un code (ordre du plan). Vide si code inconnu ou legacy sans compte. */
export const comptesForCode = (code: string): string[] => COMPTES.get(code) ?? []

/** Description « en clair » (exemples/fournisseurs) d'un couple. Sans `compte`, renvoie la
 *  1re description trouvée pour le code (repli des appels legacy « par code seul »). */
export const budgetHint = (code: string, compte = ''): string => {
  if (compte) return HINT.get(imputationKey(code, compte)) ?? ''
  for (const c of comptesForCode(code)) {
    const h = HINT.get(imputationKey(code, c))
    if (h) return h
  }
  return HINT.get(imputationKey(code, '')) ?? ''
}

/** Complète une table `code → compte` pour l'ensemble `codes` : conserve les choix déjà faits,
 *  pré-remplit le compte des codes qui n'en ont qu'UN (les autres restent vides, à choisir), et
 *  laisse tomber les codes absents de `codes` (table toujours alignée sur la sélection). Pure ;
 *  utilisée à la détection (pré-remplissage) et au choix d'imputation. */
export function fillComptes(
  codes: string[],
  prev: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const code of codes) {
    if (prev[code]) {
      next[code] = prev[code]
      continue
    }
    const list = comptesForCode(code)
    next[code] = list.length === 1 ? list[0] : ''
  }
  return next
}
