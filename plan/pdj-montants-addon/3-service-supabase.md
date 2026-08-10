# Étape 3 — Service : lecture / écriture `pdj_addon_production`

## Objectif

Ajouter au service PDJ les accès Supabase pour la table Addon Production : lire les lignes
d'un jour (pour le calcul PDF) et les importer (upsert, pour l'import manuel côté app).

## Contexte

`src/lib/pdj/service.ts` suit un style « I/O pur » : `const { data, error } = await …;
if (error) throw error`, upsert par lots de 1000, snake_case non converti. `PDJ_TABLE =
'pdj_breakfasts'` en tête. Les queryKeys TanStack sont définies dans les composants, pas ici.
Réutiliser exactement ces patterns.

## Fichier(s) impacté(s)

- `src/lib/pdj/service.ts` (modifié)

## Travail à réaliser

### 1. Constante de table

```ts
const PDJ_ADDON_TABLE = 'pdj_addon_production'
```

### 2. Type de ligne lue

```ts
export interface PdjAddonRow {
  id: string
  service_date: string
  code: string
  total_count: number
  revenue_ttc: number
  source_file: string | null
}
```

### 3. Lecture d'un jour

```ts
export async function fetchAddonProduction(serviceDate: string): Promise<PdjAddonRow[]>
```
`select('*').eq('service_date', serviceDate)` — miroir de `fetchDay`, sans pagination (au plus
quelques lignes par jour).

### 4. Import (upsert)

```ts
export async function importAddonProduction(rows: AddonProductionDbRow[]): Promise<void>
```
- `AddonProductionDbRow` = `{ service_date, code, total_count, revenue_ttc, source_file }`
  où `service_date = breakfastServiceDate(businessDate)` (alignement +1 jour, Point de
  correction n°1) — l'appelant (import manuel) mappe depuis `parseAddonProduction` + nom de fichier.
- upsert `onConflict: 'service_date,code'`, par lots de 1000 (calquer `importRows` L119).
- déduplication préalable par `service_date|code` (le dernier gagne) pour ne pas violer
  `ON CONFLICT` si le lot contient deux fois la même clé.
- normaliser `code` (`trim().toUpperCase()`) avant l'upsert (cohérent avec l'Edge et la clé).

### 5. (optionnel) suppression d'un jour

Si l'Étape 5 propose de « supprimer le jour » (miroir de `deleteDay`), ajouter
`deleteAddonProductionDay(serviceDate)`. Sinon, s'appuyer sur l'upsert (réimport écrase).

> Si option **A2** (table `pdj_day_extras`) est retenue, ajouter ici `fetchDayExtras(serviceDate)`
> et `setDayExtras(serviceDate, count)` (upsert `onConflict: 'service_date'`). Non retenu par défaut.

## Ordre d'exécution

1. Ajouter `PDJ_ADDON_TABLE`, `PdjAddonRow`, `AddonProductionDbRow`.
2. `fetchAddonProduction`, `importAddonProduction` (+ éventuel delete).
3. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` vert.
- Les signatures s'alignent sur le métier (Étape 2) et la table (Étape 1) : `revenue_ttc`
  numérique, clé `(service_date, code)`.
- Aucune écriture des colonnes d'estampillage serveur (`updated_at`, posé par le trigger).
