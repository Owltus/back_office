# Étape 1 — Données : `late_arrivals` et `corrections` sur `rapro_sheets`

## Objectif

Stocker par jour les deux nombres saisis à la main du côté Réception : **arrivées
après clôture** (`late_arrivals`) et **corrections** (`corrections`, qui peut être
négatif). Ils vivent au niveau jour → table `rapro_sheets` (comme le commentaire).

## Contexte

**Étape critique** : touche le schéma de `rapro_sheets`. Le fichier
`supabase/rapro_sheets.sql` est en `create table if not exists` — donc le
ré-exécuter **n'ajoute PAS** de colonnes à une table déjà créée. Il faut des
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` explicites, **exécutés par
l'utilisateur**. `rapro_rooms` reste **intouché** (son script fait un
`drop table cascade` destructif — ne pas y toucher).

## Fichier(s) impacté(s)

- `supabase/rapro_sheets.sql` (modifié — migration additive + définition source)
- `src/lib/rapro/types.ts` (modifié)
- `src/lib/rapro/service.ts` (modifié)

## Travail à réaliser

### 1. Migration additive (SQL, exécutée par l'utilisateur)

```sql
-- A EXECUTER PAR L'UTILISATEUR dans Supabase > SQL Editor. Additif, non destructif.
alter table public.rapro_sheets
  add column if not exists late_arrivals integer not null default 0;
alter table public.rapro_sheets
  add column if not exists corrections integer not null default 0;
-- corrections peut etre negatif -> AUCUNE contrainte >= 0.
```

Reporter aussi ces deux colonnes dans la définition « source » de
`supabase/rapro_sheets.sql` (bloc `create table`), pour cohérence, sans
réintroduire de `drop`.

### 2. Types (types.ts)

Ajouter aux interfaces existantes :

```ts
export interface DbRaproSheet {
  // … existant
  late_arrivals: number
  corrections: number
}
export interface RaproSheet {
  // … existant
  lateArrivals: number
  corrections: number
}
```

### 3. Service (service.ts)

- `fetchSheet` : ajouter `late_arrivals, corrections` au `select`.
- `toRaproSheet` : mapper `lateArrivals: row.late_arrivals`, `corrections: row.corrections`.
- Nouveau setter (l'upsert ne touche que les colonnes du payload → n'écrase pas le commentaire ni le statut) :

```ts
export async function saveSheetNumbers(
  reportDate: string,
  numbers: { late_arrivals: number; corrections: number },
): Promise<void> {
  const { error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .upsert({ report_date: reportDate, ...numbers }, { onConflict: 'report_date' })
  if (error) throw error
}
```

## Ordre d'exécution

1. Rédiger la migration ; **l'utilisateur l'exécute** dans le SQL Editor.
2. Étendre `types.ts`, puis `fetchSheet`/`toRaproSheet` + `saveSheetNumbers` dans `service.ts`.
3. `npx tsc --noEmit`.

## Critère de validation

- `fetchSheet` renvoie `lateArrivals`/`corrections` (0 par défaut sur une feuille neuve).
- `saveSheetNumbers` n'écrase ni le commentaire ni le statut de clôture (upsert partiel).
- Migration **additive** (aucune perte) ; `rapro_rooms` non touché.
- `npx tsc --noEmit` vert.

## Contrôle /borg

Étape critique (schéma DB — `rapro_sheets`). Auditer après exécution :

- Migration **additive** uniquement (`add column if not exists`), aucun `drop`, aucune perte de données ; `rapro_rooms` intact.
- `corrections` et `late_arrivals` bien `integer` **signés** (pas de check >= 0 qui bloquerait une correction négative).
- Cohérence colonnes SQL ↔ `DbRaproSheet` (TS) ; `RaproSheet` expose bien les deux champs.
- RLS inchangée (écriture super/admin) ; l'upsert partiel de `saveSheetNumbers` ne régresse pas `saveComment`/`validateSheet`.
