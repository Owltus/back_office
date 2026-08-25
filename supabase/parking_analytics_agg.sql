-- =============================================================================
-- Parking — VUES d'agrégation pour l'analytique (et la bande RepJour)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- parking_status_gratuite.sql et parking_tarifs.sql (la vue 1 rejoint
-- parking_tarifs pour le calcul du CA).
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
--
-- Statut 'gratuite' (2026-08-25) : contrairement à 'employe' (exclu de TOUT),
-- 'gratuite' reste inclus dans les totaux généraux (reservations/nights/
-- client_nights/occupied/occupied_client/arrivals/departures) — seul
-- `status <> 'employe'` filtre, inchangé. Une colonne dédiée par vue
-- (`free`/`free_nights` sur la vue 1, `occupied_free` sur la vue 2) isole en
-- plus le sous-total gratuité. CA (`ca_ht`/`ca_ttc`, vue 1 uniquement) : ne
-- porte que sur `reserve`/`paye`/`checkout` — ni `employe` (jamais facturé)
-- ni `gratuite` (gratuite par définition) — au tarif en vigueur à la date
-- d'ARRIVÉE de la réservation (`parking_tarifs`, table versionnée dans le
-- temps : un changement de prix futur ne modifie jamais un CA déjà calculé
-- sur une période passée).
-- =============================================================================

-- --- Vue 1 : agrégat par jour d'ARRIVÉE (start_date) -------------------------
-- Alimente l'analytique ANNUEL (comptes par mois d'arrivée), le nombre d'impayés
-- du mois, et désormais la gratuité et le CA. Une ligne par start_date.
create or replace view public.parking_arrivals_agg
with (security_invoker = true) as
select
  r.start_date::text                                            as start_date,
  count(*)::int                                                 as reservations,
  coalesce(sum(r.nights), 0)::int                               as nights,
  coalesce(sum(r.nights) filter (where r.spot < 13), 0)::int    as client_nights,
  count(*) filter (where r.status = 'paye')::int                 as paid,
  count(*) filter (where r.status = 'reserve')::int              as reserved,
  count(*) filter (where r.status = 'checkout')::int             as unpaid,
  count(*) filter (where r.status = 'gratuite')::int             as free,
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
    count(distinct spot)::int                                     as occupied,
    count(distinct spot) filter (where spot < 13)::int            as occupied_client,
    count(distinct spot) filter (where status = 'gratuite')::int  as occupied_free
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
  coalesce(dep.departures, 0)       as departures,
  -- Colonne AJOUTÉE EN FIN de liste (pas insérée entre occupied_client et
  -- arrivals) : `create or replace view` interdit de changer la position
  -- d'une colonne existante ("cannot change name of view column 'arrivals'
  -- to 'occupied_free'") — seul un ajout strictement en dernière position
  -- est autorisé sans `drop view` préalable.
  coalesce(occ.occupied_free, 0)    as occupied_free
from spine s
left join occ on occ.day = s.day
left join arr on arr.day = s.day
left join dep on dep.day = s.day;

grant select on public.parking_daily_occupation to authenticated;

-- Requêtes de contrôle :
-- select * from public.parking_arrivals_agg order by start_date desc limit 5;
-- select * from public.parking_daily_occupation order by date desc limit 5;
