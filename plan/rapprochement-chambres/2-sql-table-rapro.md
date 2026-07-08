# Étape 2 — Table `rapro_rooms` + RLS (Supabase)

## Objectif

Créer la table applicative qui persiste, **par jour**, la liste des chambres marquées « non faites », avec les politiques RLS (lecture pour tout authentifié, écriture réservée `super_utilisateur`/`admin`) et un trigger `updated_at` dédié. Le script est **exécuté par l'utilisateur** dans Supabase → SQL Editor ; l'assistant ne l'exécute jamais.

## Contexte

Patron répliqué : `supabase/pdj_breakfasts.sql` et `supabase/caisse_sheets.sql` (tables applicatives NOUVELLES, indépendantes des tables repjour partagées en lecture seule). La fonction `get_user_role()` est **supposée déjà déployée** (assumée par caisse et pdj) — ne pas la recréer.

Cette étape suppose D1 = Option A (persistance). Si D1 = B (état local), **supprimer cette étape**. Le contenu ci-dessous suit D2 = Option A (une ligne par jour, `rooms_not_done` en tableau) : on ne stocke que les exceptions, un seul upsert par sauvegarde. Si D2 = B (une ligne par `(report_date, room)`), calquer plutôt `pdj_breakfasts` (colonne `not_done boolean`, `unique (report_date, room)`).

Nommage aligné sur le front `rapro` (un seul p) : table `rapro_rooms`, trigger `rapro_set_updated_at`.

## Fichier(s) impacté(s)

- `supabase/rapro_rooms.sql` (nouveau)

## Travail à réaliser

### 1. Table + index (D2 = Option A : une ligne par jour)

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées.

create table if not exists public.rapro_rooms (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null,                          -- le jour rapproché
  rooms_not_done integer[] not null default '{}',       -- numéros de chambres cochées « non faites »
  comment       text not null default '',               -- note libre (optionnel, cf. D5)
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (report_date)                                  -- une ligne par jour (clé d'upsert)
);

create index if not exists rapro_rooms_report_date_idx
  on public.rapro_rooms (report_date);
```

### 2. Trigger `updated_at` dédié

```sql
create or replace function public.rapro_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rapro_rooms_set_updated_at on public.rapro_rooms;
create trigger rapro_rooms_set_updated_at
  before update on public.rapro_rooms
  for each row execute function public.rapro_set_updated_at();
```

### 3. RLS (lecture pour tous les authentifiés, écriture super/admin)

```sql
alter table public.rapro_rooms enable row level security;

drop policy if exists "rapro read (authenticated)" on public.rapro_rooms;
create policy "rapro read (authenticated)"
  on public.rapro_rooms for select
  to authenticated using (true);

drop policy if exists "rapro insert (super/admin)" on public.rapro_rooms;
create policy "rapro insert (super/admin)"
  on public.rapro_rooms for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "rapro update (super/admin)" on public.rapro_rooms;
create policy "rapro update (super/admin)"
  on public.rapro_rooms for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "rapro delete (super/admin)" on public.rapro_rooms;
create policy "rapro delete (super/admin)"
  on public.rapro_rooms for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));
```

## Ordre d'exécution

1. Acter D1 (persistance) et D2 (forme de table). Si D1=B, cette étape saute.
2. Rédiger `supabase/rapro_rooms.sql` (les trois blocs, idempotents).
3. **L'utilisateur** exécute le script dans Supabase → SQL Editor.
4. Vérifier en LECTURE SEULE que la table et les policies existent (voir critères).

## Critère de validation

- Le script est **ré-exécutable** sans erreur (tous les `if not exists` / `drop … if exists` en place).
- `select * from public.rapro_rooms limit 1;` fonctionne (table vide au départ).
- `select policyname from pg_policies where tablename = 'rapro_rooms';` renvoie les 4 policies attendues.
- Aucune écriture n'a touché une table partagée (`profiles`, `daily_reports`, `hotel_config`, …).

## Contrôle /borg

Étape critique (DDL + RLS sur Supabase partagé, exécutée par l'utilisateur). Auditer après exécution :

- Table `rapro_rooms` **nouvelle**, aucun renommage/écrasement d'une table existante ; nom de trigger/fonction `rapro_*` sans collision avec `pdj_*` / `caisse_*`.
- Les 4 policies sont `to authenticated`, écriture gardée par `get_user_role() in ('super_utilisateur','admin')`, lecture `using (true)`.
- `get_user_role()` **non redéfinie** par ce script.
- Aucune policy ni DDL n'affecte les tables repjour partagées.
- `unique (report_date)` bien présent (clé d'upsert) ; si D2=B, vérifier `unique (report_date, room)` à la place.
