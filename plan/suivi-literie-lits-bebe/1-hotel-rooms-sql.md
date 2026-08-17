# Étape 1 — Table `hotel_rooms` (état permanent par chambre)

## Objectif

Créer la première table du projet à porter un attribut **permanent** par
chambre physique (aucun précédent : `rapro_rooms`/`pdj_breakfasts` ne portent
que des attributs journaliers). À l'issue, chaque numéro de chambre a un
statut « literie synthétique installée : oui/non » lisible en base, avec les
80 chambres pré-remplies.

## Contexte

Source canonique des 80 numéros : `src/lib/hotel/rooms.ts` (`ALL_ROOMS`),
déjà consommée par `/rapro` et `/pdj`. Aucune table Supabase ne liste
aujourd'hui les chambres — `hotel_config` n'est qu'un compteur global. Le seed
initial doit donc reprendre exactement les plages de `ALL_ROOMS` :
102-114, 201-214, 301-314, 401-414, 501-514, 621-631 (80 chambres).

## Fichier(s) impacté(s)

- `supabase/hotel_rooms.sql` (nouveau) — table + trigger d'estampillage + seed

## Travail à réaliser

### 1. Table

```sql
create table if not exists public.hotel_rooms (
  room                 smallint primary key,
  literie_synthetique  boolean not null default false,
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);
```

### 2. Trigger d'estampillage serveur

Modèle `caisse_stamp()` simplifié (pas de notion de validation ici, juste
`updated_at`/`updated_by` non falsifiables) :

```sql
create or replace function public.hotel_rooms_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists hotel_rooms_stamp on public.hotel_rooms;
create trigger hotel_rooms_stamp
  before insert or update on public.hotel_rooms
  for each row execute function public.hotel_rooms_stamp();
```

### 3. Seed des 80 chambres

Insertion idempotente (`on conflict (room) do nothing`) des plages de
`ALL_ROOMS`, littéralement recopiées de `src/lib/hotel/rooms.ts` pour rester
synchronisées :

```sql
insert into public.hotel_rooms (room)
select generate_series(102, 114)
union all select generate_series(201, 214)
union all select generate_series(301, 314)
union all select generate_series(401, 414)
union all select generate_series(501, 514)
union all select generate_series(621, 631)
on conflict (room) do nothing;
```

### 4. RLS

`enable row level security`, **sans policy dans ce fichier** — les policies
vivent dans `page_permissions_rls*.sql` (autorité unique, cf. étape 5).

## Ordre d'exécution

1. L'utilisateur exécute `hotel_rooms.sql` dans Supabase → SQL Editor.
2. Vérifier le compte de lignes avant d'ajouter les policies (étape 5),
   sinon la table est illisible depuis l'app entre les deux étapes (attendu,
   pas bloquant côté SQL).

## Critère de validation

- `select count(*) from public.hotel_rooms` = 80.
- `select room from public.hotel_rooms order by room` correspond exactement à
  `ALL_ROOMS` de `src/lib/hotel/rooms.ts`.
- Réexécution du fichier sans erreur (idempotent : `create table if not
  exists`, seed `on conflict do nothing`).

## Contrôle /borg

Étape critique (CREATE TABLE + trigger en PRODUCTION). Audit post-exécution :
- `search_path = public` figé sur `hotel_rooms_stamp()`.
- `updated_by` n'est jamais acceptable depuis le client (toujours écrasé par
  le trigger, y compris à l'INSERT).
- Aucune policy créée dans ce fichier (RLS activée mais vide tant que
  l'étape 5 n'est pas jouée — pas de lecture ouverte par erreur).
- Le seed ne produit ni doublon ni trou par rapport à `ALL_ROOMS`.
