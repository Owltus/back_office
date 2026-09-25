# Étape 5 — Exports : Markdown ZIP, JSON, impression

## Objectif

Remplacer les dialogues natifs « Enregistrer sous » et les commandes Rust
d'écriture de fichier par des téléchargements de `Blob`.

## Fichier(s) impacté(s)

- `src/lib/classeur/download.ts` — `telechargerBlob(nom, blob)`
- `src/lib/classeur/exportMarkdown.ts` — un document `.md` ; un chapitre ou
  un classeur en archive ZIP (`jszip` par `import()`)
- `src/lib/classeur/exportJson.ts` — format v2 identique à Registre
  (`format_version`, `_metadata` avec schéma descriptif et périodicités,
  `classeur`, `chapters[].items[]`), pour que les fichiers restent
  échangeables avec l'application de bureau
- Boutons « Exporter PDF » : `printViaIframe` sur l'aperçu

## Critère de validation

- Un export JSON du Back Office s'importe dans Registre (bureau) sans
  erreur, et inversement.
- `exportJson.test.ts` : forme exacte du fichier sur un classeur de deux
  chapitres et quatre éléments.
