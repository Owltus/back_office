# Étape 1 — Statut `employe` côté SQL

## Objectif

Autoriser la valeur `'employe'` dans la colonne `status` de
`parking_reservations`, et exclure cette valeur des deux vues d'agrégation
analytique pour que le planning continue de la représenter mais que les
pages analytiques ne la comptent plus.

## Fichier(s) impacté(s)

- `supabase/parking_status_employe.sql` (nouveau)
- `supabase/parking_analytics_agg.sql` (modifié — `create or replace view`,
  donc rejeu du fichier complet sans danger)

## Travail à réaliser

### 1. Nouveau fichier — extension de la contrainte de statut

Reprend le pattern déjà utilisé dans le projet pour ce type d'évolution
(cf. `supabase/rapro_rooms_status_non_vendue.sql` : `drop constraint if
exists` + `add constraint`, idempotent par construction).

```sql
-- =============================================================================
-- Parking — nouveau statut 'employe' (véhicule du personnel de l'hôtel).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- Reste un STATUT DE RÉSERVATION comme les autres (visible et cyclable dans
-- le planning /parking) mais est explicitement exclu des vues analytiques
-- (voir parking_analytics_agg.sql) : une voiture d'employé n'est pas une
-- occupation client et ne doit pas gonfler le TO / captage analytique.
--
-- À ne pas confondre avec FIRST_STAFF_SPOT (places 13 & 14, tampon
-- "personnel" au niveau de la PLACE physique, mécanisme différent et déjà
-- existant) : 'employe' est un statut de RÉSERVATION, posable sur n'importe
-- quelle place 1 à 14.
--
-- Idempotent : drop/add constraint rejouable sans dommage.
-- =============================================================================
alter table public.parking_reservations
  drop constraint if exists parking_reservations_status_check;

alter table public.parking_reservations
  add constraint parking_reservations_status_check
  check (status in ('reserve', 'paye', 'checkout', 'employe'));
```

### 2. Vues analytiques — exclure `status = 'employe'`

Éditer `supabase/parking_analytics_agg.sql` en place (le fichier est déjà
conçu pour être rejoué : `create or replace view`).

**Vue 1 — `parking_arrivals_agg`** : ajouter `where status <> 'employe'`
avant le `group by` (exclut la réservation employé de `reservations`,
`nights`, `client_nights` — elle n'apparaissait déjà dans aucune des
colonnes `paid`/`reserved`/`unpaid`, qui restent inchangées) :

```sql
create or replace view public.parking_arrivals_agg
with (security_invoker = true) as
select
  start_date::text                                      as start_date,
  count(*)::int                                         as reservations,
  coalesce(sum(nights), 0)::int                         as nights,
  coalesce(sum(nights) filter (where spot < 13), 0)::int as client_nights,
  count(*) filter (where status = 'paye')::int          as paid,
  count(*) filter (where status = 'reserve')::int       as reserved,
  count(*) filter (where status = 'checkout')::int      as unpaid
from public.parking_reservations
where status <> 'employe'
group by start_date;
```

**Vue 2 — `parking_daily_occupation`** : trois sous-requêtes lisent
directement `parking_reservations` (`expanded`, `arr`, `dep`) — les trois
doivent exclure `employe` pour que `occupied`, `occupied_client`,
`arrivals` et `departures` restent cohérents entre eux :

```sql
create or replace view public.parking_daily_occupation
with (security_invoker = true) as
with expanded as (
  select
    spot,
    generate_series(
      start_date::date,
      start_date::date + (nights - 1),
      interval '1 day'
    )::date as day
  from public.parking_reservations
  where nights >= 1
    and status <> 'employe'
),
occ as (
  select
    day,
    count(distinct spot)::int                            as occupied,
    count(distinct spot) filter (where spot < 13)::int   as occupied_client
  from expanded
  group by day
),
arr as (
  select start_date::date as day, count(*)::int as arrivals
  from public.parking_reservations
  where status <> 'employe'
  group by start_date::date
),
dep as (
  select (start_date::date + nights) as day, count(*)::int as departures
  from public.parking_reservations
  where status <> 'employe'
  group by (start_date::date + nights)
),
spine as (
  select day from occ
  union
  select day from arr
  union
  select day from dep
)
select
  s.day::text                       as date,
  coalesce(occ.occupied, 0)         as occupied,
  coalesce(occ.occupied_client, 0)  as occupied_client,
  coalesce(arr.arrivals, 0)         as arrivals,
  coalesce(dep.departures, 0)       as departures
from spine s
left join occ on occ.day = s.day
left join arr on arr.day = s.day
left join dep on dep.day = s.day;
```

Le reste du fichier (en-tête de commentaires, `grant select`) est inchangé.

## Ordre d'exécution

1. Créer `supabase/parking_status_employe.sql`.
2. Éditer `supabase/parking_analytics_agg.sql` (les deux vues).
3. L'utilisateur exécute les deux fichiers dans Supabase → SQL Editor, dans
   cet ordre (la contrainte doit accepter `'employe'` avant qu'une résa de ce
   statut puisse être insérée par l'étape 2/frontend).

## Critère de validation

- Requête de contrôle après exécution :
  `select conname, pg_get_constraintdef(oid) from pg_constraint where
  conname = 'parking_reservations_status_check';` doit inclure `'employe'`.
- `select viewname from pg_views where viewname in
  ('parking_arrivals_agg', 'parking_daily_occupation');` doit retourner les
  deux vues (aucune erreur de recréation).
- Aucune régression : recharger `/parking/analytique` et
  `/parking/analytique/$year/$month` sur un mois déjà peuplé doit afficher
  des chiffres identiques à avant (aucune résa `employe` n'existe encore).

## Contrôle /borg

`/rodin` a été tenté (skill indisponible dans cet environnement) et le
questionnement socratique a été fait en ligne — voir "Angles à clarifier"
dans l'index. Cette étape est marquée critique car elle modifie une
contrainte `CHECK` (`ALTER TABLE ... CHECK`) sur une table de production.
Points à auditer après exécution du SQL par l'utilisateur :
- La contrainte `parking_reservations_status_check` accepte bien les 4
  valeurs et rejette toute autre valeur.
- Les deux vues se recréent sans erreur et gardent leurs `grant select`.
- Aucune policy RLS ne référence `status` (confirmé en exploration) — pas de
  régression d'accès à vérifier de ce côté.
