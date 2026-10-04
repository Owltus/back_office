# Étape 5 — Imprimer ce qui a changé depuis une date

## Objectif

Pour remplacer seulement les feuilles modifiées dans les pochettes : sur
l'accueil d'un classeur, une carte « Imprimer les modifications » ouvre un
choix de date (pré-rempli avec la dernière impression du classeur sur ce
poste — angle n° 2 de l'index), liste les éléments modifiés depuis, avec leur
version et la raison, puis ouvre l'aperçu d'impression de ces seuls éléments.

## Ce qui compte comme « modifié »

- **Document** : une version enregistrée après la date (table
  `classeur_document_versions`, origine ≠ `etat_initial`) — PAS `updated_at`,
  qui bouge aussi quand on réordonne ou déplace (le contenu, lui, n'a pas
  changé : rien à réimprimer).
- **Feuille de suivi, de signature, intercalaire** : `updated_at` après la
  date (elles n'ont pas d'historique de versions ; un réordonnancement les
  fera apparaître — acceptable, signalé dans la liste).

## Fichier(s) impacté(s)

- `src/lib/classeur/service.ts` : lecture des dernières versions par document
  du classeur après une date (une requête, colonnes explicites).
- `src/lib/classeur/selectionImpression.ts` : filtre et tri (pur, testé).
- `src/components/classeur/dialogs/ImprimerModifiesDialog.tsx` (nouveau)
- `src/components/classeur/ClasseurDashboardActions.tsx` (carte d'action)
- Mémorisation « dernière impression » : `localStorage` par classeur et par
  compte, posée par `PrintPreview` après une impression réussie.

## Critère de validation

- Test : un document réordonné mais non modifié n'apparaît pas ; un document
  modifié apparaît avec sa version.
- Navigateur, sans écrire : date d'hier → liste des documents d'essai
  modifiés aujourd'hui ; aperçu ouvert puis fermé.
