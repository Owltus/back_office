-- =============================================================================
-- 93_audit_2026_11_18.test.sql — audit de sécurité run-2 du 2026-11-18
-- (base LOCALE), étapes 1 et 2 du plan `plan/securite-audit-run2-2026-11-18/`.
--
-- Fige les correctifs des migrations 20261118100000 à 20261118150000 :
-- marqueur d'envoi du RepJour, clé d'une ligne PDJ importée, dernier admin,
-- jour férié chômé en proposition, journal de `pms_daily_metrics`,
-- destinataires du rapport réservés à la gestion, fenêtres à la date de Paris.
-- (La règle des jours passés du Planning, étape 3, est dans 05_planning.)
--
-- Comptes et données créés DANS la transaction (aucune dépendance au seed :
-- le fichier tourne aussi sur une copie de la prod). Tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- ---------------------------------------------------------------- comptes ---
create temp table t_compte (compte text primary key, uid uuid);
insert into t_compte values
  ('lecture',  'a0d18000-0000-4000-8000-0000000000a1'),
  ('ecriture', 'a0d18000-0000-4000-8000-0000000000a2'),
  ('gestion',  'a0d18000-0000-4000-8000-0000000000a3'),
  ('admin',    'a0d18000-0000-4000-8000-0000000000a4'),
  ('admin2',   'a0d18000-0000-4000-8000-0000000000a5'),
  ('autre',    'a0d18000-0000-4000-8000-0000000000a6');
insert into auth.users (id, email)
  select uid, 'audit93-' || compte || '@exemple.test' from t_compte;
insert into public.profiles (id, email, role)
  select uid, 'audit93-' || compte || '@exemple.test', 'utilisateur' from t_compte;
-- Un seul admin : celui du test. Les autres admins (seed, copie de la prod)
-- sont rétrogradés le temps de la transaction, qui est annulée.
set local session_replication_role = replica;
update public.profiles set role = 'utilisateur' where role = 'admin';
update public.profiles set role = 'admin' where id = 'a0d18000-0000-4000-8000-0000000000a4';
set local session_replication_role = origin;
insert into public.user_page_permissions (user_id, page, level)
  select c.uid, p, c.compte
    from t_compte c, unnest(array['repjour','pdj']) p
   where c.compte in ('lecture', 'ecriture', 'gestion');

-- ------------------------------------------------------------- utilitaires ---
create function pg_temp.en_tant_que(p_compte text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select uid from t_compte where compte = p_compte),
                      'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Exécute les commandes sous le compte, dans une sous-transaction ANNULÉE.
-- Rend la valeur de la DERNIÈRE commande (un select) ou son nombre de lignes,
-- ou err=SQLSTATE.
create function pg_temp.essai(p_compte text, p_sqls text[]) returns text
language plpgsql as $$
declare v text; s text; v_n bigint;
begin
  begin
    perform pg_temp.en_tant_que(p_compte);
    foreach s in array p_sqls loop
      if s ~* '^\s*(select|with)' then execute s into v;
      else execute s; get diagnostics v_n = row_count; v := v_n::text; end if;
    end loop;
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v := 'err=' || sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- ---------------------------------------------------------------- données ---
-- Jour du rapport : loin dans l'avenir, aucune donnée réelle n'y est.
create temp table t_jour as select (private.planning_aujourdhui() + 4000) as d,
                                   private.planning_aujourdhui() as auj;
-- Les dates sont écrites en clair dans les commandes : `authenticated` ne lit
-- pas les tables temporaires du test.
create function pg_temp.q(p text) returns text language sql as $$
  select replace(replace(replace(p,
    ':D1', quote_literal((select d + 1 from t_jour))),
    ':D', quote_literal((select d from t_jour))),
    ':AUJ', quote_literal((select auj from t_jour)));
$$;
insert into public.daily_reports (date, month, year, day_of_month, days_in_month,
    rj_nuitees, rj_to, rj_pm, rj_revpar, rj_room_revenue,
    rmtd_nuitees, rmtd_to, rmtd_pm, rmtd_revpar, rmtd_room_revenue,
    pm_nuitees, pm_to, pm_pm, pm_revpar, pm_room_revenue, auto_sent_at)
  select d, extract(month from d), extract(year from d), extract(day from d), 30,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now()
    from t_jour;
-- Ligne PDJ importée (manual_kind NULL) d'aujourd'hui, chambre fictive.
insert into public.pdj_breakfasts (id, service_date, room, guest_name, adults, addons)
  select 'a0d18000-0000-4000-8000-000000000010', auj, 30001, 'AUDIT FICTIF', 2, 'PDJ' from t_jour;
-- Destinataire fictif du rapport.
insert into public.server_report_recipients (email, name, type, active)
  values ('audit93@exemple.test', 'Audit 93', 'to', true);
-- Ligne de détail PMS fictive.
insert into public.pms_daily_metrics (report_date, line_no, section)
  select d, 1, 'AUDIT' from t_jour;

select plan(30);

-- ------------------------------------------------ 1. marqueur d'envoi ---
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('update public.daily_reports set auto_sent_at = null where date = :D'),
  pg_temp.q('select (auto_sent_at is not null)::text from public.daily_reports where date = :D')]),
  'true', 'repjour : un compte en écriture n''efface pas le marqueur d''envoi');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('update public.daily_reports set rj_nuitees = 7 where date = :D'),
  pg_temp.q('select rj_nuitees || ''/'' || (auto_sent_at is not null) from public.daily_reports where date = :D')]),
  '7/true', 'repjour : un compte en écriture modifie le rapport, le marqueur reste');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('insert into public.daily_reports (date, month, year, day_of_month, days_in_month, rj_nuitees, rj_to, rj_pm, rj_revpar, rj_room_revenue, rmtd_nuitees, rmtd_to, rmtd_pm, rmtd_revpar, rmtd_room_revenue, pm_nuitees, pm_to, pm_pm, pm_revpar, pm_room_revenue, auto_sent_at) values (:D1, 1, 2037, 1, 30, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, now())'),
  pg_temp.q('select (auto_sent_at is null)::text from public.daily_reports where date = :D1')]),
  'true', 'repjour : un insert d''un compte en écriture met le marqueur à null');
-- Contexte système (clé serveur : auth.uid() nul) : le marqueur se pose.
update public.daily_reports set auto_sent_at = null where date = (select d from t_jour);
update public.daily_reports set auto_sent_at = now() where date = (select d from t_jour);
select is((select (auto_sent_at is not null)::text from public.daily_reports where date = (select d from t_jour)),
  'true', 'repjour : le contexte système efface puis pose le marqueur');

-- ------------------------------------------- 2. clé d'une ligne PDJ importée ---
select is(pg_temp.essai('ecriture', array[
  'update public.pdj_breakfasts set room = 30002 where id = ''a0d18000-0000-4000-8000-000000000010''']),
  'err=42501', 'pdj : un compte en écriture ne déplace pas une ligne importée vers une autre chambre');
select is(pg_temp.essai('ecriture', array[
  'update public.pdj_breakfasts set service_date = service_date + 1 where id = ''a0d18000-0000-4000-8000-000000000010''']),
  'err=42501', 'pdj : un compte en écriture ne change pas la date d''une ligne importée');
select is(pg_temp.essai('ecriture', array[
  'update public.pdj_breakfasts set adults = 3, room = 30001 where id = ''a0d18000-0000-4000-8000-000000000010''']),
  '1', 'pdj : la même clé réécrite (upsert de l''app) passe');
select is(pg_temp.essai('gestion', array[
  'update public.pdj_breakfasts set room = 30002 where id = ''a0d18000-0000-4000-8000-000000000010''']),
  '1', 'pdj : la gestion déplace une ligne importée');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('insert into public.pdj_breakfasts (service_date, room, manual_kind, breakfasts_included, adults) values (:AUJ, 30003, ''inclus'', 1, 0)'),
  pg_temp.q('update public.pdj_breakfasts set room = 30004 where service_date = :AUJ and room = 30003')]),
  '1', 'pdj : une ligne manuelle reste déplaçable');

-- -------------------------------------------------- 3. dernier administrateur ---
select is(pg_temp.essai('admin', array[
  'update public.profiles set role = ''utilisateur'' where id = ''a0d18000-0000-4000-8000-0000000000a4''']),
  'err=42501', 'comptes : le dernier admin ne se rétrograde pas par l''API');
select is(pg_temp.essai('admin', array[
  'delete from public.profiles where id = ''a0d18000-0000-4000-8000-0000000000a4''']),
  'err=42501', 'comptes : le dernier admin ne se supprime pas par l''API');
select is(pg_temp.essai('admin', array[
  'select public.set_user_grade(''a0d18000-0000-4000-8000-0000000000a4'', ''utilisateur'')']),
  'err=P0001', 'comptes : set_user_grade garde son propre refus (message de l''écran)');
select throws_ok(
  $$delete from auth.users where id = 'a0d18000-0000-4000-8000-0000000000a4'$$,
  '42501', null, 'comptes : la suppression en cascade du dernier admin est refusée aussi');
select lives_ok(
  $$delete from auth.users where id = 'a0d18000-0000-4000-8000-0000000000a6'$$,
  'comptes : la suppression en cascade d''un compte non admin passe');
select is(pg_temp.essai('admin', array[
  'update public.profiles set display_name = ''Audit'' where id = ''a0d18000-0000-4000-8000-0000000000a4''']),
  '1', 'comptes : le dernier admin modifie son profil sans toucher au rôle');
select is(pg_temp.essai('admin', array[
  'update public.profiles set created_at = ''2000-01-01'' where id = ''a0d18000-0000-4000-8000-0000000000a2''',
  'select (extract(year from created_at) <> 2000)::text from public.profiles where id = ''a0d18000-0000-4000-8000-0000000000a2''']),
  'true', 'comptes : la date de création reste figée');
-- Deux admins : l'un peut se retirer, puis l'autre devient le dernier.
set local session_replication_role = replica;
update public.profiles set role = 'admin' where id = 'a0d18000-0000-4000-8000-0000000000a5';
set local session_replication_role = origin;
select is(pg_temp.essai('admin', array[
  'update public.profiles set role = ''utilisateur'' where id = ''a0d18000-0000-4000-8000-0000000000a4''',
  'select role from public.profiles where id = ''a0d18000-0000-4000-8000-0000000000a4''']),
  'utilisateur', 'comptes : un admin parmi deux peut se rétrograder');
select is(pg_temp.essai('admin2', array[
  'update public.profiles set role = ''utilisateur'' where id = ''a0d18000-0000-4000-8000-0000000000a4''',
  'update public.profiles set role = ''utilisateur'' where id = ''a0d18000-0000-4000-8000-0000000000a5''']),
  'err=42501', 'comptes : après lui, le second devient le dernier et reste');

-- ------------------------------------------- 4. jour férié chômé en proposition ---
update public.planning_motifs set role = null where role = 'ferie_chome';
insert into public.planning_motifs (code, nom, nature, decompte, role)
  values ('XF', 'Férié chômé test 93', 'absence', true, 'ferie_chome'),
         ('XK', 'Congé test 93', 'absence', true, null);
insert into public.planning_salaries (prenom, nom) values ('Test93', 'AUDIT');
insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
  select s.id, (select d from t_jour), m.id, false
    from public.planning_salaries s, public.planning_motifs m
   where s.prenom = 'Test93' and s.nom = 'AUDIT' and m.nom = 'Férié chômé test 93';
insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
  select s.id, (select d + 1 from t_jour), m.id, false
    from public.planning_salaries s, public.planning_motifs m
   where s.prenom = 'Test93' and s.nom = 'AUDIT' and m.nom = 'Congé test 93';
select is((select string_agg(m.nom || '=' || a.epinglee, ',' order by a.jour)
             from public.planning_absences a
             join public.planning_motifs m on m.id = a.motif_id
             join public.planning_salaries s on s.id = a.salarie_id
            where s.prenom = 'Test93' and s.nom = 'AUDIT'),
  'Férié chômé test 93=false,Congé test 93=true',
  'planning : un férié chômé posé en proposition le reste, un congé est validé');

-- ------------------------------------------------- 5. journal et destinataires ---
create temp table t_pms as
  select id from public.pms_daily_metrics where report_date = (select d from t_jour) and line_no = 1;
delete from public.pms_daily_metrics where id = (select id from t_pms);
select is((select count(*)::int from public.audit_log
            where table_name = 'pms_daily_metrics' and action = 'DELETE'
              and record_id = (select id::text from t_pms)),
  1, 'pms_daily_metrics : une suppression écrit une ligne DELETE au journal');
select is(pg_temp.essai('lecture', array[
  'select count(*) from public.server_report_recipients where email = ''audit93@exemple.test''']),
  '0', 'destinataires : un compte RepJour en lecture ne les lit pas');
select is(pg_temp.essai('ecriture', array[
  'select count(*) from public.server_report_recipients where email = ''audit93@exemple.test''']),
  '0', 'destinataires : un compte RepJour en écriture ne les lit pas');
select is(pg_temp.essai('gestion', array[
  'select count(*) from public.server_report_recipients where email = ''audit93@exemple.test''']),
  '1', 'destinataires : la gestion de RepJour les lit');

-- -------------------------------------------- 6. fenêtres à la date de Paris ---
select is((select count(*)::int from pg_policies
            where schemaname = 'public'
              and tablename not in ('caisse_sheets', 'caisse_cautions')
              and (qual ~* 'current_date' or with_check ~* 'current_date')),
  0, 'fenêtres : plus aucune policy hors caisse ne compte en date UTC');
select is((select count(*)::int from pg_policies
            where schemaname = 'public'
              and (qual ~ 'planning_aujourdhui' or with_check ~ 'planning_aujourdhui')),
  8, 'fenêtres : parking et lits bébé (8 policies) comptent en date de Paris');
select is((select count(*)::int from pg_policies
            where schemaname = 'public'
              and tablename ~ '^(pdj_|rapro_)'
              and (qual ~ 'jour_hotelier' or with_check ~ 'jour_hotelier')),
  13, 'fenêtres : PDJ et Rapprochement (13 policies) comptent en jour hôtelier');
select is((select count(*)::int from pg_policies
            where schemaname = 'public'
              and tablename ~ '^(pdj_|rapro_)'
              and (qual ~ 'planning_aujourdhui' or with_check ~ 'planning_aujourdhui')),
  0, 'fenêtres : PDJ et Rapprochement ne comptent plus en date de Paris');
-- Le jour hôtelier bascule à 02:00 à Paris (src/lib/businessDay.ts).
select is((select prosrc from pg_proc where proname = 'jour_hotelier'
             and pronamespace = 'private'::regnamespace) ~ 'interval ''2 hours''',
  true, 'fenêtres : le jour hôtelier bascule à 2 h comme l''écran');
select is((select count(*)::int from pg_policies
            where schemaname = 'public'
              and tablename in ('caisse_sheets', 'caisse_cautions')
              and (qual ~* 'current_date' or with_check ~* 'current_date')),
  4, 'fenêtres : la caisse et les cautions sont inchangées (décision utilisateur)');
select is((select count(*)::int from pg_proc
            where proname in ('parking_no_past_rewrite', 'baby_cot_assignments_no_past_rewrite')
              and prosrc ~ 'planning_aujourdhui' and prosrc !~* 'current_date'),
  2, 'fenêtres : parking et lits bébé bornent un début reculé en date de Paris');

select * from finish();
rollback;
