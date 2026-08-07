# Étape 2 — Fraîcheur du Forecast (colonne `imported_at` + estampillage)

## Objectif

Pouvoir savoir si le Forecast d'un mois a été importé LORS DU CYCLE COURANT (et
pas une version périmée d'un cycle précédent). C'est la donnée qui manque pour
que le RepJour n'envoie qu'avec un projeté frais.

## Fichier(s) impacté(s)

- `supabase/forecast_days_imported_at.sql` (nouveau, à exécuter par l'utilisateur)
- `supabase/functions/import-report/repjour.ts` (estampillage à l'import Forecast)

## Travail à réaliser

### 1. SQL (additif, non destructif)

```sql
alter table public.forecast_days
  add column if not exists imported_at timestamptz not null default now();
```

`default now()` → les lignes existantes prennent l'instant de la migration ; à
chaque ré-import, on met à jour explicitement `imported_at` (voir ci-dessous).

### 2. Estampiller à l'import (`importForecast`, repjour.ts)

Dans le payload d'upsert `forecast_days`, ajouter `imported_at: new Date().toISOString()`
pour chaque ligne. L'upsert `onConflict:'date'` mettra donc à jour `imported_at`
à chaque import réussi du mois → il reflète toujours le dernier import réel.

## Ordre d'exécution

1. Écrire le `.sql` (exécution par l'utilisateur).
2. Modifier `importForecast` pour inclure `imported_at`.
3. `deno check` de la fonction.

## Critère de validation

- La colonne existe (`information_schema.columns`).
- Après un import Forecast réel, `max(imported_at)` du mois vaut ~maintenant.

## Contrôle /borg

Étape critique (schéma DB). Auditer :
- La colonne est bien `not null default now()` (pas de casse des lignes existantes).
- L'upsert `forecast_days` met bien à jour `imported_at` sur conflit (colonne dans
  le payload) et n'altère aucune autre colonne existante.
- Aucun autre code ne suppose l'absence de cette colonne.
