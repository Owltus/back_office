# Étape 1 — SQL : table `pdj_breakfasts` + RLS + trigger + purge RGPD

## Objectif

Créer la table applicative `pdj_breakfasts` (une ligne = un couple jour de service + chambre), avec trigger `updated_at`, RLS par rôle (lecture pour tous les connectés, écriture réservée super/admin), et la requête de **purge RGPD** des noms. Le script est **exécuté par l'utilisateur** dans Supabase → SQL Editor.

## Contexte

Réplique du patron `supabase/{parking_realtime,affiche_templates}.sql`. Point RGPD central : `guest_name` est **NULLABLE** (purgé le lendemain) tandis que les colonnes non-PII restent renseignées → les stats survivent à l'anonymisation. Clé métier `(service_date, room)` pour l'upsert idempotent (D5). Champs exploitables selon D3 (ensemble riche recommandé). `get_user_role()` supposée déjà déployée. Fonction trigger **dédiée** `pdj_set_updated_at`.

## Fichier(s) impacté(s)

- `supabase/pdj_breakfasts.sql` (nouveau)

## Travail à réaliser

### 1. Table + index + trigger

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées.
create table if not exists public.pdj_breakfasts (
  id                  uuid primary key default gen_random_uuid(),
  service_date        date not null,                 -- date DU rapport (_YYYYMMDD)
  room                smallint not null,
  guest_name          text,                           -- PII : NULLABLE (purge RGPD J+1)
  status              text not null default '',
  vip                 boolean not null default false,
  adults              smallint not null default 0,
  children            smallint not null default 0,
  guests              smallint not null default 0,    -- = adults + children (recalculé)
  no_of_nights        smallint,
  room_type           text,
  rate_plan           text,                           -- colonne CSV "Rate"
  channel             text,                           -- colonne CSV "TravelAgent"
  company             text,
  guarantee           text,
  payment_type        text,
  addons              text,                           -- "PDJ INCL;TAXE DE SEJOUR 5.72"
  adr                 numeric(8, 2),                  -- prix/nuit  [D3 : garder ?]
  arrival_date        date,                           -- date seule  [D3 : garder ?]
  departure_date      date,                           -- date seule  [D3 : garder ?]
  stay_count          smallint not null default 0,
  breakfasts_included smallint not null default 0,   -- calculé (CSV) : BB1PAX=1 sinon guests
  breakfasts_served   smallint not null default 0,   -- coché par le staff (D4)
  served              boolean not null default false, -- raccourci servi oui/non (D4)
  source_file         text,
  imported_at         timestamptz not null default now(),
  purged_at           timestamptz,                    -- horodatage de l'anonymisation
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (service_date, room)                         -- clé d'upsert (D5)
);

create index if not exists pdj_breakfasts_service_date_idx
  on public.pdj_breakfasts (service_date);

create or replace function public.pdj_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists pdj_breakfasts_set_updated_at on public.pdj_breakfasts;
create trigger pdj_breakfasts_set_updated_at
  before update on public.pdj_breakfasts
  for each row execute function public.pdj_set_updated_at();
```

Si D3 retient un ensemble minimal, retirer `adr`, `arrival_date`, `departure_date`, et une partie des champs canal/tarif.

### 2. RLS

Lecture pour tous les authentifiés ; écriture (insert/update/delete) pour super/admin (D6).

```sql
alter table public.pdj_breakfasts enable row level security;

drop policy if exists "pdj read (authenticated)" on public.pdj_breakfasts;
create policy "pdj read (authenticated)"
  on public.pdj_breakfasts for select to authenticated using (true);

drop policy if exists "pdj insert (super/admin)" on public.pdj_breakfasts;
create policy "pdj insert (super/admin)"
  on public.pdj_breakfasts for insert to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "pdj update (super/admin)" on public.pdj_breakfasts;
create policy "pdj update (super/admin)"
  on public.pdj_breakfasts for update to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "pdj delete (super/admin)" on public.pdj_breakfasts;
create policy "pdj delete (super/admin)"
  on public.pdj_breakfasts for delete to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));
```

L'`upsert` déclenche insert ET update → les deux policies autorisent bien super/admin.

### 3. Purge RGPD des noms (D1)

L'anonymisation est le même UPDATE idempotent, quel que soit le déclencheur. Option A : appelé par l'app au chargement (voir Étape 2/3), en passant explicitement « aujourd'hui Europe/Paris » pour éviter le piège de fuseau (`current_date` est en UTC en base).

```sql
-- Anonymisation : efface le nom des jours passés (garde toutes les stats).
update public.pdj_breakfasts
   set guest_name = null, purged_at = now()
 where service_date < :today   -- :today = date du client (Europe/Paris)
   and guest_name is not null;
```

Option B (durcissement, à confirmer car infra sur base partagée) — si `pg_cron` est activé :

```sql
select cron.schedule('pdj_purge_names', '0 3 * * *', $$
  update public.pdj_breakfasts set guest_name = null, purged_at = now()
   where service_date < current_date and guest_name is not null
$$);
```

## Ordre d'exécution

1. Acter D1, D2, D3, D5.
2. Rédiger `supabase/pdj_breakfasts.sql` (table + trigger + RLS ; champs selon D3).
3. L'utilisateur exécute le script dans Supabase → SQL Editor.
4. Vérifier (lecture seule) : table créée, 4 policies, contrainte unique présente.

## Critère de validation

- Script ré-exécutable sans erreur (second passage OK).
- `guest_name` est nullable ; toutes les colonnes de stats sont NOT NULL ou nullable non-PII.
- `unique (service_date, room)` présent (prérequis de l'upsert `onConflict`).
- `select policyname, cmd from pg_policies where tablename = 'pdj_breakfasts'` liste read + insert/update/delete ; écriture conditionnée par `get_user_role()`.

## Contrôle /borg

Étape critique (CREATE TABLE, CREATE TRIGGER, RLS, UPDATE de purge sur backend partagé). Audit post-exécution :
- Table `public.pdj_breakfasts` sans collision avec les tables existantes (`profiles`, `daily_reports`, `forecast_days`, `budget`, `email_recipients`, `hotel_config`, `audit_log`, `parking_reservations`, `affiche_templates`).
- Fonction trigger dédiée `pdj_set_updated_at` (n'écrase pas `parking_set_updated_at` / `affiche_set_updated_at`).
- `guest_name` bien NULLABLE ; aucune colonne [B] (réfs CB, plaque, accompagnants, `reservation_id`, `confirm_no`, `balance`, notes) n'est présente dans le schéma → minimisation respectée.
- Les 4 policies sont `to authenticated`, écriture = super/admin ; SELECT `using (true)`.
- La requête de purge n'efface QUE `guest_name` (et `purged_at`) : les stats restent intactes.
- Aucune écriture sur les tables partagées ; seule la nouvelle table est créée, par l'utilisateur. Si Option B (`pg_cron`) retenue : confirmée explicitement (infra base partagée).
