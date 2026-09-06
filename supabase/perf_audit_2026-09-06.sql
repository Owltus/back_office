-- =============================================================================
-- perf_audit_2026-09-06 — correctifs performance de l'audit du 2026-09-06
-- (plan/correctifs-audit-2026-09-06/2-sql-performance.md)
--
-- Application : `supabase db query --linked -f supabase/perf_audit_2026-09-06.sql`
-- Idempotent, une transaction. Aucune donnée réécrite.
--
-- MESURES DU 2026-09-06 (explain analyze, base au calme) : pdj_daily_agg sur
-- août 2026 = 5,5 ms / 396 blocs ; liste des dates = 5,3 ms. Les moyennes de
-- 285-339 ms de pg_stat_statements viennent de la période de saturation CPU
-- d'avant la panne du 2026-09-05 (statistiques cumulées depuis mars). La
-- colonne générée `code` envisagée n'apporterait donc rien de mesurable : NON
-- retenue (elle aurait aussi couplé la base au JS breakfastCode).
--
-- Retenu :
--   (1) index PARTIEL pour la purge RGPD des noms : `update … where
--       service_date < $1 and guest_name is not null` faisait un Seq Scan de
--       la table entière (1 906 appels, 152 ms de moyenne, 0 ligne à purger
--       99 % du temps). L'index ne couvre que les ~100 lignes à nom non nul.
--       Côté client, la purge ne part plus qu'une fois par jour et par poste
--       (étape 3).
--   (2) vue pdj_daily_agg : privilèges par défaut jamais révoqués (anon ET
--       authenticated avaient ALL) → select seul pour authenticated, rien
--       pour anon (même hygiène que pdj_service_dates le 2026-09-05).
--   (3) RPC `get_my_access()` : profil + droits en UN appel au démarrage de
--       l'app (les deux lectures séparées = 68 % des requêtes REST).
--       security INVOKER : `profiles` et `user_page_permissions` ont déjà
--       leurs policies « self » ; la fonction n'ajoute aucun droit.
--       `profile` = null si le profil n'existe plus (éjection côté client),
--       `permissions` = tableau (jamais null ; [] = aucun droit, légitime).
--   (4) idle_in_transaction_session_timeout = 60 s pour les rôles de l'API
--       (contexte `user`, comme Supabase le fait pour supabase_auth_admin) :
--       une session oubliée en transaction ne bloque plus la base.
--       track_io_timing et log_min_duration_statement sont SUPERUSER et
--       IMPOSSIBLES sur ce plan (vérifié le 2026-09-06 : clés refusées par
--       `supabase postgres-config update`, ALTER DATABASE refusé).
--   (5) remise à zéro de pg_stat_statements pour repartir sur une base propre
--       après la panne (tentée hors transaction, échec toléré : propriétaire
--       supabase_admin ; repli = dashboard → Query Performance → Reset).
-- =============================================================================

begin;

-- (1) Index partiel purge
create index if not exists pdj_breakfasts_guest_name_pending_idx
  on public.pdj_breakfasts (service_date)
  where guest_name is not null;

-- (2) Vue pdj_daily_agg : privilèges
revoke all on public.pdj_daily_agg from anon, authenticated, public;
grant select on public.pdj_daily_agg to authenticated;

-- (3) RPC de démarrage
create or replace function public.get_my_access()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'permissions', coalesce(
      (select jsonb_agg(jsonb_build_object('page', u.page, 'level', u.level) order by u.page)
       from public.user_page_permissions u where u.user_id = auth.uid()),
      '[]'::jsonb)
  )
$$;
revoke execute on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated;

-- (4) Sessions oubliées en transaction
alter role authenticated set idle_in_transaction_session_timeout = '60s';
alter role anon set idle_in_transaction_session_timeout = '60s';
alter role authenticator set idle_in_transaction_session_timeout = '60s';
do $$
begin
  alter role postgres set idle_in_transaction_session_timeout = '60s';
exception when others then
  raise notice 'alter role postgres refuse : %', sqlerrm;
end $$;

commit;

-- (5) Statistiques : remise à zéro (hors transaction, échec toléré)
do $$
begin
  perform pg_stat_statements_reset();
  raise notice 'pg_stat_statements remis a zero';
exception when others then
  raise notice 'reset impossible (%), a faire dans le dashboard', sqlerrm;
end $$;

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'index partiel purge present' as controle, count(*)::text as valeur
from pg_indexes where indexname = 'pdj_breakfasts_guest_name_pending_idx'
union all
select 'pdj_daily_agg : anon sans privilege', (not has_table_privilege('anon', 'public.pdj_daily_agg', 'select'))::text
union all
select 'pdj_daily_agg : authenticated select seul',
  (has_table_privilege('authenticated', 'public.pdj_daily_agg', 'select')
   and not has_table_privilege('authenticated', 'public.pdj_daily_agg', 'update'))::text
union all
select 'get_my_access : invoker, authenticated seul',
  (select (not p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
           and not has_function_privilege('anon', p.oid, 'execute'))::text
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'get_my_access')
union all
select 'idle_in_transaction_session_timeout (authenticated)',
  coalesce((select array_to_string(setconfig, ',') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
            where r.rolname = 'authenticated'), '')
union all
select 'pg_stat_statements : appels cumules apres reset', (select coalesce(sum(calls), 0)::text from extensions.pg_stat_statements);
