# Étape 7 — Import CSV du PMS

## Objectif

Porter l'orchestrateur d'import : détecter et parser les deux CSV du PMS (comparison + forecast), calculer les KPI, upserter dans `daily_reports` et `forecast_days`, et archiver les fichiers dans le Storage Supabase. Gater sur `super_utilisateur` et `admin`. Première brique d'écriture du chantier.

## Contexte

L'import est le cœur « écriture » de l'app. Les upserts sont idempotents (`onConflict` sur `date`), donc non destructifs. L'archivage écrit dans le bucket privé existant `csv-archive` (D20). Toutes ces écritures sont soumises aux RLS (`super_utilisateur`/`admin` pour `daily_reports`/`forecast_days`). Rappel : aucune création de table, de bucket ou de policy — on consomme l'existant.

## Fichier(s) impacté(s)

- `src/lib/repjour/import/orchestrator.ts` (nouveau — `preValidateForecast`, `processComparisonOnly`, `processImport`)
- `src/routes/repjour/import.tsx` (nouveau)
- `src/components/repjour/boards/ImportBoard.tsx` (nouveau — drag/drop, détection, validation, confirmation)
- `src/routeTree.gen.ts` (régénéré)
- Sources fork : `src/lib/import/orchestrator.ts`, `src/pages/ImportPage.tsx`, `src/lib/parse/detect.ts`, `src/lib/parse/date.ts`

## Travail à réaliser

### 1. Orchestrateur

Porter `import/orchestrator.ts` à l'identique : `preValidateForecast` (lecture `forecast_days` + `budget`, validation sans écriture), `processComparisonOnly` (parse comparison, lecture budget — throw si absent —, upsert `daily_reports`, upload Storage), `processImport` (deux CSV, calcul KPI, upsert `daily_reports` + `forecast_days`, upload des deux CSV). Conserver le caractère idempotent des upserts.

### 2. Board d'import

Porter `ImportPage` : zone drag/drop, détection du type de fichier (`detectFileType`), extraction de la date (`extractReportDate`, ajustement J-1), pré-validation, bandeau d'alertes, confirmation. Après import, rediriger vers le dashboard. Restyler en dark. Gating `super_utilisateur`/`admin`.

### 3. Route

`routes/repjour/import.tsx`, enveloppée par `ProtectedRoute` (`super_utilisateur`, `admin`).

## Ordre d'exécution

1. Orchestrateur.
2. `ImportBoard`.
3. Route + régénération du routeTree.
4. Typecheck, test d'import réel prudent (voir validation).

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe.
- Import d'un CSV de test : les upserts sont idempotents (ré-importer la même date ne duplique rien), le fichier est archivé dans `csv-archive`, le dashboard reflète les nouvelles données.
- Un rôle `utilisateur` n'accède pas à la page d'import (garde + RLS).
- Aucune opération autre que celles de la source (upsert `daily_reports`/`forecast_days` + upload Storage) ; aucune migration.

## Contrôle /borg

Étape critique (première écriture Supabase + écriture Storage). Audit post-exécution :

- Les seules écritures sont des upserts idempotents sur `daily_reports`/`forecast_days` et l'upload `csv-archive` — rien d'autre.
- Aucune suppression, aucun DDL, aucune modification de schéma/policy.
- Le gating de rôle est effectif côté garde ET la RLS reste la barrière réelle.
- Test de non-régression : après import depuis le port, l'app standalone lit les mêmes données sans incohérence.
