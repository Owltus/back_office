# Étape 7 — Caisse : vues analytique responsive

## Objectif

Activer `mobileIdentity`/`mobileToolbar` sur `CaisseAnalytiqueBoard.tsx` et
`CaisseAnalytiqueMoisBoard.tsx`, déjà sur `AnalytiqueShell`. Ces vues sont des
agrégats en lecture seule, sans notion de shift — aucune décision produit en
attente pour cette étape (D2 ne concerne que le board du jour).

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseAnalytiqueBoard.tsx`
- `src/components/caisse/CaisseAnalytiqueMoisBoard.tsx`

## Travail à réaliser

Même recette que l'étape 3 (RepJour analytique), transposée aux routes Caisse.

## Ordre d'exécution

1. Vue annuelle.
2. Vue mensuelle.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `npx pnpm build`.
- Vérification manuelle identique à l'étape 3.
