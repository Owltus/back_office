-- =============================================================================
-- 02_rpc_privilegiees.test.sql — RPC SECURITY DEFINER (private) appelées par
-- leurs relais public, pour chaque compte. Base LOCALE seulement.
-- Plan environnement-dev-docker-2026-10-12, étape 10.
--
-- Gardes NULL (audit du 2026-09-28) : un compte SANS PROFIL (JWT valide,
-- profil supprimé) ne doit passer AUCUNE garde ; `set_user_grade(…, null)` est
-- refusé ; le dernier admin ne se rétrograde pas.
-- Oracle : SQLSTATE et message de la garde (« not authorized », « Accès
-- refusé »…) — un refus pour une AUTRE raison (argument nul, contrainte) ne
-- prouverait pas la garde.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table t_compte (compte text primary key, uid uuid, ordre int);
insert into t_compte
select c.compte, coalesce(p.id, c.repli), c.ordre
  from (values
    ('admin',       'admin@exemple.test',     null::uuid, 1),
    ('gestion',     'gestion@exemple.test',   null, 2),
    ('ecriture',    'ecriture@exemple.test',  null, 3),
    ('lecture',     'lecture@exemple.test',   null, 4),
    ('aucun',       'aucun@exemple.test',     null, 5),
    ('reception',   'reception@exemple.test', null, 6),
    ('sans_profil', null, 'b0000000-0000-4000-8000-0000000000ff', 7),
    ('anon',        null, null, 8)
  ) as c(compte, email, repli, ordre)
  left join public.profiles p on p.email = c.email;

create function pg_temp.en_tant_que(p_compte text) returns void
language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  if p_compte = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    return;
  end if;
  select uid into v from t_compte where compte = p_compte;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Exécute p_sql (un SELECT qui compte) sous le compte, sous-transaction annulée.
-- Rend 'ok' (> 0), 'zero', ou 'err=SQLSTATE:message'.
create function pg_temp.essai(p_compte text, p_sql text, p_prep text default null)
returns text language plpgsql as $$
declare v_n bigint; v_res text;
begin
  begin
    if p_prep is not null then execute p_prep; end if;
    perform pg_temp.en_tant_que(p_compte);
    execute p_sql into v_n;
    v_res := case when v_n > 0 then 'ok' else 'zero' end;
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v_res := 'err=' || sqlstate || ':' || sqlerrm;
  end;
  return v_res;
end $$;

-- Données : un rapport à date fixe pour daily_reports_occ.
set local session_replication_role = replica;
insert into auth.users (id, email) values ('b0000000-0000-4000-8000-0000000000ff', 'revoque@exemple.test');
insert into public.daily_reports (date, month, year, day_of_month, days_in_month,
  rj_nuitees, rj_to, rj_pm, rj_revpar, rj_room_revenue,
  rmtd_nuitees, rmtd_to, rmtd_pm, rmtd_revpar, rmtd_room_revenue,
  pm_nuitees, pm_to, pm_pm, pm_revpar, pm_room_revenue)
values (date '2099-01-01', 1, 2099, 1, 31, 42,1,1,1,1, 1,1,1,1,1, 1,1,1,1,1);
insert into public.pdj_breakfasts (service_date, room) values (date '2099-01-01', 102);
set local session_replication_role = origin;

-- ------------------------------------------------------------------ cas ---
-- attendu : liste (compte → résultat) ; « * » = tous les autres comptes.
create temp table t_cas (ord serial, nom text, sql text, prep text, attendu jsonb);

insert into t_cas (nom, sql, prep, attendu) values
-- admin_update_password : garde is_admin() (NULL-sûre depuis le 2026-09-28).
('admin_update_password (cible lecture)',
  $q$select count(*) from (select public.admin_update_password('a0000000-0000-4000-8000-000000000004'::uuid, 'Valide-Mot2passe!')) s$q$, null,
  '{"admin":"ok","anon":"err=42501:permission denied for function admin_update_password","*":"err=P0001:Accès refusé : rôle admin requis"}'),
('admin_update_password (cible = un autre admin)',
  $q$select count(*) from (select public.admin_update_password('a0000000-0000-4000-8000-000000000002'::uuid, 'Valide-Mot2passe!')) s$q$,
  $q$set local session_replication_role = replica; update public.profiles set role = 'admin' where email = 'gestion@exemple.test'; set local session_replication_role = origin$q$,
  '{"admin":"err=P0001:Cible administrateur : réinitialisation interdite (passer par le dashboard)","gestion":"ok","anon":"err=42501:permission denied for function admin_update_password","*":"err=P0001:Accès refusé : rôle admin requis"}'),
('admin_update_password (mot de passe faible)',
  $q$select count(*) from (select public.admin_update_password('a0000000-0000-4000-8000-000000000004'::uuid, 'court')) s$q$, null,
  '{"admin":"err=P0001:Le mot de passe doit faire au moins 12 caractères","anon":"err=42501:permission denied for function admin_update_password","*":"err=P0001:Accès refusé : rôle admin requis"}'),
-- set_user_grade.
('set_user_grade (lecture → admin)',
  $q$select count(*) from (select public.set_user_grade('a0000000-0000-4000-8000-000000000004'::uuid, 'admin')) s$q$, null,
  '{"admin":"ok","anon":"err=42501:permission denied for function set_user_grade","*":"err=P0001:not authorized"}'),
('set_user_grade (se nommer admin)',
  $q$select count(*) from (select public.set_user_grade(auth.uid(), 'admin')) s$q$, null,
  '{"admin":"ok","anon":"err=42501:permission denied for function set_user_grade","*":"err=P0001:not authorized"}'),
('set_user_grade (grade NULL)',
  $q$select count(*) from (select public.set_user_grade('a0000000-0000-4000-8000-000000000004'::uuid, null)) s$q$, null,
  '{"admin":"err=P0001:invalid grade: <NULL>","anon":"err=42501:permission denied for function set_user_grade","*":"err=P0001:not authorized"}'),
('set_user_grade (dernier admin se rétrograde)',
  $q$select count(*) from (select public.set_user_grade('a0000000-0000-4000-8000-000000000001'::uuid, 'utilisateur')) s$q$, null,
  '{"admin":"err=P0001:dernier admin: rétrogradation refusée (verrouillage total)","anon":"err=42501:permission denied for function set_user_grade","*":"err=P0001:not authorized"}'),
('set_user_grade (rétrograder quand il reste un autre admin)',
  $q$select count(*) from (select public.set_user_grade('a0000000-0000-4000-8000-000000000001'::uuid, 'utilisateur')) s$q$,
  $q$set local session_replication_role = replica; update public.profiles set role = 'admin' where email = 'lecture@exemple.test'; set local session_replication_role = origin$q$,
  '{"admin":"ok","lecture":"ok","anon":"err=42501:permission denied for function set_user_grade","*":"err=P0001:not authorized"}'),
-- Droits de page.
('set_page_permission (se donner facturation:gestion)',
  $q$select count(*) from (select public.set_page_permission(auth.uid(), 'facturation', 'gestion')) s$q$, null,
  '{"admin":"ok","anon":"err=42501:permission denied for function set_page_permission","*":"err=P0001:not authorized"}'),
('remove_page_permission (retirer repjour à lecture)',
  $q$select count(*) from (select public.remove_page_permission('a0000000-0000-4000-8000-000000000004'::uuid, 'repjour')) s$q$, null,
  '{"admin":"ok","anon":"err=42501:permission denied for function remove_page_permission","*":"err=P0001:not authorized"}'),
-- Lecture croisée bornée par le droit de page rapro.
('daily_reports_occ (rapro ≥ lecture)',
  $q$select count(*) from (select public.daily_reports_occ(date '2099-01-01') v) s where v = 42$q$, null,
  '{"aucun":"zero","sans_profil":"zero","anon":"err=42501:permission denied for function daily_reports_occ","*":"ok"}'),
('rapro_occupancy (rapro ≥ lecture)',
  $q$select count(*) from public.rapro_occupancy(date '2099-01-01')$q$, null,
  '{"aucun":"zero","sans_profil":"zero","anon":"err=42501:permission denied for function rapro_occupancy","*":"ok"}'),
('dismiss_send_reminder (repjour ≥ écriture)',
  $q$select count(*) from (select public.dismiss_send_reminder(date '2099-01-01')) s$q$, null,
  '{"admin":"ok","gestion":"ok","ecriture":"ok","anon":"err=42501:permission denied for function dismiss_send_reminder","*":"err=42501:Acces refuse : niveau ecriture requis sur la page repjour."}'),
('classeur_personnes (gestion du Classeur)',
  $q$select count(*) from public.classeur_personnes()$q$, null,
  '{"admin":"ok","gestion":"ok","anon":"err=42501:permission denied for function classeur_personnes","*":"err=42501:Réservé à la gestion de la page Classeur."}'),
-- get_my_access : un compte sans profil reçoit profile = null (jamais une erreur).
('get_my_access (profil présent)',
  $q$select count(*) from (select public.get_my_access() -> 'profile' p) s where p <> 'null'::jsonb$q$, null,
  '{"sans_profil":"zero","anon":"err=42501:permission denied for function get_my_access","*":"ok"}'),
-- Facturation (une seule écriture permise pour vérifier le chemin positif).
('facturation_issuer_learn (gestion facturation)',
  $q$select count(*) from (select public.facturation_issuer_learn('EMETTEUR TEST', 'Émetteur test')) s$q$, null,
  '{"admin":"ok","gestion":"ok","anon":"err=42501:permission denied for function facturation_issuer_learn","*":"err=P0001:not authorized"}');

-- Les 28 RPC facturation : refus par la GARDE pour tout compte sans
-- facturation:gestion, avec des arguments nuls (la garde passe avant eux).
insert into t_cas (nom, sql, prep, attendu)
select format('%s(%s) — garde', p.proname, pg_get_function_identity_arguments(p.oid)),
       format('select count(*) from (select public.%I(%s)) s', p.proname,
              (select string_agg('null::' || format_type(t, null), ', ' order by o)
                 from unnest(p.proargtypes::oid[]) with ordinality a(t, o))),
       null,
       jsonb_build_object('admin', 'skip', 'gestion', 'skip',
                          'anon', 'err=42501:permission denied for function ' || p.proname,
                          '*', 'err=P0001:not authorized')
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname like 'facturation\_%'
   and p.prorettype <> 'pg_catalog.trigger'::regtype
 order by p.proname, pg_get_function_identity_arguments(p.oid);

create function pg_temp.lancer() returns setof text language plpgsql as $$
declare m record; c record; v_att text;
begin
  for m in select * from t_cas order by ord loop
    for c in select * from t_compte order by ordre loop
      v_att := coalesce(m.attendu ->> c.compte, m.attendu ->> '*');
      continue when v_att = 'skip';
      return next is(pg_temp.essai(c.compte, m.sql, m.prep), v_att,
                     format('%s — %s', m.nom, c.compte));
    end loop;
  end loop;
end $$;

select plan(
  4 + (select count(*)::int from t_cas m cross join t_compte c
        where coalesce(m.attendu ->> c.compte, m.attendu ->> '*') <> 'skip'));

select is((select count(*)::int from t_cas where nom like 'facturation\_%— garde'), 28,
          '28 relais facturation couverts');
select is((select string_agg(compte || '=' || uid, ',' order by ordre) from t_compte where compte in ('admin','gestion','lecture')),
          'admin=a0000000-0000-4000-8000-000000000001,gestion=a0000000-0000-4000-8000-000000000002,lecture=a0000000-0000-4000-8000-000000000004',
          'identifiants fixes du seed (utilisés en dur, pour que anon ne lise pas profiles)');

select * from pg_temp.lancer();

-- Effet réel (hors sous-transaction) : l'admin change bien le mot de passe…
do $$
begin
  perform pg_temp.en_tant_que('admin');
  perform public.admin_update_password('a0000000-0000-4000-8000-000000000004'::uuid, 'Valide-Mot2passe!');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
select ok((select encrypted_password = crypt('Valide-Mot2passe!', encrypted_password)
             from auth.users where email = 'lecture@exemple.test'),
          'admin_update_password : le mot de passe est réellement changé');
select is((select count(*)::int from public.audit_log where action = 'admin_password_reset'
            and performed_by = (select uid from t_compte where compte = 'admin')), 1,
          'admin_update_password : journalisé dans audit_log');

select * from finish();
rollback;
