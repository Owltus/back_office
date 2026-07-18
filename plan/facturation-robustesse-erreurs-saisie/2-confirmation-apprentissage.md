# Étape 2 — Confirmation d'apprentissage

## Objectif

Rendre visible et contrôlable ce que le tamponnage va **mémoriser** (émetteur +
imputations), pour que l'utilisateur intercepte une mauvaise imputation avant qu'elle ne
pollue durablement la base. C'est la protection la plus efficace contre l'erreur la plus
grave (mauvaise imputation = dizaines de tokens sur le mauvais code, non réversible
automatiquement).

## Contexte

Aujourd'hui `handleStamp` (`InvoicePanel.tsx`) enchaîne tampon → apprentissage sans
pause ni visibilité : `learnClouds(record.codes, deltas)` puis `learnIssuer`. Les seules
gardes sont `record.learned` (anti-double) et `canLearn` (nom ≥ 4 car.). Rien ne montre à
l'utilisateur ce qui part en base. Décision **D2** : afficher clairement + case
« mémoriser » cochée par défaut (léger, sans étape bloquante).

## Fichier(s) impacté(s)

- `src/components/facturation/InvoicePanel.tsx`

## Travail à réaliser

### 1. Case « mémoriser cette imputation »

État local `remember` (défaut `true`), rendu près du bouton de tampon (bas épinglé). La
garde d'apprentissage `if (!record.learned && record.codes.length > 0)` devient
`if (remember && !record.learned && record.codes.length > 0)`. Décochée → le PDF est
quand même tamponné/téléchargé, mais **rien n'est appris**.

### 2. Récapitulatif de ce qui sera mémorisé

Sous la case, un texte discret listant ce qui partira en base quand `remember` est coché :
« Sera mémorisé : émetteur **{supplierName}** → imputation(s) **{codes lisibles}** ».
Utilise `budgetLabel(code)` et les tokens du thème (`text-xs text-muted-foreground`). Ce
récapitulatif rend l'erreur d'imputation visible AVANT l'écriture.

### 3. Cohérence avec l'étape 1

Si l'émetteur saisi déclenche une suggestion « vouliez-vous dire » (étape 1) non
résolue, l'afficher aussi ici (rappel avant apprentissage). Optionnel selon D2/D3.

## Ordre d'exécution

1. État `remember` + case à cocher (bas épinglé).
2. Conditionner l'apprentissage à `remember`.
3. Récapitulatif « sera mémorisé ».

## Critère de validation

- Décocher « mémoriser » puis tamponner → PDF téléchargé, aucun appel `learnClouds`/`learnIssuer` (rien en base).
- Cocher (défaut) → apprentissage inchangé, et le récapitulatif affiche l'émetteur + les imputations exactes qui seront mémorisés.
- `npx tsc --noEmit` passe ; rendu vérifié dans le navigateur.
