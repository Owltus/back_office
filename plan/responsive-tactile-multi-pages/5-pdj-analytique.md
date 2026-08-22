# Étape 5 — PDJ : vues analytique responsive

## Objectif

Activer `mobileIdentity`/`mobileToolbar` sur `PdjAnalytiqueBoard.tsx` et
`PdjAnalytiqueMoisBoard.tsx`, déjà sur `AnalytiqueShell`. Aucune décision
produit en attente pour cette étape (D1 ne concerne que le board du jour).

## Fichier(s) impacté(s)

- `src/components/pdj/PdjAnalytiqueBoard.tsx`
- `src/components/pdj/PdjAnalytiqueMoisBoard.tsx`

## Travail à réaliser

Même recette que l'étape 3 (RepJour analytique), transposée aux routes PDJ
(`/pdj`, `/pdj/analytique`, `/pdj/analytique/$year/$month`).

## Ordre d'exécution

1. Vue annuelle.
2. Vue mensuelle.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `npx pnpm build`.
- Vérification manuelle identique à l'étape 3.
