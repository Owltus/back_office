import type { BudgetLine, CompteLine } from '#/lib/facturation/types.ts'

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
let COMPTE_LABEL = new Map<string, string>() // compte -> nom humain (dictionnaire)

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

/** Remplace le DICTIONNAIRE des comptes (compte → nom humain). Appelé par la query
 *  ['facturation','comptes'] au rendu, en miroir de setBudgetLines. */
export function setCompteLabels(rows: CompteLine[]): void {
  COMPTE_LABEL = new Map(rows.map((r) => [r.compte, r.libelle]))
}

/** Nom humain d'un compte (ex. '60710000' → 'Achats de denrées'), ou le NUMÉRO brut en repli
 *  si le compte n'est pas au dictionnaire (jamais vide). Accès synchrone (plein render). */
export const compteLabel = (compte: string): string =>
  COMPTE_LABEL.get(compte)?.trim() || compte

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

/** Codes retenus qui EXIGENT un compte (>= 2 comptes possibles au référentiel) mais dont
 *  aucun n'a été choisi (`comptes[code]` vide). Un code à 0 ou 1 compte n'est jamais
 *  « manquant » (rien à choisir). Pure ; le résolveur `comptesFor` est injectable pour les
 *  tests, et vaut `comptesForCode` (registre courant) par défaut. */
export function missingComptes(
  codes: string[],
  comptes: Record<string, string>,
  comptesFor: (code: string) => string[] = comptesForCode,
): string[] {
  return codes.filter((code) => {
    const chosen = (comptes[code] ?? '').trim()
    if (chosen) return false
    return comptesFor(code).length > 1
  })
}

/** Complète une table `code → compte` pour l'ensemble `codes` : conserve les choix déjà faits ;
 *  pour un code non encore résolu, prend le compte HABITUEL de l'émetteur (`preferred`, mémoire
 *  émetteur→compte) s'il est valide pour ce code, sinon le compte UNIQUE du code, sinon rien (à
 *  choisir) ; laisse tomber les codes absents de `codes` (table alignée sur la sélection). Pure ;
 *  utilisée à la détection (pré-remplissage) et au choix d'imputation. */
export function fillComptes(
  codes: string[],
  prev: Record<string, string> = {},
  preferred?: (code: string) => string,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const code of codes) {
    if (prev[code]) {
      next[code] = prev[code]
      continue
    }
    const list = comptesForCode(code)
    const pref = preferred?.(code) ?? ''
    if (pref && list.includes(pref)) next[code] = pref
    else next[code] = list.length === 1 ? list[0] : ''
  }
  return next
}
