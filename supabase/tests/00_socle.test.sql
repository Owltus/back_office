-- =============================================================================
-- 00_socle.test.sql — invariants de sécurité du CATALOGUE (base locale).
-- Plan environnement-dev-docker-2026-10-12, étape 10.
--
-- Ce que la matrice (01) ne voit pas ligne à ligne : anon sans aucun privilège
-- sur public, RLS active partout, aucune policy `to public`, aucune fonction
-- SECURITY DEFINER exposée dans public, schéma private fermé à anon, aucune
-- policy permissive inattendue, vues en security_invoker.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

-- --------------------------------------------------------------- anon ------
select is(
  (select coalesce(string_agg(c.relname || ':' || p, ', ' order by c.relname, p), '')
     from pg_class c
     cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) p
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','p','f')
      and has_table_privilege('anon', c.oid, p)),
  '', 'anon : aucun privilège sur aucune table ni vue de public');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and has_function_privilege('anon', p.oid, 'execute')),
  '', 'anon : n''exécute aucune fonction de public ni de private');

select is(
  (select coalesce(string_agg(c.relname, ', '), '')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage,select,update') else false end),
  '', 'anon : aucune séquence de public');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon : aucun usage du schéma private');
select ok(not has_schema_privilege('public', 'private', 'usage'), 'PUBLIC : aucun usage du schéma private');

-- Essai réel, rôle anon (comme le client sans session).
set local role anon;
select throws_ok('select count(*) from public.daily_reports', '42501', null, 'anon : lecture de daily_reports refusée');
select throws_ok('select count(*) from public.profiles', '42501', null, 'anon : lecture de profiles refusée');
select throws_ok($$select public.get_my_access()$$, '42501', null, 'anon : get_my_access refusée');
reset role;

-- ------------------------------------------------------------ authenticated -
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
      and has_table_privilege('authenticated', c.oid, 'truncate')),
  '', 'authenticated : aucun TRUNCATE');

-- ------------------------------------------------------------ catalogue ----
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
      and not c.relrowsecurity),
  '', 'RLS activée sur toutes les tables de public');

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  '', 'toutes les vues de public en security_invoker (sinon elles court-circuitent la RLS)');

select is(
  (select coalesce(string_agg(tablename || '/' || policyname, ', '), '')
     from pg_policies
    where schemaname = 'public' and roles @> array['public']::name[]),
  '', 'aucune policy « to public »');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef),
  '', 'aucune fonction SECURITY DEFINER dans public (elles vivent dans private)');

-- Seule policy « using (true) » admise : la lecture des easter eggs.
select is(
  (select coalesce(string_agg(tablename || '/' || policyname, ', ' order by tablename), '')
     from pg_policies
    where schemaname in ('public', 'storage')
      and (qual = 'true' or with_check = 'true')),
  'easter_eggs/easter_eggs read (authenticated)',
  'aucune policy permissive « true » hors easter_eggs');

-- Les gardes de niveau ne s'écrivent jamais `<> 'gestion'` / `<> 'admin'`
-- (NULL passe). Même filtre que verif_advisor.sql n° 11 : commentaires retirés,
-- comparaisons d'un PARAMÈTRE (`p_xxx <> 'admin'`, validation d'entrée) écartées.
select is(
  (select coalesce(string_agg(p.proname, ', '), '')
     from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prokind = 'f'
      and regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
            '\mp_[a-z0-9_]+\s*(<>|!=)\s*''[a-z_]+''', '', 'g')
          ~ '((<>|!=)\s*''(gestion|admin)'')|(''(gestion|admin)''\s*(<>|!=))'),
  '', 'aucune garde « <> gestion/admin » dans les fonctions');

-- Relais : chaque RPC privilégiée de private a un relais INVOKER de même
-- signature dans public (l'app n'appelle que public).
select is(
  (select coalesce(string_agg(pr.proname, ', ' order by pr.proname), '')
     from pg_proc pr
    where pr.pronamespace = 'private'::regnamespace and pr.prosecdef
      and pr.proname in (select pu.proname from pg_proc pu where pu.pronamespace = 'public'::regnamespace)
      and not exists (
        select 1 from pg_proc pu
         where pu.pronamespace = 'public'::regnamespace and pu.proname = pr.proname
           and pg_get_function_identity_arguments(pu.oid) = pg_get_function_identity_arguments(pr.oid)
           and not pu.prosecdef)),
  '', 'chaque relais public → private a la même signature et est INVOKER');

-- Toute fonction privée non-aide a un relais (verif_advisor.sql n° 9).
select is(
  (select coalesce(string_agg(q.proname, ', ' order by q.proname), '')
     from pg_proc q
    where q.pronamespace = 'private'::regnamespace and q.prokind = 'f'
      and q.prorettype <> 'pg_catalog.trigger'::regtype
      and q.proname not in ('get_page_level','is_admin','get_user_role','page_level_rank',
                            'repjour_manual_forecast_allowed','get_user_email','keep_author',
                            'classeur_write_ok','classeur_chapter_write_ok','classeur_niveau_de',
                            'classeur_niveau','classeur_lecture_ligne','classeur_lecture_ok',
                            'classeur_chapter_read_ok','classeur_gestion_ok',
                            -- aides de la page Planning (2026-10-27) : pures, ou lecture des verrous
                            'planning_aujourdhui','planning_competences_ok','planning_depuis','planning_etat','planning_heure_ok','planning_hhmm','planning_horaire_de','planning_lundi','planning_minutes','planning_niveau','planning_presence','planning_semaine_type_ok','planning_verrouillee')
      and not exists (select 1 from pg_proc p
                       where p.pronamespace = 'public'::regnamespace and p.proname = q.proname
                         and not p.prosecdef
                         and pg_get_function_identity_arguments(p.oid) = pg_get_function_identity_arguments(q.oid))),
  '', 'chaque RPC privée (hors aides des policies) a son relais public');

select * from finish();
rollback;
