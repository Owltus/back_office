# Étape 3 — Cœur RepJour porté (Comparison + Forecast)

## Objectif

Importer automatiquement les deux rapports RepJour en **reproduisant fidèlement**
l'import manuel (`src/lib/repjour/…`), sans toucher à ce dernier.

## Qui

**MOI** (code).

## Fichier(s)

- `supabase/functions/import-report/` : modules portés (copie du cœur)
  - parsing Comparison (`parse/comparison.ts`, `parse/metrics.ts`), Forecast
    (`parse/forecast.ts`), date (`parse/date.ts`), constantes TVA.
  - validation (`calc/validate.ts` : cohérence + forecast + détection TVA HT).
  - écriture : `daily_reports` (upsert `date`), `pms_daily_metrics` (upsert
    `report_date,line_no` + purge des lignes excédentaires), `forecast_days`
    (upsert `date`).

## Travail à réaliser

1. **Porter** le parsing (papaparse marche en Deno) et la validation, à l'identique.
2. **J-1** : la date métier = date du nom de fichier − 1 jour (`extractReportDate`).
   Figer le fuseau **Europe/Paris**.
3. **Référence TVA** : pour juger « forecast en HT », lire le réalisé du mois
   (`daily_reports`) comme référence TTC (comme l'orchestrateur). Si le Comparison
   du même jour arrive séparément, gérer l'ordre (le Forecast peut arriver avant/
   après — se baser sur ce qui est en base).
4. **`imported_by`** = UUID système (Étape 1). Trancher le cas `pms_daily_metrics`
   (trigger `auth.uid()` NULL en service_role) : soit poser la valeur explicitement,
   soit rendre la colonne nullable pour l'auto — **remonter la décision**.
5. **Erreurs bloquantes** (nuitées>80, négatifs, forecast vide/HT) → **ne rien
   écrire**, répondre 422 (le Worker rejette → visible côté envoi). Warnings →
   importer quand même + consigner dans `daily_reports.alerts`.

## Critère de validation

- Import d'un vrai `Comparison_By_Date_YYYYMMDD.csv` → `daily_reports` du bon jour
  (J-1) + `pms_daily_metrics` cohérents avec l'import manuel (mêmes valeurs).
- Import d'un vrai `Forecast_By_Date_Range.csv` → `forecast_days` corrects.
- Ré-import du même fichier = **aucun doublon** (upsert), purge OK.
- Un forecast en HT → **refusé** (422), rien écrit.

## Contrôle /borg

Critique (écriture prod multi-tables) : vérifier l'idempotence réelle, la purge
`pms_daily_metrics` (upsert AVANT delete), l'absence de régression sur l'import
manuel (code non partagé, mais mêmes tables), et le respect de la RLS/service_role.
