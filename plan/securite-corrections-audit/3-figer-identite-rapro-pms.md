# Étape 3 — Figer les colonnes d'identité (rapro + pms)

## Objectif

Neutraliser F2 sur les trois autres tables applicatives : `rapro_sheets` (`validated_by`, `created_by`), `rapro_rooms` (`created_by`), `pms_daily_metrics` (`imported_by`). Chaque colonne d'identité est estampillée serveur (`auth.uid()`), non plus acceptée du client.

## Contexte

Aucune de ces tables ne lie ses colonnes `*_by` à `auth.uid()` (ni `WITH CHECK`, ni trigger — les triggers actuels ne posent que `updated_at`). Un super/admin peut donc attribuer une clôture (`rapro_sheets.validated_by`, envoyé à `src/lib/rapro/service.ts:126`), une création ou un import à l'UUID d'un tiers. `rapro_sheets` n'a pas de verrou temporel (réouverture libre), donc seul le champ signature est en jeu, pas une frontière d'accès — d'où une priorité P1.

## Fichier(s) impacté(s)

- `supabase/rapro_sheets.sql`
- `supabase/rapro_rooms.sql`
- `supabase/pms_daily_metrics.sql`

(scripts réécrits, EXÉCUTÉS PAR L'UTILISATEUR ; idempotents)

## Travail à réaliser

### 1. `rapro_sheets` — estampiller `validated_by`/`validated_at` + figer `created_by`

```sql
create or replace function public.rapro_sheets_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'validated' then
      new.validated_at := now(); new.validated_by := auth.uid();
    else
      new.validated_at := null; new.validated_by := null;
    end if;
  else
    new.created_by := old.created_by;
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now(); new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at; new.validated_by := old.validated_by;
      end if;
    else
      new.validated_at := null; new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rapro_sheets_set_updated_at on public.rapro_sheets;
drop trigger if exists rapro_sheets_stamp on public.rapro_sheets;
create trigger rapro_sheets_stamp
  before insert or update on public.rapro_sheets
  for each row execute function public.rapro_sheets_stamp();
```

### 2. `rapro_rooms` — figer `created_by`

```sql
create or replace function public.rapro_rooms_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := auth.uid();
  else new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists rapro_rooms_set_updated_at on public.rapro_rooms;
drop trigger if exists rapro_rooms_stamp on public.rapro_rooms;
create trigger rapro_rooms_stamp
  before insert or update on public.rapro_rooms
  for each row execute function public.rapro_rooms_stamp();
```

### 3. `pms_daily_metrics` — figer `imported_by`

```sql
create or replace function public.pms_daily_metrics_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.imported_by := auth.uid();
  else new.imported_by := old.imported_by;
  end if;
  return new;
end;
$$;

drop trigger if exists pms_daily_metrics_set_updated_at on public.pms_daily_metrics;
drop trigger if exists pms_daily_metrics_stamp on public.pms_daily_metrics;
create trigger pms_daily_metrics_stamp
  before insert or update on public.pms_daily_metrics
  for each row execute function public.pms_daily_metrics_stamp();
```

Note : ces trois tables partageaient la fonction `rapro_set_updated_at()`. On la remplace par une fonction dédiée PAR table (estampillage spécifique) et on retire le trigger `updated_at` seul. `rapro_set_updated_at()` peut rester en base (inutilisée) sans risque.

## Ordre d'exécution

1. Réécrire les trois scripts SQL (assistant).
2. L'utilisateur exécute les trois dans Supabase → SQL Editor.
3. Vérifier (critères).

## Critère de validation

- `rapro_sheets.validated_by` reflète l'appelant réel à la clôture ; un UUID tiers envoyé par le client est ignoré.
- `created_by` (rapro) et `imported_by` (pms) reflètent l'appelant ; non réécrivables après création.
- Import PMS et clôture rapro fonctionnent toujours ; `updated_at` toujours posé.
- Scripts idempotents.

## Contrôle /borg

Étape critique (`CREATE TRIGGER` sur trois tables). /borg doit auditer : aucune régression sur `updated_at` ; l'import PMS (upsert de N lignes) reste correct ; la clôture/réouverture rapro reste fonctionnelle ; les colonnes d'identité ne sont plus falsifiables ; pas de collision de noms de triggers/fonctions avec l'existant.
