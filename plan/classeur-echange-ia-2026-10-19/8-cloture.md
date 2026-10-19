# Étape 8 — Aide, documentation, contrôle global ⚠

## Objectif

Mettre à jour ce que lisent les personnes et les futurs développeurs, puis
contrôler l'ensemble.

## Dépend de

1 à 7.

## Fichier(s) impacté(s)

- `src/components/classeur/ClasseurListHelpPanel.tsx` (section « Créer ou
  importer ») et l'aide de l'accueil s'il en a une : une phrase sur « Copier
  pour une IA ».
- `CLAUDE.md` : section Classeur (JSON pour un LLM, consignes, `llmDemandes`
  retiré, mode IA de l'import, instantanés sans consignes).
- `plan/classeur-fonctions-2026-10-04/3-llm-demandes.md` : bandeau
  « REMPLACÉ le … par plan/classeur-echange-ia-2026-10-19 ».
- `00-INDEX.md` de ce plan : colonne Livrable remplie, bilan de clôture.

## Travail à réaliser

1. Textes d'aide, sans jargon.
2. Documentation.
3. Audit « répond-il à la demande ? » : relire les réponses de l'utilisateur
   (index, tableau du Contexte) point par point.
4. `npx tsc --noEmit`, `pnpm test`, `pnpm lint` sur les fichiers touchés.

## Critère de validation

- Les quatre réponses de l'utilisateur sont couvertes, chacune avec l'étape et
  le commit qui la réalisent.
- Reste à faire par l'utilisateur : un vrai aller-retour avec une IA.

## Contrôle /borg

- Interop Registre : un export du Back Office se relit avec le struct
  `MetadataJson` / `ItemJson` de `files.rs`.
- Aucune régression sur restauration, import Registre, import en nouveau
  classeur.
