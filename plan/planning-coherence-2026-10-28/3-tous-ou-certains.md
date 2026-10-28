# Étape 3 — « Tous » ou « Seulement ceux-ci », jamais implicite

## Objectif

Une liste vide n'ouvre plus tout en silence. Chaque liste de choix (codes d'un
poste, codes d'une personne, postes d'un groupe) commence par un choix explicite
à deux boutons : « Tous » / « Seulement ceux-ci ».

## Dépend de

2.

## Fichier(s) impacté(s)

- Composant de choix des codes (`reglages/ChoixCodes`), `PostesPage.tsx:217-221,394-403`.
- `equipe/SectionsFiche.tsx:184-204` (codes de la personne).
- `equipe/GestionCategories.tsx:40-57,120-139,203-208` (postes d'un groupe, `competencesPerdues`).

## Travail à réaliser

1. Contrôle segmenté « Tous les codes / Seulement ceux-ci ». « Tous » = `{}` en base (D11), la liste est masquée et remplacée par « Les 33 codes ».
2. En « Seulement ceux-ci », décocher le dernier code est impossible : le bouton reste coché, avec la phrase « Gardez au moins un code, ou choisissez Tous ».
3. Passer de « Seulement » à « Tous » se fait d'un clic, sans confirmation (réversible, la sélection est gardée le temps de la séance).
4. `competencesPerdues` : compter aussi le passage à « Tous » ; test unitaire ajouté (il n'en a aucun).

## Phase de test /martin

Pour chaque liste : décocher tout un par un ne produit jamais `{}` ; l'enregistrement relu en base correspond au mode affiché.

## Critère de validation

- `PostesPage.test.tsx`, `EquipePage.test.tsx`, `validation.test.ts` à jour et verts.
