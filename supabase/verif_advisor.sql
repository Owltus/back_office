-- =============================================================================
-- VÉRIFICATION SECURITY ADVISOR — reproduit les règles du linter Supabase
--
-- LECTURE SEULE (catalogues uniquement). Même forme que verif_complet.sql :
-- un tableau (controle, verdict) OK/KO + RESULTAT GLOBAL.
-- Exécution : `supabase db query --linked -f supabase/verif_advisor.sql`.
--
-- Modèle cible (plan security-advisor-zero-2026-09-05) : toute fonction
-- `security definer` vit dans le schéma `private` (non exposé à l'API) ;
-- `public` ne contient que des relais `security invoker` ou des fonctions
-- invoker ; ni PUBLIC ni anon n'exécutent quoi que ce soit de sensible.
-- =============================================================================

with checks(ordre, controle, ok) as (
  values
    (1, '0029 : aucune fonction security definer non-trigger dans public',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and p.prorettype <> 'pg_catalog.trigger'::regtype) = 0),
    (2, '0028 : aucune fonction executable par anon ou PUBLIC (public + private)',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prokind = 'f'
         and p.prorettype <> 'pg_catalog.trigger'::regtype
         and (has_function_privilege('anon', p.oid, 'execute')
              or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))) = 0),
    (3, 'schema private : ni anon ni PUBLIC n ont usage',
      not has_schema_privilege('anon', 'private', 'usage')
      and not exists (select 1 from pg_namespace n, aclexplode(n.nspacl) a
                      where n.nspname = 'private' and a.grantee = 0)),
    (4, 'schema private : authenticated et service_role ont usage',
      has_schema_privilege('authenticated', 'private', 'usage')
      and has_schema_privilege('service_role', 'private', 'usage')),
    (5, '0014 : aucune extension dans public',
      (select count(*) from pg_extension e join pg_namespace n on n.oid = e.extnamespace
       where n.nspname = 'public') = 0),
    (6, '0011 : search_path fige sur toutes les fonctions de public et private',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prokind = 'f'
         and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%') = 0),
    (7, 'policies : aucune reference a public.<aide>(',
      (select count(*) from pg_policies where schemaname = 'public'
         and (coalesce(qual,'') || coalesce(with_check,''))
             ~ 'public\.(get_page_level|is_admin|get_user_role|page_level_rank|repjour_manual_forecast_allowed)\(') = 0),
    (8, 'aides : 5 dans private, 0 dans public',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
         and p.proname in ('get_page_level','is_admin','get_user_role','page_level_rank','repjour_manual_forecast_allowed')) = 5
      and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('get_page_level','is_admin','get_user_role','page_level_rank','repjour_manual_forecast_allowed')) = 0),
    (9, 'relais : chaque RPC privee (hors aides) a un relais invoker public de meme signature',
      (select count(*) from pg_proc q join pg_namespace m on m.oid = q.pronamespace
       where m.nspname = 'private' and q.prokind = 'f'
         and q.proname not in ('get_page_level','is_admin','get_user_role','page_level_rank',
                               'repjour_manual_forecast_allowed','get_user_email')
         and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = q.proname and not p.prosecdef
                           and pg_get_function_identity_arguments(p.oid) = pg_get_function_identity_arguments(q.oid)
                           and pg_get_function_result(p.oid) = pg_get_function_result(q.oid))) = 0),
    (10, 'aucune fonction privee n appelle un relais public',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.prokind = 'f'
         and (case when p.prokind = 'f' then pg_get_functiondef(p.oid) end)
             ~ ('public\.(' || (select string_agg(q.proname, '|') from pg_proc q join pg_namespace m on m.oid = q.pronamespace where m.nspname = 'private') || ')\(')) = 0)
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
