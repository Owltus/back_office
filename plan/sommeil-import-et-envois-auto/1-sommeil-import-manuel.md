# Étape 1 — Mettre en sommeil l'import manuel (RepJour + PDJ)

## Objectif

Masquer/désactiver côté utilisateur les fonctions d'import MANUEL, sans supprimer
le code (réactivable via un flag). L'ingestion est désormais automatique.

## Qui

MOI.

## Décision liée

[A-FILET] : masquer aux utilisateurs mais garder un accès admin (recommandé) OU
masquer à tout le monde. Selon la réponse, le flag est soit un booléen global, soit
une garde `grade === 'admin'`.

## Fichier(s)

- `src/lib/repjour/constants.ts` (nouveau flag)
- `src/components/repjour/boards/DashboardBoard.tsx` (montage `ImportSection`, l.791)
- `src/components/repjour/ForecastImportButton.tsx` (garde, l.53)
- `src/components/pdj/BreakfastBoard.tsx` (bouton import l.460-471, dropzone l.509-552)

## Travail à réaliser

1. Introduire un flag partagé (ex. `MANUAL_IMPORT_ENABLED` dans `constants.ts`, ou
   deux flags repjour/pdj). Défaut : import auto → manuel en sommeil.
2. RepJour : conditionner le montage de `ImportSection` (DashboardBoard.tsx:791) et
   le rendu de `ForecastImportButton` (l.53) au flag (ou à `grade==='admin'` si
   filet admin retenu). Ne PAS toucher l'orchestrateur ni le parse (code conservé).
3. PDJ : masquer le bouton « Importer un CSV » (BreakfastBoard.tsx:460-471) et
   remplacer la dropzone active (l.509-541) par le message neutre (branche `else`,
   l.542-552). Ne pas toucher `loadFiles`/`csv.ts`/`service.ts`.
4. Attention : `canEdit` (PDJ) sert AUSSI à la saisie « servi » et à la purge — ne
   remplacer `canEdit` QUE pour les éléments d'import, pas globalement.

## Critère de validation

- Un compte utilisateur ne voit plus l'import (RepJour + PDJ) ; la saisie « servi »
  PDJ et le reste des pages fonctionnent normalement.
- (Si filet admin) un admin voit encore l'import.
- `npx tsc --noEmit` clean ; l'import automatique n'est pas affecté.
