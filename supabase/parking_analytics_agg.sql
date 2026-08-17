-- =============================================================================
-- Parking — VUES d'agrégation pour l'analytique (et la bande RepJour)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- BUT (performance) : les écrans analytique + la bande RepJour rechargeaient
-- TOUTES les réservations (tout l'historique) pour les réduire en JS. On pré-agrège
-- côté base. Le PLANNING `/parking` (drag/drop, temps réel) N'EST PAS concerné : il
-- garde `fetchReservations` (lignes brutes) + son abonnement realtime. On ne touche
-- donc NI la table, NI la publication realtime — uniquement deux vues en lecture.
--
-- security_invoker = true : les vues s'exécutent avec les droits de l'appelant → la
-- RLS de `parking_reservations` s'applique telle quelle. Aucune donnée nominative
-- sensible ici (juste des comptes et le prénom n'est pas exposé par ces vues).
--
-- Particularité parking : une réservation COUVRE PLUSIEURS JOURS (start_date +
-- nights). L'occupation d'un jour dépend de toutes les résas qui le chevauchent →
-- on « déplie » chaque réservation en une ligne par jour couvert (generate_series),
-- ce qu'un simple GROUP BY ne saurait faire.
-- =============================================================================

-- --- Vue 1 : agrégat par jour d'ARRIVÉE (start_date) -------------------------
-- Alimente l'analytique ANNUEL (comptes par mois d'arrivée) et le nombre d'impayés
-- du mois. Une ligne par start_date.
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

grant select on public.parking_arrivals_agg to authenticated;

-- --- Vue 2 : occupation RÉELLE par jour de calendrier ------------------------
-- Alimente l'analytique MENSUEL (occupation jour par jour) et la bande RepJour.
-- Chaque réservation est dépliée sur [start_date, start_date + nights - 1] (une
-- demi-journée d'arrivée l'après-midi, de départ le matin → le jour de départ
-- start_date+nights n'est PAS occupé, il n'est que « départ »). Une ligne par jour
-- ayant au moins une occupation, une arrivée OU un départ (les jours totalement
-- vides sont complétés à zéro côté client).
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

grant select on public.parking_daily_occupation to authenticated;
