# Étape 4 — Brancher les consommateurs sur le registre (plus rien en dur)

## Objectif

Faire pointer tous les consommateurs de `budgetLabel`/`budgetHint`/`TAG_BY_CODE`/
`INDEX` vers la donnée dynamique, sans casser les usages **synchrones**. À la fin,
**aucune** référence à `BUDGET_LINES` en dur ne subsiste (hors registre alimenté par
la base).

## Contexte

Deux consommateurs sont **synchrones au niveau module** et exigent un traitement
particulier : `galaxy.ts` (`TAG_BY_CODE`) et `CodePicker.ts` (`INDEX`). Le reste
(`budgetLabel` dans le render) suit un simple changement de chemin d'import vers
`budgetRegistry.ts` (repli code géré par le registre).

## Fichier(s) impacté(s)

- `src/lib/facturation/galaxy.ts` (modif : `TAG_BY_CODE` module-level → dérivé d'un paramètre)
- `src/components/facturation/CodePicker.tsx` (modif : `INDEX` module-level → `useMemo` sur les lignes fetchées)
- `src/components/facturation/GalaxyChart.tsx` (modif : import `budgetHint` depuis `budgetRegistry`)
- `src/components/facturation/FacturationGalaxie.tsx` (modif : import `budgetLabel` + passe les lignes à `buildGalaxy`)
- `src/components/facturation/FacturationRevue.tsx` (modif : import `budgetLabel`)
- `src/components/facturation/InvoicePanel.tsx` (modif : import `budgetLabel`)

## Travail à réaliser

### 1. `galaxy.ts` — `TAG_BY_CODE` en paramètre (pas de global)

- Supprimer `const TAG_BY_CODE = new Map(BUDGET_LINES.map(...))` (module-level).
- `buildGalaxy(...)` reçoit les lignes (ou un résolveur) : ajouter un paramètre
  `lines: BudgetLine[] = []`, dériver `TAG_BY_CODE` **à l'intérieur**, et remplacer
  `budgetLabel(code)` par une lecture du registre (import `budgetRegistry`) ou par
  un résolveur passé. Recommandé : garder `budgetLabel` depuis `budgetRegistry`
  (déjà synchrone) et ne passer que `lines` pour `TAG_BY_CODE`.

```ts
export function buildGalaxy(
  pool: WordPool, issuers: Issuer[], topWordsPerCode = 12, minCount = 2,
  issuerCodes?: IssuerCodes, lines: BudgetLine[] = [],
): GalaxyGraph {
  const tagByCode = new Map(lines.map((l) => [l.code, l.tags[0] ?? '']))
  // … domain = tagByCode.get(code) || 'Autre' ; budgetLabel(code) via budgetRegistry …
}
```

- `FacturationGalaxie.tsx` : passe `budgetLines` (du hook) en 6e argument de `buildGalaxy`
  et ajoute `budgetLines` aux deps du `useMemo`.

### 2. `CodePicker.tsx` — `INDEX` réactif

- Supprimer le `const INDEX = BUDGET_LINES.map(...)` module-level.
- Recevoir les lignes (prop `lines` ou lues via le hook) et calculer l'index dans un
  `useMemo(() => lines.map(...), [lines])`. Le filtre de recherche et le groupage par
  `category` restent identiques.

### 3. Changements d'import (mécanique)

Remplacer, dans les consommateurs render, l'import :
`import { budgetLabel } from '#/lib/facturation/constants.ts'`
→ `import { budgetLabel } from '#/lib/facturation/budgetRegistry.ts'`
(idem `budgetHint` dans `GalaxyChart.tsx`).

Fichiers concernés (relevés) : `FacturationRevue.tsx` (~10 appels), `InvoicePanel.tsx`,
`FacturationGalaxie.tsx`, `GalaxyChart.tsx`.

### 4. Vérifier les dépendances de présentation non dérivées (couplage caché)

`galaxy.DOMAIN_ORDER` et `GalaxyChart.DOMAIN_HEX` (typé `Record<Tag, …>`) restent en
dur et **reflètent `TAGS`** — c'est voulu (D1). S'assurer qu'ils ne référencent pas
`BUDGET_LINES` et que `Tag` (donc `TAGS`) demeure la source du garde-fou d'exhaustivité.

## Ordre d'exécution

1. Paramétrer `buildGalaxy` (+ appel dans `FacturationGalaxie`).
2. Rendre `INDEX` réactif dans `CodePicker`.
3. Basculer les imports `budgetLabel`/`budgetHint` vers `budgetRegistry`.
4. `npx tsc --noEmit` → doit être **vert** (plus aucune référence à `BUDGET_LINES`).
5. Grep de contrôle : `BUDGET_LINES` ne doit apparaître que dans `types`/tests, plus
   dans le code applicatif.

## Critère de validation

- `npx tsc --noEmit` vert ; `grep -r BUDGET_LINES src` ne renvoie plus d'usage applicatif.
- La galaxie colore par domaine et affiche les libellés une fois la query résolue.
- Le `CodePicker` liste/recherche/groupe comme avant, à partir de la donnée fetchée.
