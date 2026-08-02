# Étape 4 — Brancher le réalisé comme référence

## Objectif

Fournir à `validateForecast` la référence TTC (réalisé du mois) aux points
d'import, via le helper `buildTvaRef` de l'étape 2. Gérer proprement l'absence de
réalisé (mois futur, début de mois) : `ref === null` → aucune détection.

## Contexte

`orchestrator.ts` lit déjà budget et historique forecast en parallèle
(`preValidateForecast:80-84`, `processImport:445-449`, `processComparisonOnly`). Le
réalisé (`daily_reports`) n'y est pas lu. `services/daily.ts` expose
`fetchLatestReportOfMonth(year, month)` (dernier jour importé, porteur des `rmtd_*`
en TTC) : c'est la source de l'ADR de référence.

## Fichier(s) impacté(s)

- `src/lib/repjour/import/orchestrator.ts`
- `src/lib/repjour/services/daily.ts` (helper `buildTvaRef`, étape 2)

## Travail à réaliser

### 1. Utiliser le helper de référence (étape 2)

`buildTvaRef(latestReport)` (réalisé seul, pas de budget) est défini à l'étape 2.
L'orchestrateur n'a qu'à lui fournir le dernier réalisé du mois.

### 2. Câbler les points d'import

Dans `preValidateForecast`, `processImport`, `processComparisonOnly` (partout où
`validateForecast` est appelé) :

- lire le dernier réalisé du mois via `fetchLatestReportOfMonth(year, month)` ;
- construire `ref = buildTvaRef(latestReport)` ;
- appeler `validateForecast(rows, daysInMonth, ref)` — nouvelle signature, **sans
  `budget`**.

Note : sur le dashboard, `preValidateForecast` tourne AVANT l'écriture du Comparison
courant — le réalisé lu couvre donc jusqu'à la veille. C'est une référence TTC
valable (MTD de la veille), suffisante pour juger la TVA.

### 3. Nettoyer les lectures devenues inutiles

- La lecture `forecast_days` (ex-`existingDays`) n'a plus d'usage TVA (branche
  supprimée en étape 3) : la retirer si orpheline, la garder sinon (vérifier).
- Le `budget` n'est plus passé à `validateForecast` : retirer l'argument aux points
  d'appel. Le budget reste lu pour ses autres usages (vérifier avant de toucher).

## Ordre d'exécution

1. Brancher la lecture `fetchLatestReportOfMonth` + `buildTvaRef` sur les points
   d'import.
2. Adapter les appels à la nouvelle signature de `validateForecast`.
3. Nettoyer les lectures orphelines.
4. `npx tsc --noEmit`.

## Critère de validation

- `validateForecast` reçoit un `ref` issu du réalisé quand il existe, `null` sinon.
- Un import de mois **futur** (aucun réalisé) ne lève aucune alerte TVA.
- `npx tsc --noEmit` sans erreur.
