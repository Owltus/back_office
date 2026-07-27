-- ============================================================================
-- VÉRIFICATION SÉCURITÉ — tableau de bord unique (lecture seule).
-- Renvoie une ligne par correctif attendu, avec statut OK / A FAIRE + détail.
-- À jouer dans Supabase → SQL Editor. Ne modifie rien.
-- ============================================================================
select item, status, detail from (

  -- 1) anon ne peut plus exécuter les 4 RPC sensibles
  select 1 as ord, 'anon revoke (4 RPC sensibles)' as item,
    case when not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      join pg_roles r on r.oid = a.grantee
      where n.nspname = 'public'
        and p.proname in ('admin_update_password','set_user_grade','set_page_permission','remove_page_permission')
        and a.privilege_type = 'EXECUTE' and r.rolname = 'anon'
    ) then 'OK' else 'A FAIRE' end as status, '' as detail

  -- 2) admin_update_password : search_path figé (C1)
  union all
  select 2, 'C1 admin_update_password search_path figé',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_update_password'
        and p.proconfig is not null
        and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    ) then 'OK' else 'A FAIRE' end, ''

  -- 3) H1 : plus aucune lecture permissive (hors hotel_config + easter_eggs, volontaires)
  union all
  select 3, 'H1 lectures par page',
    case when not exists (
      select 1 from pg_policies
      where schemaname = 'public' and cmd = 'SELECT'
        and (qual = 'true' or qual ilike '%auth.uid() IS NOT NULL%')
        and tablename not in ('hotel_config','easter_eggs')
    ) then 'OK' else 'A FAIRE' end,
    coalesce((select string_agg(tablename, ', ') from pg_policies
      where schemaname = 'public' and cmd = 'SELECT'
        and (qual = 'true' or qual ilike '%auth.uid() IS NOT NULL%')
        and tablename not in ('hotel_config','easter_eggs')), '(aucune)')

  -- 4) H2 : facturation_ref_imputations plus en using(true)
  union all
  select 4, 'H2 facturation_ref_imputations fermée',
    case when exists (
        select 1 from pg_policies where schemaname='public'
          and tablename='facturation_ref_imputations' and cmd='SELECT')
      and not exists (
        select 1 from pg_policies where schemaname='public'
          and tablename='facturation_ref_imputations' and cmd='SELECT' and qual='true')
    then 'OK' else 'A FAIRE' end, ''

  -- 5) profiles : trigger anti-escalade + policy self-update (G1/G2)
  union all
  select 5, 'G1/G2 profiles anti-escalade',
    case when exists (select 1 from pg_trigger
        where tgrelid='public.profiles'::regclass and tgname='protect_role_escalation' and not tgisinternal)
      and exists (select 1 from pg_policies where schemaname='public'
        and tablename='profiles' and cmd='UPDATE' and policyname='Users update own profile')
    then 'OK' else 'A FAIRE' end, ''

  -- 6) M4 : contrainte de format email
  union all
  select 6, 'M4 contrainte format email',
    case when exists (select 1 from pg_constraint
      where conrelid='public.email_recipients'::regclass and conname='email_recipients_email_format')
    then 'OK' else 'A FAIRE' end, ''

  -- 7) B5 : easter_eggs écritures via is_admin() (plus get_user_role)
  union all
  select 7, 'B5 easter_eggs écritures via is_admin()',
    case when exists (
        select 1 from pg_policies where schemaname='public' and tablename='easter_eggs'
          and cmd in ('INSERT','UPDATE','DELETE')
          and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%is_admin%')
      and not exists (
        select 1 from pg_policies where schemaname='public' and tablename='easter_eggs'
          and cmd in ('INSERT','UPDATE','DELETE')
          and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%get_user_role%')
    then 'OK' else 'A FAIRE' end, ''

  -- 8) RLS activée sur toutes les tables (aucune ouverte à l'anonyme)
  union all
  select 8, 'RLS activée partout',
    case when not exists (
      select 1 from pg_class
      where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity
    ) then 'OK' else 'A FAIRE' end,
    coalesce((select string_agg(relname, ', ') from pg_class
      where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity), '(aucune)')

) x order by ord;
