-- ---------------------------------------------------------------------------
-- public.repjour_dashboard(date) — tout le tableau de bord en UN aller-retour
-- 2026-09-23
--
-- SYMPTÔME
--   `/repjour` posait HUIT questions séparées à la base pour afficher une page,
--   plus dix pour la bande transverse. Mesuré en production le 2026-09-22 :
--   les vingt requêtes partaient ensemble et se terminaient ensemble à
--   6 461 ms, le rapport du jour compris — alors qu'il ne dépend que de
--   lui-même.
--
-- CAUSE
--   Ce n'est ni le volume (11,6 Mo de base, 187 lignes dans `daily_reports`)
--   ni la vitesse du SQL. C'est le NOMBRE d'allers-retours. Sur cette instance,
--   un aller-retour coûte ~170 ms à chaud et jusqu'à 1,37 s à froid ; huit
--   allers-retours coûtent donc entre 1,4 s et 11 s de latence pure, pour
--   ~14 ms de calcul réel.
--
-- CORRECTIF
--   Une fonction qui rend le même contenu, en une fois, sous forme de `jsonb`.
--   Mesuré avant écriture : **13,798 ms d'exécution, 17 716 octets de
--   réponse** — soit l'intégralité du tableau de bord.
--
--   Les huit lectures remplacées (`lib/repjour/services/daily.ts`) :
--     fetchReportByDate, fetchBudget, fetchForecastMonthTotal,
--     fetchForecastFreshness, fetchLatestReportOfMonth,
--     fetchPreviousReportInMonth, fetchMonthReports, fetchAvailableDates.
--
-- SÉCURITÉ — le point à ne pas rater
--   `security invoker` : la fonction s'exécute avec les droits de l'APPELANT,
--   donc les RLS de `daily_reports`, `budget` et `forecast_days` s'appliquent
--   exactement comme aujourd'hui. Un compte sans `page:repjour` continue de
--   lire zéro ligne — la fonction ne peut rien montrer que l'appelant ne
--   pouvait déjà lire une requête à la fois.
--
--   Ce n'est donc PAS une « RPC privilégiée » au sens de `CLAUDE.md` : elle n'a
--   rien à faire dans le schéma `private`, et n'a pas besoin de relais. Même
--   nature que `public.dismiss_send_reminder`.
--
--   `search_path` figé à `public, pg_temp` (règle du projet, anti-détournement).
--   `execute` accordé à `authenticated` SEUL, jamais à `anon` ni à PUBLIC.
--
-- ÉQUIVALENCE
--   Chaque champ reproduit la fonction TypeScript qu'il remplace, y compris ses
--   cas limites :
--     * `forecastTotal` vaut `null` quand le mois n'a AUCUNE prévision
--       (fetchForecastMonthTotal renvoie null si `data.length === 0`), et non
--       un objet à zéro — c'est ce qui distingue « pas de prévision » de
--       « prévision à zéro » ;
--     * `forecastFraicheur` ignore les `imported_at` NULL, comme le
--       `.not('imported_at','is',null)` d'origine ;
--     * `rapportPrecedent` est borné au MÊME mois, comme l'exige la carte
--       « pris depuis la veille » (comparer au 30 du mois précédent
--       soustrairait deux totaux mensuels différents) ;
--     * `datesDisponibles` garde le plafond explicite de 5 000
--       (AVAILABLE_DATES_MAX) : un garde-fou de lisibilité, pas une
--       optimisation — sans lui PostgREST tronquait SILENCIEUSEMENT à 1 000 et
--       le calendrier grisait des dates existantes.
--   Les clés sont nommées en français comme le reste du métier ; le mapping
--   vers les types TypeScript est fait côté client.
--
-- INNOCUITÉ
--   Aucune écriture, aucun DDL sur les tables, aucune policy touchée, aucun
--   index créé. `create or replace function` sur un nom neuf : rien n'est
--   remplacé. Retour arrière = `drop function public.repjour_dashboard(date)`,
--   l'ancien chemin (huit lectures) reste entièrement fonctionnel tant que le
--   client ne l'appelle pas.
--
-- VÉRIFICATION (après application)
--   select public.repjour_dashboard('2026-09-21') is not null;      -- t
--   select prosecdef from pg_proc where proname='repjour_dashboard'; -- f (invoker)
--   select has_function_privilege('anon',
--     'public.repjour_dashboard(date)','execute');                   -- f
-- ---------------------------------------------------------------------------

begin;

create or replace function public.repjour_dashboard(p_date date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with reperes as (
    select
      extract(year  from p_date)::int as an,
      extract(month from p_date)::int as mois
  )
  select jsonb_build_object(

    -- fetchReportByDate(date)
    'rapport', (
      select to_jsonb(d) from daily_reports d where d.date = p_date
    ),

    -- fetchBudget(year, month)
    'budget', (
      select to_jsonb(b) from budget b, reperes r
      where b.year = r.an and b.month = r.mois
    ),

    -- fetchForecastMonthTotal(year, month) — null si AUCUNE prévision du mois.
    'forecastTotal', (
      select case when count(*) = 0 then null else jsonb_build_object(
        'occ', coalesce(sum(f.occ), 0),
        'revTTC', coalesce(sum(f.rev_ttc), 0)
      ) end
      from forecast_days f, reperes r
      where f.year = r.an and f.month = r.mois
    ),

    -- fetchForecastFreshness(year, month) — les NULL sont ignorés.
    'forecastFraicheur', (
      select max(f.imported_at)
      from forecast_days f, reperes r
      where f.year = r.an and f.month = r.mois and f.imported_at is not null
    ),

    -- fetchLatestReportOfMonth(year, month)
    'dernierDuMois', (
      select to_jsonb(d) from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois
      order by d.day_of_month desc limit 1
    ),

    -- fetchPreviousReportInMonth(date, year, month) — borné au MÊME mois.
    'rapportPrecedent', (
      select to_jsonb(d) from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois and d.date < p_date
      order by d.date desc limit 1
    ),

    -- fetchMonthReports(year, month)
    'rapportsDuMois', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day_of_month)
      from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois
    ), '[]'::jsonb),

    -- fetchAvailableDates() — plafond explicite, cf. AVAILABLE_DATES_MAX.
    'datesDisponibles', coalesce((
      select jsonb_agg(x.date order by x.date desc)
      from (
        select d.date from daily_reports d
        order by d.date desc limit 5000
      ) x
    ), '[]'::jsonb)
  )
  from reperes;
$$;

comment on function public.repjour_dashboard(date) is
  'Tableau de bord RepJour d''un jour donné, en un seul aller-retour. '
  'Remplace huit lectures (13,8 ms mesurés, 17 ko). security invoker : '
  'les RLS de daily_reports / budget / forecast_days s''appliquent à l''appelant.';

-- `anon` ne doit jamais l'exécuter : la fonction ne lui montrerait rien (RLS),
-- mais la règle du projet est qu'anon n'a AUCUN privilège sur `public`.
revoke all on function public.repjour_dashboard(date) from public;
revoke all on function public.repjour_dashboard(date) from anon;
grant execute on function public.repjour_dashboard(date) to authenticated;

commit;
