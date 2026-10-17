-- =============================================================================
-- 90_audit_fonctions_sql.test.sql — audit de sécurité du 2026-10-17, sujet
-- « fonctions SQL et RPC » (security definer de private, relais invoker de
-- public, triggers d'estampillage, feuilles clôturées). Base LOCALE seulement.
--
-- Comptes créés DANS la transaction (annulée à la fin) : aucun nettoyage.
-- Les tests 12 à 14 figent les défauts trouvés par l'audit et corrigés le même
-- jour (migrations 20261017100000 et 20261017120000).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- ------------------------------------------------------------ comptes ------
set local session_replication_role = replica;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a9000000-0000-4000-8000-00000000000' || x)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'audit-sql-' || x || '@exemple.test', 'x', now(), now()
  from unnest(array['a','b','e','f']) x;
insert into public.profiles (id, email, display_name, role, first_name, last_name) values
  ('a9000000-0000-4000-8000-00000000000a', 'audit-sql-a@exemple.test', 'A', 'admin', 'A', 'A'),
  ('a9000000-0000-4000-8000-00000000000e', 'audit-sql-e@exemple.test', 'E', 'utilisateur', 'E', 'E'),
  ('a9000000-0000-4000-8000-00000000000f', 'audit-sql-f@exemple.test', 'F', 'utilisateur', 'F', 'F');
insert into public.user_page_permissions (user_id, page, level) values
  ('a9000000-0000-4000-8000-00000000000e', 'caisse', 'ecriture'),
  ('a9000000-0000-4000-8000-00000000000e', 'rapro', 'ecriture'),
  ('a9000000-0000-4000-8000-00000000000e', 'facturation', 'ecriture');
set local session_replication_role = origin;

create function pg_temp.en_tant_que(p_sub text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_sub is null then '{"role":"authenticated"}'
         else json_build_object('sub', p_sub, 'role', 'authenticated')::text end, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Exécute p_sql sous l'identité, sous-transaction annulée ; rend 'ok' ou 'err=SQLSTATE:message'.
create function pg_temp.essai(p_sub text, p_sql text) returns text
language plpgsql as $$
declare v_res text;
begin
  begin
    perform pg_temp.en_tant_que(p_sub);
    execute p_sql;
    v_res := 'ok';
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v_res := 'err=' || sqlstate || ':' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v_res;
end $$;

-- Rend la valeur texte de la 1re colonne de p_sql exécuté sous l'identité (sous-transaction annulée).
create function pg_temp.valeur(p_sub text, p_prep text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  begin
    perform pg_temp.en_tant_que(p_sub);
    if p_prep is not null then execute p_prep; end if;
    execute p_sql into v;
    raise exception using errcode = 'P0T01', message = coalesce(v, '<null>');
  exception
    when sqlstate 'P0T01' then v := sqlerrm;
    when others then v := 'err=' || sqlstate || ':' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- ------------------------------------------------ gardes des RPC -----------
select is(pg_temp.essai('a9000000-0000-4000-8000-00000000000b',
  $$select public.set_user_grade('a9000000-0000-4000-8000-00000000000b', 'admin')$$),
  'err=P0001:not authorized', 'compte SANS profil : set_user_grade refusé');
select is(pg_temp.essai(null,
  $$select public.set_page_permission('a9000000-0000-4000-8000-00000000000f', 'caisse', 'gestion')$$),
  'err=P0001:not authorized', 'JWT sans sub : set_page_permission refusé');
select is(pg_temp.essai('a9000000-0000-4000-8000-00000000000e',
  $$select public.facturation_issuer_learn('audit-emetteur', 'x')$$),
  'err=P0001:not authorized', 'facturation écriture (pas gestion) : RPC facturation refusée');
select is(pg_temp.essai('a9000000-0000-4000-8000-00000000000f',
  $$select public.classeur_personnes()$$),
  'err=42501:Réservé à la gestion de la page Classeur.', 'sans droit classeur : classeur_personnes refusé');
select is(pg_temp.essai('a9000000-0000-4000-8000-00000000000a',
  $$select public.set_user_grade('a9000000-0000-4000-8000-00000000000e', null)$$),
  'err=P0001:invalid grade: <NULL>', 'admin : grade NULL refusé');
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     from pg_proc p
    where p.pronamespace = 'private'::regnamespace and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  '', 'private : toute fonction SECURITY DEFINER fige son search_path');
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.prosecdef and pg_get_functiondef(p.oid) ~* '\mexecute\s+(format|''|\w+\s*\|\|)'),
  '', 'aucun SQL dynamique (execute) dans une fonction SECURITY DEFINER');

-- ------------------------------------------- estampillage / clôture ---------
delete from public.caisse_sheets where report_date = current_date and shift = 'nuit';
select is(pg_temp.valeur('a9000000-0000-4000-8000-00000000000e',
  $$insert into public.caisse_sheets (report_date, shift, snt_cash, status) values (current_date, 'nuit', 10, 'validated')$$,
  $$update public.caisse_sheets set snt_cash = 999 where report_date = current_date and shift = 'nuit' returning snt_cash::text$$),
  'err=42501:Caisse clôturée : réouvrez-la pour la modifier.', 'caisse clôturée : une donnée ne change pas');
select is(pg_temp.valeur('a9000000-0000-4000-8000-00000000000e',
  $$insert into public.caisse_sheets (report_date, shift, status) values (current_date, 'nuit', 'validated')$$,
  $$update public.caisse_sheets set created_by = 'a9000000-0000-4000-8000-00000000000a', validated_by = 'a9000000-0000-4000-8000-00000000000a', countersigned_by = 'a9000000-0000-4000-8000-00000000000a' where report_date = current_date and shift = 'nuit' returning concat_ws('|', created_by, validated_by, coalesce(countersigned_by::text, '-'))$$),
  'a9000000-0000-4000-8000-00000000000e|a9000000-0000-4000-8000-00000000000e|-',
  'caisse : created_by / validated_by / countersigned_by non usurpables (keep_author)');

delete from public.rapro_rooms where report_date = current_date;
delete from public.rapro_sheets where report_date = current_date;
select is(pg_temp.valeur('a9000000-0000-4000-8000-00000000000e',
  $$insert into public.rapro_sheets (report_date, status) values (current_date, 'validated')$$,
  $$insert into public.rapro_rooms (report_date, room, status) values (current_date, 101, 'nettoyee') returning room::text$$),
  'err=42501:Rapprochement clôturé : réouvrez le jour pour le modifier.', 'rapro clôturé : chambres figées');

select is(pg_temp.valeur('a9000000-0000-4000-8000-00000000000e',
  $$insert into public.caisse_cautions (room, amount, taken_date, status, refunded_date, refunded_by, refunded_at) values (101, 50, current_date, 'active', null, null, null)$$,
  $$update public.caisse_cautions set status = 'refunded', refunded_date = current_date, refunded_by = 'a9000000-0000-4000-8000-00000000000a' where room = 101 and taken_date = current_date and created_by = 'a9000000-0000-4000-8000-00000000000e' returning refunded_by::text$$),
  'a9000000-0000-4000-8000-00000000000e', 'caution : le remboursement est estampillé de l''appelant');

-- ------------------- défauts de l'audit, corrigés le 2026-10-17 ----------

select is(pg_temp.valeur('a9000000-0000-4000-8000-00000000000e',
  $$insert into public.rapro_sheets (report_date, status, corrections, comment) values (current_date, 'validated', 1, 'orig')$$,
  $$update public.rapro_sheets set corrections = 42, comment = 'reecrit' where report_date = current_date returning corrections::text$$),
  'err=42501:Rapprochement clôturé : réouvrez le jour pour le modifier.',
  'rapro_sheets clôturée : corrections / late_arrivals / comment / operator_name figés');

select is(pg_temp.valeur('a9000000-0000-4000-8000-00000000000e',
  $$insert into public.caisse_cautions (room, amount, taken_date, status, refunded_date, refunded_by, refunded_at) values (102, 50, current_date, 'active', null, null, null);
    update public.caisse_cautions set status = 'refunded', refunded_date = current_date where room = 102 and taken_date = current_date and created_by = 'a9000000-0000-4000-8000-00000000000e'$$,
  $$update public.caisse_cautions set refunded_by = 'a9000000-0000-4000-8000-00000000000a', refunded_at = '2000-01-01' where room = 102 and taken_date = current_date and created_by = 'a9000000-0000-4000-8000-00000000000e' returning refunded_by::text$$),
  'a9000000-0000-4000-8000-00000000000e',
  'caution déjà remboursée : refunded_by / refunded_at non réécrits par le client');

select matches(pg_temp.valeur('a9000000-0000-4000-8000-00000000000a', null,
  $$select '1' from (select public.admin_update_password('a9000000-0000-4000-8000-00000000000e', null)) x$$),
  '^err=22004',
  'admin_update_password(…, NULL) : refusé');


select * from finish();
rollback;
