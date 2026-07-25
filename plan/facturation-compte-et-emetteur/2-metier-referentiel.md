# Étape 2 — Métier : référentiel au couple + retrait des codes inventés

## Objectif

Faire lire au métier le référentiel couple (code + compte) depuis Supabase, et retirer les codes inventés (`SEED_RULES`). À l'issue, `budgetRegistry` et le service exposent des imputations `(codeAnalytique, compte)` réelles.

## Fichier(s) impacté(s)

- `src/lib/facturation/types.ts` (modification : `BudgetLine` → `Imputation {codeAnalytique, compte, section, libelle, description}`)
- `src/lib/facturation/budgetRegistry.ts` (modification : registre au couple, clé `code|compte`)
- `src/lib/facturation/cloudService.ts` (modification : `fetchImputations` + RPC réimport ; retrait des accès `budget_lines` selon D3)
- `src/lib/facturation/constants.ts` (modification : retrait `SEED_RULES` ; garde `TAGS`, seuils OCR)

## Travail à réaliser

### 1. Types

Introduire `Imputation` (couple + libellés). Clé canonique `imputationKey(code, compte)` = `` `${code}|${compte}` ``.

### 2. Registre

`setImputations`, `imputationLabel(code, compte)`, `allImputations()` ; repli vide si non chargé (plus de repli sur un code brut inventé).

### 3. Service

`fetchImputations()` (select paginé, même pattern que l'existant) ; `reimportImputations(json)` (RPC). Conserver la séparation lecture directe / écriture RPC.

### 4. Retrait SEED_RULES

Supprimer `SEED_RULES` et les codes placeholder de `constants.ts` ; ajuster les imports (`detect.ts` cesse de les utiliser — voir étape 3).

## Ordre d'exécution

1. Types, puis registre, puis service.
2. Retrait `SEED_RULES` en dernier (une fois `detect.ts` allégé à l'étape 3, si menée avant).

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe.
- Le registre renvoie des couples réels chargés depuis Supabase.
- Grep `SEED_RULES` vide côté `src/`.
