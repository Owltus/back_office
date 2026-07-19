import type { BudgetLine } from '#/lib/facturation/types.ts'

/*
 * Registre du référentiel des imputations comptables — logique PURE (aucun React/DOM/Supabase).
 * La DONNÉE n'est plus en dur : elle vit dans Supabase (table facturation_budget_lines) et est
 * chargée par la query ['facturation','budgetLines'] (useFacturationModel), qui appelle
 * setBudgetLines(). Ce module garde des accès SYNCHRONES (budgetLabel/budgetHint/budgetTag) car
 * ils sont utilisés en plein render et au niveau module (galaxie, tooltips) où l'async n'a pas
 * sa place. Tant que rien n'est chargé (1er rendu / hors ligne / table absente), on REPLIE sur le
 * code brut — dégradation gracieuse, jamais d'exception.
 */

let LINES: BudgetLine[] = []
let LABEL = new Map<string, string>()
let HINT = new Map<string, string>()
let TAG = new Map<string, string>() // 1er tag (domaine) du code

/** Remplace en bloc le référentiel courant (appelé par la query). Reconstruit les index. */
export function setBudgetLines(lines: BudgetLine[]): void {
  LINES = lines
  LABEL = new Map(lines.map((l) => [l.code, l.label]))
  HINT = new Map(lines.map((l) => [l.code, l.hint ?? '']))
  TAG = new Map(lines.map((l) => [l.code, l.tags[0] ?? '']))
}

/** Le référentiel courant (ordre du plan). Vide tant que la query n'a pas résolu. */
export const allBudgetLines = (): BudgetLine[] => LINES

/** Libellé d'une imputation, ou le code brut si inconnu (repli). */
export const budgetLabel = (code: string): string => LABEL.get(code) ?? code

/** Description « en clair » d'une imputation (exemples concrets), ou '' si inconnue. */
export const budgetHint = (code: string): string => HINT.get(code) ?? ''

/** Domaine (1er tag) d'une imputation, ou '' si inconnu. */
export const budgetTag = (code: string): string => TAG.get(code) ?? ''
