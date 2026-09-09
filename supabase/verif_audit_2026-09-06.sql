-- =============================================================================
-- VÉRIFICATION — correctifs de l'audit du 2026-09-06
-- (plan/correctifs-audit-2026-09-06/5-validation-globale.md)
--
-- LECTURE SEULE (catalogues uniquement). Même forme que verif_complet.sql :
-- un tableau (controle, verdict) OK/KO + RESULTAT GLOBAL.
-- Exécution : `supabase db query --linked -f supabase/verif_audit_2026-09-06.sql`.
-- À rejouer avec verif_advisor.sql, verif_complet.sql et verif_perf.sql après
-- tout script SQL.
-- =============================================================================

with checks(ordre, controle, ok) as (
  values
    (1, 'facturation : aucune policy SELECT using(true)',
      (select count(*) from pg_policies where schemaname = 'public'
         and tablename like 'facturation%' and cmd = 'SELECT' and qual = 'true') = 0),
    (2, 'facturation : les 8 tables ont leur policy (page:facturation)',
      (select count(distinct tablename) from pg_policies where schemaname = 'public'
         and tablename like 'facturation%' and cmd = 'SELECT'
         and policyname like '%(page:facturation)') = 8),
    (3, 'triggers : aucune fonction trigger security definer dans public',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and p.prorettype = 'pg_catalog.trigger'::regtype) = 0),
    (4, 'triggers : log_delete vit dans private (definer)',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'private' and p.proname = 'log_delete' and p.prosecdef)),
    (5, 'triggers : aucune fonction trigger executable par PUBLIC/anon/authenticated',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prorettype = 'pg_catalog.trigger'::regtype
         and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute')
              or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))) = 0),
    -- Non-régression : AUCUN des 22 triggers de l'audit du 2026-09-06 n'a été
    -- perdu. Comparaison en « au moins », pas en égalité : le compte exact
    -- périmait à chaque table ajoutée, et il l'avait fait — 25 triggers au
    -- 2026-09-09 (estampilleurs de pdj_externals, easter_eggs, hotel_rooms…,
    -- tous `security invoker`, vérifiés par les contrôles 4 et 5 ci-dessus et
    -- ci-dessous). Un contrôle qui échoue pour une raison légitime finit par
    -- être ignoré : c'est ce qu'on évite ici.
    (6, 'triggers : les 22 triggers utilisateur du 2026-09-06 toujours en place',
      (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal) >= 22),
    (7, 'triggers : les 7 estampilleurs passent par private.keep_author',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
         and pg_get_functiondef(p.oid) like '%private.keep_author(%') = 7
      and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
         and pg_get_functiondef(p.oid) ~ 'new\.(created_by|validated_by|countersigned_by) := old\.') = 0),
    (8, 'policies : aucune policy to public dans public',
      (select count(*) from pg_policies where schemaname = 'public' and roles::text = '{public}') = 0),
    (9, 'cautions : UPDATE fenetre 30 jours (ecriture) + gestion',
      exists (select 1 from pg_policies where schemaname = 'public'
              and tablename = 'caisse_cautions' and cmd = 'UPDATE'
              and qual like '%taken_date >= (CURRENT_DATE - 30)%'
              and qual like '%gestion%')),
    (10, 'profiles : CHECK role = utilisateur | admin',
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_role_check')
        = 'CHECK ((role = ANY (ARRAY[''utilisateur''::text, ''admin''::text])))'),
    (11, 'user_page_permissions : CHECK page sur 8 cles',
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'user_page_permissions_page_check')
        like '%repjour%pdj%parking%rapro%caisse%affichage%facturation%literie%'),
    (12, 'FK auteur : 18 contraintes on delete set null',
      (select count(*) from pg_constraint where contype = 'f' and confdeltype = 'n'
         and conname in ('daily_reports_imported_by_fkey','audit_log_performed_by_fkey','caisse_cautions_refunded_by_fkey',
           'affiche_templates_created_by_fkey','baby_cot_assignments_created_by_fkey','caisse_cautions_created_by_fkey',
           'caisse_sheets_created_by_fkey','caisse_sheets_validated_by_fkey','caisse_sheets_countersigned_by_fkey',
           'hotel_rooms_updated_by_fkey','literie_sheets_created_by_fkey','literie_sheets_validated_by_fkey',
           'literie_stock_movements_created_by_fkey','pms_daily_metrics_imported_by_fkey','rapro_rooms_created_by_fkey',
           'rapro_sheets_created_by_fkey','rapro_sheets_validated_by_fkey','user_page_permissions_updated_by_fkey')) = 18),
    (13, 'FK auteur : les 5 colonnes NOT NULL levees',
      (select count(*) from information_schema.columns
       where table_schema = 'public' and is_nullable = 'NO'
         and (table_name, column_name) in (('baby_cot_assignments','created_by'),('caisse_cautions','created_by'),
              ('caisse_sheets','created_by'),('literie_sheets','created_by'),('literie_stock_movements','created_by'))) = 0),
    (14, 'index : parking_tarifs_effective_from_idx absent',
      (select count(*) from pg_indexes where indexname = 'parking_tarifs_effective_from_idx') = 0),
    (15, 'index : partiel de purge pdj_breakfasts present',
      (select count(*) from pg_indexes where indexname = 'pdj_breakfasts_guest_name_pending_idx'
         and indexdef like '%WHERE (guest_name IS NOT NULL)%') = 1),
    (16, 'pdj_daily_agg : anon sans privilege, authenticated select seul',
      not has_table_privilege('anon', 'public.pdj_daily_agg', 'select')
      and has_table_privilege('authenticated', 'public.pdj_daily_agg', 'select')
      and not has_table_privilege('authenticated', 'public.pdj_daily_agg', 'update')),
    (17, 'get_my_access : invoker, stable, authenticated seul',
      exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname = 'get_my_access' and not p.prosecdef and p.provolatile = 's'
              and has_function_privilege('authenticated', p.oid, 'execute')
              and not has_function_privilege('anon', p.oid, 'execute')
              and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
    (18, 'idle_in_transaction_session_timeout pose sur authenticated, anon, authenticator',
      (select count(*) from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
       where r.rolname in ('authenticated','anon','authenticator')
         and array_to_string(s.setconfig, ',') like '%idle_in_transaction_session_timeout=60s%') = 3),
    (19, 'email_recipients : table supprimee',
      to_regclass('public.email_recipients') is null),
    (20, 'server_report_recipients : toujours presente',
      to_regclass('public.server_report_recipients') is not null)
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
