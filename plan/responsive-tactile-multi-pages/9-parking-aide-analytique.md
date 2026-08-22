# Étape 9 — Parking : aide tactile + vues analytique responsive

## Objectif

Ajouter la distinction gestes souris/tactile dans `ParkingHelpPanel` (pattern
`pointer-fine`/`pointer-coarse`, comme `RaproHelpPanel`), et activer
`mobileIdentity`/`mobileToolbar` sur les vues analytique Parking.

## Contexte

`ParkingHelpPanel` a une section « Créer et modifier une réservation »
conditionnée à `canEdit`, décrivant clic droit / clic gauche maintenu / copier
Ctrl+clic / Ctrl+Z-Y — tout en langage souris. Une fois `canEdit` dépendant du
pointeur (étape 8), cette section ne s'affichera de toute façon plus en
contexte tactile pur (puisque `canEdit=false` sur tactile) — mais le reste du
panneau (couleurs, se déplacer dans le temps, raccourcis clavier) gagne à
suivre la même convention `pointer-fine`/`pointer-coarse` que Rapro pour
rester cohérent avec le reste de l'app.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingHelpPanel.tsx`
- `src/components/parking/ParkingAnalytiqueBoard.tsx`
- `src/components/parking/ParkingAnalytiqueMoisBoard.tsx`

## Travail à réaliser

### 1. Aide tactile

Section « Raccourcis clavier » : `hidden pointer-fine:block` (un clavier
physique n'existe pas au doigt, même convention que `RaproHelpPanel`). Section
panoramique/déplacement dans le temps : reste commune (le panoramique tactile
fonctionne pareil qu'à la souris, glisser au doigt vs glisser à la souris —
un seul texte suffit si déjà formulé de façon neutre, sinon dupliquer comme
Rapro l'a fait pour ses deux gestes).

### 2. Vues analytique

Même recette que l'étape 3 (RepJour analytique), transposée aux routes
Parking. Ces vues n'ont ni compact ni tactile propre aujourd'hui — portage
direct sans décision produit supplémentaire.

## Ordre d'exécution

1. Aide tactile (§1).
2. Vue annuelle analytique.
3. Vue mensuelle analytique.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `npx pnpm build`.
- Vérification manuelle : modal d'aide Parking affiche le bon contenu selon
  `pointer-fine`/`pointer-coarse` ; vues analytique responsive comme les autres
  domaines déjà portés.
