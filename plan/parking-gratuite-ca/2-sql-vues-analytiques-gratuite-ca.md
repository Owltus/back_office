# Étape 2 — SQL : vues analytiques (gratuité incluse + CA)

## Objectif

Mettre à jour `parking_arrivals_agg` et `parking_daily_occupation` pour :
(a) ne plus exclure le statut `gratuite` des totaux généraux (seul `employe`
reste exclu), (b) ajouter une colonne dédiée « gratuité » (comptage +
nuitées) sur le modèle de `paid`/`reserved`/`unpaid`, (c) ajouter le calcul
du CA HT/TTC, au tarif en vigueur à la date d'arrivée de chaque réservation,
sur les seules nuitées facturables (`reserve`/`paye`/`checkout`).

## Contexte

Dépend de l'étape 1 (`parking_tarifs` doit exister). Le CA est attribué au
tarif en vigueur à la **date d'arrivée** de la réservation, pour la totalité
de ses nuitées — même simplification que celle déjà en place pour les
nuitées elles-mêmes (une réservation à cheval sur deux mois compte déjà
toutes ses nuits dans le mois d'arrivée, jamais réparties).

## Fichier(s) impacté(s)

- `supabase/parking_analytics_agg.sql` (modifié)

## Travail à réaliser

### 1. Remplacer `parking_arrivals_agg`

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Idempotent (create or replace view), non destructif.

create or replace view public.parking_arrivals_agg
with (security_invoker = true) as
select
  r.start_date::text                                          as start_date,
  count(*)::int                                                as reservations,
  coalesce(sum(r.nights), 0)::int                              as nights,
  coalesce(sum(r.nights) filter (where r.spot < 13), 0)::int   as client_nights,
  count(*) filter (where r.status = 'paye')::int                as paid,
  count(*) filter (where r.status = 'reserve')::int             as reserved,
  count(*) filter (where r.status = 'checkout')::int            as unpaid,
  count(*) filter (where r.status = 'gratuite')::int            as free,
  coalesce(sum(r.nights) filter (where r.status = 'gratuite'), 0)::int as free_nights,
  coalesce(sum(r.nights * t.price_ttc / (1 + t.vat_rate / 100.0))
    filter (where r.status in ('reserve', 'paye', 'checkout')), 0)::numeric(12, 2) as ca_ht,
  coalesce(sum(r.nights * t.price_ttc)
    filter (where r.status in ('reserve', 'paye', 'checkout')), 0)::numeric(12, 2) as ca_ttc
from public.parking_reservations r
left join lateral (
  select price_ttc, vat_rate
  from public.parking_tarifs
  where effective_from <= r.start_date::date
  order by effective_from desc
  limit 1
) t on true
where r.status <> 'employe'
group by r.start_date;

grant select on public.parking_arrivals_agg to authenticated;
```

Différences avec la vue actuelle : `where status <> 'employe'` INCHANGÉ
(donc `gratuite` reste inclus dans `reservations`/`nights`/`client_nights` —
c'est le comportement demandé), ajout de `free`/`free_nights`, ajout de
`ca_ht`/`ca_ttc` via le `left join lateral` sur `parking_tarifs` (une
réservation sans tarif en vigueur à sa date — cas impossible après l'étape 1
si l'amorçage a bien été joué — contribue 0 au CA plutôt que de faire
échouer la requête, grâce au `left join`).

### 2. Remplacer `parking_daily_occupation`

```sql
create or replace view public.parking_daily_occupation
with (security_invoker = true) as
with expanded as (
  select
    spot,
    status,
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
    count(distinct spot)::int                                              as occupied,
    count(distinct spot) filter (where spot < 13)::int                     as occupied_client,
    count(distinct spot) filter (where status = 'gratuite')::int           as occupied_free
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
  coalesce(occ.occupied_free, 0)    as occupied_free,
  coalesce(arr.arrivals, 0)         as arrivals,
  coalesce(dep.departures, 0)       as departures
from spine s
left join occ on occ.day = s.day
left join arr on arr.day = s.day
left join dep on dep.day = s.day;

grant select on public.parking_daily_occupation to authenticated;
```

Seul ajout : `status` dans le CTE `expanded` (nécessaire pour filtrer
`occupied_free`) et la colonne `occupied_free` dans `occ` puis dans le
`select` final. Le reste est identique à la vue actuelle.

## Ordre d'exécution

1. Remplacer intégralement le contenu de `supabase/parking_analytics_agg.sql`
   par les deux blocs ci-dessus (dans cet ordre : arrivals_agg puis
   daily_occupation, comme la structure actuelle du fichier).
2. L'utilisateur exécute le fichier dans Supabase → SQL Editor.

## Critère de validation

- `select * from public.parking_arrivals_agg limit 5` renvoie les colonnes
  `free`, `free_nights`, `ca_ht`, `ca_ttc` sans erreur.
- `select * from public.parking_daily_occupation limit 5` renvoie la colonne
  `occupied_free` sans erreur.
- Sur un jour de test avec une réservation `gratuite` : `occupied` et
  `occupied_client` (si spot < 13) l'incluent désormais, ET `occupied_free`
  vaut au moins 1 ce jour-là.
- Sur une réservation `employe` de test : toujours absente de toutes les
  colonnes (comportement inchangé).
- `ca_ht` × (1 + `vat_rate`/100) = `ca_ttc` à l'arrondi près, pour une ligne
  de test connue (ex. 1 réservation `paye`, 2 nuits, tarif 20 €/10 % →
  `ca_ttc` = 40.00, `ca_ht` = 36.36).

## Contrôle /borg

Étape critique : remplacement de vues `security_invoker` déjà en production,
consommées par le code TS existant (étape 4). À auditer après exécution :

- Aucune régression sur les colonnes déjà consommées par
  `src/lib/parking/service.ts`/`analytics.ts` avant ce chantier
  (`reservations`, `nights`, `client_nights`, `paid`, `reserved`, `unpaid`,
  `occupied`, `occupied_client`, `arrivals`, `departures`) — mêmes noms,
  mêmes types, même sémantique.
- Le `left join lateral` sur `parking_tarifs` ne doit jamais faire échouer
  la requête même si la table est vide (comportement `left join` : NULL au
  lieu d'erreur, `coalesce(..., 0)` ramène à 0).
- `employe` reste exclu de TOUTES les colonnes des deux vues, sans
  exception — c'est le seul statut qui doit rester invisible en analytique.
- Pas de duplication de lignes dans `parking_arrivals_agg` liée au `left
  join lateral` (le `limit 1` dans le sous-select garantit au plus une ligne
  de tarif par réservation).
