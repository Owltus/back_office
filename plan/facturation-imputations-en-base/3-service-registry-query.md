# Étape 3 — Service Supabase + registre dynamique + query (retrait du hardcode)

## Objectif

Lire le référentiel depuis Supabase et le rendre disponible **de façon synchrone**
à tout le code (helpers `budgetLabel`/`budgetHint`/`budgetTag`), via un **registre
en mémoire** peuplé par une query TanStack. Retirer `BUDGET_LINES` (et les helpers
associés) du hardcode de `constants.ts`. C'est le cœur de la migration (D4).

## Contexte

`budgetLabel`/`budgetHint` sont appelés **en plein render** et au **niveau module**
(libs pures) → ils doivent rester **synchrones**. Solution retenue (D4, option A) :
un registre module-level peuplé une fois par la query, avec **repli sur le code
brut** tant que rien n'est chargé. `SEED_RULES` et `TAGS` **restent dans
`constants.ts`** (D1).

## Fichier(s) impacté(s)

- `src/lib/facturation/budgetRegistry.ts` (nouveau, pur)
- `src/lib/facturation/constants.ts` (modif : retire `BUDGET_LINES`, `LABEL_BY_CODE`, `HINT_BY_CODE`, `budgetLabel`, `budgetHint` ; garde `TAGS`, `SEED_RULES`, consts OCR)
- `src/lib/facturation/cloudService.ts` (modif : `fetchBudgetLines`, `upsertBudgetLine`, `deleteBudgetLine`)
- `src/components/facturation/useFacturationModel.ts` (modif : 6e query + peuplement du registre)

## Travail à réaliser

### 1. `budgetRegistry.ts` — registre dynamique (pur)

```ts
import type { BudgetLine } from '#/lib/facturation/types.ts'

// Référentiel courant, remplacé en bloc par la query (setBudgetLines). Lecture SYNCHRONE
// partout ; repli sur le code brut tant que rien n'est chargé (1er rendu / hors ligne).
let LINES: BudgetLine[] = []
let LABEL = new Map<string, string>()
let HINT = new Map<string, string>()
let TAG = new Map<string, string>() // 1er tag (domaine) du code

export function setBudgetLines(lines: BudgetLine[]): void {
  LINES = lines
  LABEL = new Map(lines.map((l) => [l.code, l.label]))
  HINT = new Map(lines.map((l) => [l.code, l.hint ?? '']))
  TAG = new Map(lines.map((l) => [l.code, l.tags[0] ?? '']))
}

export const allBudgetLines = (): BudgetLine[] => LINES
export const budgetLabel = (code: string): string => LABEL.get(code) ?? code
export const budgetHint = (code: string): string => HINT.get(code) ?? ''
export const budgetTag = (code: string): string => TAG.get(code) ?? ''
```

### 2. `constants.ts` — retrait du référentiel

- Supprimer `BUDGET_LINES`, `LABEL_BY_CODE`, `HINT_BY_CODE`, `budgetLabel`, `budgetHint`.
- **Conserver** `TAGS`/`Tag`, `SEED_RULES`, `OCR_CHAR_THRESHOLD`, `PREVIEW_RASTER_SCALE`.
- Les imports `budgetLabel`/`budgetHint` de tous les consommateurs basculent vers
  `#/lib/facturation/budgetRegistry.ts` (traité en étape 4).

### 3. `cloudService.ts` — lecture + écritures RPC

```ts
const BUDGET_TABLE = 'facturation_budget_lines'

export async function fetchBudgetLines(): Promise<BudgetLine[]> {
  const { data, error } = await supabase
    .from(BUDGET_TABLE)
    .select('code,label,category,hint,tags')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, hint: r.hint ?? '', tags: r.tags ?? [] }))
}

export async function upsertBudgetLine(l: BudgetLine, sort?: number): Promise<void> {
  const { error } = await supabase.rpc('facturation_budget_line_upsert', {
    p_code: l.code, p_label: l.label, p_category: l.category,
    p_hint: l.hint ?? '', p_tags: l.tags, p_sort: sort ?? null,
  })
  if (error) throw error
}

export async function deleteBudgetLine(code: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_budget_line_delete', { p_code: code })
  if (error) throw error // ex. 23503 « deja utilisee » → remonté à l'appelant
}
```

### 4. `useFacturationModel.ts` — 6e query + peuplement du registre

```ts
const { data: budgetLines } = useQuery({
  queryKey: ['facturation', 'budgetLines'],
  queryFn: fetchBudgetLines,
  retry: false,
})
// Peuple le registre AU RENDU (idempotent, pas d'état) → budgetLabel/budgetHint synchrones
// voient la donnée dès que le cache la fournit, avant les useMemo enfants.
setBudgetLines(budgetLines ?? [])
```

- Ajouter `budgetLines: budgetLines ?? []` au retour du hook (pour les composants qui
  veulent la liste, ex. `CodePicker`, le manager).

## Ordre d'exécution

1. Créer `budgetRegistry.ts`.
2. Retirer le référentiel de `constants.ts`.
3. Ajouter `fetchBudgetLines`/`upsertBudgetLine`/`deleteBudgetLine` à `cloudService.ts`.
4. Câbler la query + `setBudgetLines` dans `useFacturationModel.ts`.
5. `npx tsc --noEmit` (les erreurs d'import restantes seront résolues en étape 4).

## Critère de validation

- `budgetRegistry` compile en module pur (aucun import React/Supabase).
- Avec la table peuplée, `budgetLabel('FMELECoooo')` renvoie `'Electricité'` après
  chargement ; avant chargement, renvoie `'FMELECoooo'` (repli assumé).
- `constants.ts` ne contient plus `BUDGET_LINES` ni `budgetLabel`/`budgetHint`.
