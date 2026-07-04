# Étape 2 — Métier pur (lib/repjour/)

## Objectif

Porter dans `src/lib/repjour/` toute la logique métier pure de la source (calcul de KPI, écarts, validation, parsing CSV, constantes, formatage, politique de mot de passe), sous forme de fonctions pures sans React ni Tailwind ni Supabase — le socle testable de toute l'application, sur le modèle de `lib/poster/` et `lib/pdj/`.

## Contexte

Ces modules sont déterministes et portables quasi tels quels. Ils dépendent seulement de `papaparse` (parsing) et de `Intl` (formatage). `constants.ts` fige `TOTAL_ROOMS=80` et `VAT_RATE=10` (D16, gardés en dur, cohérents avec `hotel_config`). Le seul ajout maison est `roles.ts` (voir étape 4), qui centralisera l'unique `ROLE_HOME` — on peut le poser ici avec les autres constantes.

## Fichier(s) impacté(s)

- `src/lib/repjour/calc/kpi.ts`, `calc/ecart.ts`, `calc/validate.ts` (nouveaux)
- `src/lib/repjour/parse/comparison.ts`, `parse/forecast.ts`, `parse/detect.ts`, `parse/date.ts` (nouveaux)
- `src/lib/repjour/constants.ts`, `format.ts`, `password.ts` (nouveaux)
- `src/lib/repjour/types.ts` (nouveau — types centralisés portés depuis `src/types/index.ts` de la source)
- Sources fork : `src/lib/{calc,parse}/*`, `src/lib/{constants,format,password}.ts`, `src/types/index.ts`

## Travail à réaliser

### 1. Types centralisés

Porter `src/types/index.ts` de la source vers `src/lib/repjour/types.ts` : `UserRole`, `Profile`, `HotelConfig`, `KPIBlock`, `DailyReport`, `Alert`, `MonthBudget`, `ForecastDay`, `Ecart`, `ReportDate`, `ComparisonData`, `ForecastRow`. Ne pas oublier les types définis dans les services source (`EmailRecipient`/`RecipientType`, `Poste`, `MonthAnalytics`, `UnifiedDayRow`) — ils seront colocalisés avec leur service à l'étape correspondante.

### 2. Constantes et formatage

Porter `constants.ts` (`TOTAL_ROOMS`, `VAT_RATE`, `toTTC`, `MONTHS`, `MONTHS_LABELS`, `DAY_NAMES`) et `format.ts` (objet `fmt` basé sur `Intl` fr-FR) à l'identique. Porter `password.ts` (politique 12 caractères + classes de caractères).

### 3. Calcul KPI

Porter `calc/kpi.ts` (`reportToKPI`, `computeRealiseJour`, `computeRealiseMTD`, `computeProjeteMois`), `calc/ecart.ts` (`computeEcart`, `computeEcartMTD` au prorata), `calc/validate.ts` (`validateForecast`, `validateCoherence`, détection d'anomalies TVA). Recopier la logique au chiffre près — tous ces calculs dépendent de `TOTAL_ROOMS`.

### 4. Parsing CSV (dépend papaparse)

Porter `parse/comparison.ts` (`parseComparison`), `parse/forecast.ts` (`parseForecast`, `parseForecastAll`), `parse/detect.ts` (`detectFileType`), `parse/date.ts` (`extractReportDate` avec l'ajustement J-1). Conserver les index de colonnes en dur et la logique de détection PMS à l'identique (D9).

## Ordre d'exécution

1. `types.ts`, `constants.ts`, `format.ts`, `password.ts`.
2. `calc/*`.
3. `parse/*`.
4. Typecheck.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Aucun import de React, Tailwind, ou Supabase dans `lib/repjour/{calc,parse}` ni dans `constants/format/password` (modules purs).
- Named exports, alias `#/` avec extension explicite, aucun `export default`.
- Contrôle ciblé : un test manuel de `parseComparison` / `parseForecast` sur un CSV d'exemple du dépôt source produit les mêmes structures qu'attendu (comparaison de quelques valeurs).
