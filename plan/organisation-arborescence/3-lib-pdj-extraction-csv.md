# Étape 3 — lib/pdj : extraction du métier CSV

## Objectif

Sortir le module métier CSV complet de `BreakfastBoard.tsx` (l.40-180) vers `src/lib/pdj/`, sur le modèle de `lib/poster/` : fonctions pures, testables, sans React. Comportement strictement identique.

## Contexte

Le domaine PDJ est le seul dont tout le métier vit dans la couche présentation : `parseCsvLine`, `dateFromFilename`, `processCsv` (détection de séparateur, mapping colonnes, règles IN HOUSE/DUE OUT, calcul `breakfastsIncluded` avec la règle `BB1PAX`) représentent ~140 lignes de logique pure enfouies dans un composant de 527 lignes.

## Fichier(s) impacté(s)

- `src/lib/pdj/csv.ts` (nouveau)
- `src/components/pdj/BreakfastBoard.tsx` (modification : imports, suppression du code déplacé)
- `src/lib/pdjStore.ts` (modification : les types `Guest`/`GuestMap` migrent vers `lib/pdj/csv.ts`, le store les ré-importe et les ré-exporte pour compatibilité)

## Travail à réaliser

### 1. Créer `src/lib/pdj/csv.ts`

Y déplacer, sans en modifier la logique :

- les types `Guest` et `GuestMap` (depuis `pdjStore.ts`) ;
- `ALL_ROOMS` (`BreakfastBoard.tsx:44-51`) et `REQUIRED_COLUMNS` (`:53-62`) ;
- `parseCsvLine` (`:65-87`), `dateFromFilename` (`:90-99`), `processCsv` (`:101-180`).

Exports nommés. Conformément à l'arbitrage D8, aucune classe Tailwind ni logique de rendu ne descend dans ce module.

### 2. Alléger `BreakfastBoard.tsx`

Remplacer les définitions locales par des imports `#/lib/pdj/csv.ts`. Le composant conserve : gestion du drop de fichier, stats (`useMemo`), rendu, sous-composants `Stat` et `GuestRow`.

### 3. Ajuster `pdjStore.ts`

Importer `Guest`/`GuestMap` depuis `lib/pdj/csv.ts` (ou un ré-export) pour éviter la double déclaration ; l'API publique du store (`setPdjData`, `resetPdjData`) ne change pas.

## Ordre d'exécution

1. Créer `lib/pdj/csv.ts` (copie fidèle).
2. Basculer `pdjStore.ts` puis `BreakfastBoard.tsx` sur les imports.
3. Typecheck et test manuel avec un CSV réel.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Import d'un CSV de test sur `/pdj` : mêmes stats et mêmes lignes qu'avant l'extraction (comparaison visuelle).
- `BreakfastBoard.tsx` ne contient plus aucune fonction de parsing ni constante de schéma CSV.
