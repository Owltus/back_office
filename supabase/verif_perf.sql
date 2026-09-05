-- =============================================================================
-- VÉRIFICATION PERFORMANCE — objets du plan perf-resilience-2026-09-05
--
-- LECTURE SEULE (catalogues uniquement, aucune écriture). Même forme que
-- verif_complet.sql : un tableau (controle, verdict) OK/KO + RESULTAT GLOBAL.
-- Exécution : `supabase db query --linked -f supabase/verif_perf.sql`.
--
-- Garde-fous inclus contre un « revert silencieux » : les policies SELECT des
-- tables de page doivent rester enveloppées en `(select …)`, et aucune ne doit
-- redevenir `using (true)`.
-- =============================================================================

with checks(ordre, controle, ok) as (
  values
    (1, 'get_user_role : STABLE',
      (select provolatile from pg_proc
       where pronamespace='public'::regnamespace and proname='get_user_role') = 's'),
    (2, 'get_user_role : security definer + search_path fige',
      (select prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=public%'
       from pg_proc
       where pronamespace='public'::regnamespace and proname='get_user_role')),
    (3, 'get_page_level / is_admin : STABLE',
      (select count(*) from pg_proc
       where pronamespace='public'::regnamespace
         and proname in ('get_page_level','is_admin') and provolatile='s') = 2),
    (4, 'pdj_service_dates : vue presente, security_invoker',
      (select count(*) from pg_class
       where relnamespace='public'::regnamespace and relname='pdj_service_dates'
         and relkind='v'
         and coalesce(array_to_string(reloptions, ','), '') ilike '%security_invoker=true%') = 1),
    (5, 'pdj_service_dates : anon sans privilege',
      (select count(*) from information_schema.role_table_grants
       where table_schema='public' and table_name='pdj_service_dates'
         and grantee='anon') = 0),
    (6, 'pdj_service_dates : authenticated en lecture',
      (select count(*) from information_schema.role_table_grants
       where table_schema='public' and table_name='pdj_service_dates'
         and grantee='authenticated' and privilege_type='SELECT') = 1),
    (7, 'policies SELECT des tables de page : toutes enveloppees (select …)',
      (select count(*) from pg_policies
       where schemaname='public' and cmd='SELECT'
         and tablename in ('parking_reservations','rapro_rooms','rapro_sheets',
                           'pdj_breakfasts','caisse_sheets','caisse_cautions',
                           'daily_reports','forecast_days','budget','pms_daily_metrics')
         and qual ilike '%get_page_level(%'
         and qual not ilike '%( select%') = 0),
    (8, 'aucune policy using(true) sur les tables de page',
      (select count(*) from pg_policies
       where schemaname='public'
         and tablename in ('parking_reservations','rapro_rooms','rapro_sheets',
                           'pdj_breakfasts','caisse_sheets','caisse_cautions',
                           'daily_reports','forecast_days','budget','pms_daily_metrics',
                           'profiles','user_page_permissions')
         and regexp_replace(coalesce(qual,''), '\s', '', 'g') = 'true') = 0),
    (9, 'index attendus presents (etat du 2026-09-05)',
      (select count(*) from pg_indexes
       where schemaname='public' and indexname in (
         'parking_reservations_spot_date_idx','parking_reservations_no_overlap',
         'pdj_breakfasts_service_date_idx','pdj_breakfasts_service_date_room_key',
         'rapro_rooms_report_date_room_key','rapro_sheets_report_date_key',
         'caisse_sheets_report_date_idx','caisse_sheets_report_date_shift_key',
         'daily_reports_date_key','idx_daily_reports_month',
         'forecast_days_date_key','idx_forecast_days_month',
         'budget_year_month_key','user_page_permissions_pkey','profiles_pkey')) = 15)
)
select controle,
       case when ok then 'OK' else 'KO' end as verdict
from (
  select ordre, controle, ok from checks
  union all
  select 999,
    'RESULTAT GLOBAL : ' ||
      case when bool_and(ok) then 'TOUT EST EN PLACE'
           else (count(*) filter (where not ok))::text || ' controle(s) en echec' end,
    bool_and(ok)
  from checks
) t
order by ordre;
