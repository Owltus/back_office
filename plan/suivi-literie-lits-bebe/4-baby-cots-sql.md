# Étape 4 — Ressources et planning lits parapluie bébé

## Objectif

Créer les tables du planning lits bébé : les ressources elles-mêmes (nombre
ajustable, décision D6) et leurs assignations à des chambres sur une plage de
dates, avec réplication temps réel (publication `postgres_changes`). À
l'issue, la base peut porter un planning à la Parking, mais avec un nombre de
lignes ajustable sans déploiement.

## Contexte

Le rapport d'exploration sur `/parking` est explicite : `SPOTS = 14` est une
constante TS figée, la table `parking_reservations` ne référence aucune
entité "ressource" séparée — ce pattern ne permet PAS nativement un nombre
ajustable. D6 (index) retient donc une vraie table `baby_cots` plutôt qu'un
entier de config, pour que le nombre de lignes du planning se déduise d'un
`count(active)` et que chaque lit soit identifiable (désactivable sans être
supprimé, ex. en réparation).

## Fichier(s) impacté(s)

- `supabase/baby_cots.sql` (nouveau) — ressources + assignations + realtime
  + RLS (policies en étape 5)

## Travail à réaliser

### 1. Ressources

```sql
create table if not exists public.baby_cots (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.baby_cots (label)
select 'Lit ' || n from generate_series(1, 4) as n
where not exists (select 1 from public.baby_cots);
```

Seed à 4 lignes actives (`Lit 1`..`Lit 4`), conforme au parc actuel — ajouter
ou désactiver une ligne suffit ensuite à ajuster le nombre, sans migration.

### 2. Assignations (planning)

```sql
create table if not exists public.baby_cot_assignments (
  id          uuid primary key default gen_random_uuid(),
  cot_id      uuid not null references public.baby_cots(id),
  room        smallint not null references public.hotel_rooms(room),
  guest_name  text not null default '',
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  comment     text not null default '',
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists baby_cot_assignments_cot_idx
  on public.baby_cot_assignments (cot_id, start_date);
```

Anti-chevauchement (deux assignations sur le même lit qui se recouvrent) géré
**côté client**, comme `hasOverlap` dans `lib/parking/model.ts` — pas de
contrainte d'exclusion PostgreSQL, pour rester cohérent avec le pattern
existant (cf. étape 9).

### 3. Trigger `updated_at`

```sql
create or replace function public.baby_cot_assignments_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.created_by := coalesce(old.created_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists baby_cot_assignments_touch on public.baby_cot_assignments;
create trigger baby_cot_assignments_touch
  before insert or update on public.baby_cot_assignments
  for each row execute function public.baby_cot_assignments_touch();
```

### 4. Publication temps réel

```sql
alter publication supabase_realtime add table public.baby_cot_assignments;
```

(vérifier au préalable qu'elle n'y est pas déjà — `alter publication ...
add table` échoue si la table est déjà membre ; entourer d'un bloc
`do $$ ... exception when duplicate_object then null; end $$` comme fait pour
`parking_reservations`, cf. `parking_realtime.sql`).

### 5. RLS

`enable row level security` sur les deux tables, sans policy dans ce fichier
(étape 5).

## Ordre d'exécution

1. L'utilisateur exécute `baby_cots.sql` (dépend de `hotel_rooms.sql`, étape
   1, pour la FK `room` de `baby_cot_assignments`).
2. Vérifier dans le dashboard Supabase → Database → Replication que
   `baby_cot_assignments` apparaît bien dans `supabase_realtime`.

## Critère de validation

- `select count(*) from baby_cots where active` = 4.
- `select * from baby_cot_assignments` vide au départ, insertion manuelle
  test possible (FK `room`/`cot_id` valides exigées).
- Une désactivation d'un lit (`update baby_cots set active = false where
  id = ...`) laisse ses assignations passées intactes (pas de cascade).
- Réexécution du fichier sans erreur (bloc `alter publication` idempotent).

## Contrôle /borg

Étape critique (CREATE TABLE ×2 + realtime + RLS en PRODUCTION, >5 éléments
touchés en comptant les policies de lecture/écriture ajoutées en étape 5).
Audit post-exécution :
- `search_path = public` figé sur le trigger.
- Aucune policy créée dans ce fichier (RLS activée mais vide tant que
  l'étape 5 n'est pas jouée).
- La table est bien dans `supabase_realtime` sans erreur de duplication au
  réexécution.
- `created_by` non falsifiable (toujours dérivé côté serveur).
