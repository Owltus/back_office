# Étape 8 — « À vérifier » et l'aide suivent les règles

## Objectif

L'app dit elle-même quand une règle ne peut pas être tenue avec les réglages, et l'aide décrit les règles réglées, plus celles de l'hôtel.

## Dépend de

Étape 5.

## Fichier(s) impacté(s)

- `src/lib/planning/coherence.ts` (écran `'regles'`)
- `src/components/planning/AidePlanningContenu.tsx` et son test

## Travail à réaliser

1. Points nouveaux : contrat sans journée possible sur ses postes ; deux repos de suite imposés mais semaine type qui l'empêche ; relève demandée sans horaires qui se croisent ; limites de moments qui se chevauchent.
2. Chaque point a un lien vers la section de la page Règles.
3. L'aide lit les règles (le tableau des contrats, les deux repos) au lieu de phrases figées.

## Critère de validation

- Tests de `coherence.ts` : un point par réglage impossible, aucun avec les défauts.
