# Étape 5 — Modal « Gérer les imputations » (créer / éditer / supprimer)

## Objectif

Offrir le CRUD complet du référentiel depuis l'atelier facturation : ajouter une
imputation, éditer `label`/`category`/`hint`/`tags` (code **immuable**), et supprimer
— avec **suppression bloquée si l'imputation est déjà utilisée**, feedback clair.

## Contexte

Gabarit : `RevueDialog` (lignes + `busy`/`erreur` par ligne + `useConfirm`) et
`ComptesBoard` (formulaire création/édition Dialog). Le calcul « déjà utilisée » se
fait **côté client** à partir du cache (`useFacturationModel`) pour désactiver le
bouton **avant** le clic ; la RPC reste le garde-fou serveur. D6 : modal **dédié**,
distinct du `CodePicker`. Admin-only (hérité de la route `/facturation`).

## Fichier(s) impacté(s)

- `src/components/facturation/useBudgetLinesCuration.ts` (nouveau : mutations + invalidation)
- `src/components/facturation/BudgetLinesManager.tsx` (nouveau : le modal)
- `src/components/facturation/CodePicker.tsx` (modif : bouton « Gérer les imputations » qui ouvre le manager)
- `src/components/facturation/InvoicePanel.tsx` (modif éventuelle : point d'ouverture)

## Travail à réaliser

### 1. `useBudgetLinesCuration.ts` — mutations + invalidation

```ts
export function useBudgetLinesCuration() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['facturation', 'budgetLines'] })
  return {
    saveLine: async (l: BudgetLine, sort?: number) => { await upsertBudgetLine(l, sort); await invalidate() },
    removeLine: async (code: string) => { await deleteBudgetLine(code); await invalidate() },
  }
}
```

### 2. Calcul « déjà utilisée » (côté client, pour désactiver le bouton)

À partir du cache déjà chargé par `useFacturationModel` (`serverPool`, `issuerCodes`,
`issuerDenylist`, `journal`) :

```ts
function usageOf(code: string, m): { used: boolean; where: string[] } {
  const where: string[] = []
  if (Object.keys(m.serverPool.perCode[code] ?? {}).length) where.push('vocabulaire appris')
  if (Object.values(m.issuerCodes.perIssuer).some((c) => (c[code] ?? 0) > 0)) where.push('émetteurs')
  if (Object.values(m.issuerDenylist.perIssuer).some((s) => s.has(code))) where.push('interdictions')
  const docs = m.journal.entries.filter((e) => e.codes.includes(code)).length
  if (docs) where.push(`${docs} facture${docs > 1 ? 's' : ''} apprise${docs > 1 ? 's' : ''}`)
  return { used: where.length > 0, where }
}
```

### 3. `BudgetLinesManager.tsx` — le modal

- **Liste** (groupée par `category`, comme `CodePicker`) des `allBudgetLines()` /
  `budgetLines` du hook. Chaque ligne : `label`, `code` (mono), tags (chips `Tag.tsx`),
  bouton **Éditer** et bouton **Supprimer**.
- **Bouton Supprimer désactivé** si `usageOf(code).used` → tooltip « Utilisée par :
  vocabulaire appris, 3 factures apprises… ». Sinon → `useConfirm` (destructif) puis
  `removeLine(code)`. Gérer le cas où la RPC refuse malgré tout (course) : afficher le
  message « déjà utilisée » (SQLSTATE 23503).
- **Formulaire création/édition** (Dialog imbriqué, gabarit `ComptesBoard`) :
  - `code` : `Input` **désactivé en édition** ; en création, validé **unique**
    (contre `allBudgetLines()`), non vide, format libre (garder la casse/`o`).
  - `label` : `Input` requis.
  - `category` : `Select` des catégories existantes (dérivées de `budgetLines`) +
    possibilité d'en saisir une nouvelle.
  - `hint` : `Textarea`.
  - `tags` : rangée de chips `Tag.tsx` (toggle multi-sélection) alimentée par `TAGS`.
  - Enregistrer → `saveLine(...)` → invalidation ; état `busy`/erreur par formulaire.
- **État busy/erreur par ligne** : reprendre le `run(id, kind, fn)` de `RevueDialog`.

### 4. Point d'entrée

- Ajouter dans `CodePicker` (ou dans l'atelier `InvoicePanel`) un bouton discret
  « Gérer les imputations » (icône `Settings2`/`Pencil`) ouvrant `BudgetLinesManager`.
  Ne pas mélanger sélection et administration (D6).

## Ordre d'exécution

1. `useBudgetLinesCuration.ts`.
2. `BudgetLinesManager.tsx` (liste + usage + confirmations + formulaire).
3. Câbler le point d'ouverture.
4. `npx tsc --noEmit`.

## Critère de validation

- Créer une imputation (code unique) → apparaît immédiatement (invalidation) dans le
  manager ET dans le `CodePicker`.
- Éditer `label`/`hint`/`tags`/`category` → persiste après reload ; `code` non éditable.
- Supprimer un code **non utilisé** → OK ; un code **utilisé** → bouton désactivé +
  motif, et la RPC refuse en dernier recours.
- Actions réservées aux admins (route admin-only) ; feedback busy/erreur par ligne.
