# Étape 1 — Retirer les demandes au LLM

## Objectif

Plus aucune case à cocher à l'export. `_metadata.demande` disparaît du format
et des consignes. Aucun code d'import ne la lisait (vérifié dans `apply.ts`,
`portee.ts`, `versionDocument.ts`, `useMerge.ts`).

## Fichier(s) impacté(s)

- Supprimés : `src/lib/classeur/llmDemandes.ts`, `src/lib/classeur/llmDemandes.test.ts`,
  `src/components/classeur/dialogs/DemandesLlm.tsx`,
  `src/lib/classeur/merge/portee.demande.test.ts`,
  `src/lib/classeur/merge/__oracle__/export-portee-avant-demandes.json`.
- `src/lib/classeur/merge/schema.ts` : `MetadataJson.demande` (l.60-61),
  paramètre `demande` de `construireExport` (l.555-566, 611), lecture dans
  `lireMetadata` (l.488).
- `src/lib/classeur/merge/portee.ts` : `ExportPortee.demande` (l.82-83),
  `construireExportChapitre` / `construireExportDocument` (l.144, 178),
  commentaire d'`extraireJson` (l.237-241).
- `src/lib/classeur/merge/consignes.ts` l.17 : phrase « DEMANDE DE L'UTILISATEUR ».
- `src/components/classeur/dialogs/ExportJsonClasseurDialog.tsx` (l.4-7, 20, 55-63, 71-78, 87, 118-129).
- `src/components/classeur/dialogs/EchangeJsonDialog.tsx` (l.18-21, 39, 120-123, 202, 210, 228, 231-266, 369-380).
- Tests : `portee.test.ts` l.354-355, `portee.adverse.test.ts` l.20 et 147-172
  (garder le cas `:::etape{photo=gauche}`), `fusionComplete.exclus.property.test.ts`
  l.424-457, `ExportJsonClasseurDialog.test.tsx`, `EchangeJsonDialog.test.tsx` l.196-292.

## Travail à réaliser

1. Retirer le paramètre positionnel `demande` des trois constructeurs d'export.
2. Retirer les composants et l'état des demandes des deux dialogues (le
   dialogue du classeur reste, il sera réduit à l'étape 3).
3. Supprimer les fichiers et tests listés ; adapter les autres.

## Phase de test /martin

- Aller-retour `parseImportJson(JSON.stringify(export))` toujours exact.
- Un fichier ancien qui porte encore `_metadata.demande` s'importe sans erreur
  (clé ignorée).

## Critère de validation

- `rg "llmDemandes|DemandesLlm|_metadata.demande|composerDemande"` dans `src/` : 0 résultat.
- `npx tsc --noEmit`, `pnpm test` sur `src/lib/classeur` et `src/components/classeur`.
