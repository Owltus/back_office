-- =============================================================================
-- 03_contraintes.test.sql — contraintes et triggers de garde, sous un compte
-- réel (authenticated). Base LOCALE seulement. Plan environnement-dev-docker,
-- étape 10 : `parking_no_overlap`, cases PDJ plafonnées, feuilles clôturées
-- figées (caisse, rapprochement).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.en_tant_que(p_compte text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  if p_compte is null then return; end if;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', (select id from public.profiles where email = p_compte || '@exemple.test'),
    'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- p_compte null = contexte système (postgres, auth.uid() nul).
create function pg_temp.essai(p_compte text, p_sql text, p_prep text default null)
returns text language plpgsql as $$
declare v_n bigint; v_res text;
begin
  begin
    if p_prep is not null then execute p_prep; end if;
    perform pg_temp.en_tant_que(p_compte);
    if p_sql ~* '^\s*(select|with)' then
      execute p_sql into v_n;
    else
      execute p_sql;
      get diagnostics v_n = row_count;
    end if;
    v_res := case when v_n > 0 then 'ok' else 'zero' end;
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v_res := 'err=' || sqlstate;
  end;
  return v_res;
end $$;

set local session_replication_role = replica;
delete from public.parking_reservations where spot = 14 and start_date + nights > current_date - 1;
insert into public.parking_reservations (id, spot, client, start_date, nights) values
  ('f0000000-0000-4000-8000-000000000101', 14, 'Fixture', current_date, 2);
delete from public.caisse_sheets where report_date = current_date;
insert into public.caisse_sheets (id, report_date, shift, status, validated_at) values
  ('f0000000-0000-4000-8000-000000000102', current_date, 'matin', 'validated', now());
delete from public.rapro_sheets where report_date = current_date - 1;
delete from public.rapro_rooms where report_date = current_date - 1 and room in (102, 103);
insert into public.rapro_sheets (id, report_date, status) values
  ('f0000000-0000-4000-8000-000000000103', current_date - 1, 'validated');
insert into public.rapro_rooms (id, report_date, room) values
  ('f0000000-0000-4000-8000-000000000104', current_date - 1, 102);
delete from public.pdj_breakfasts where service_date = current_date and room in (102, 103);
set local session_replication_role = origin;

select plan(16);

-- ------------------------------------------------------------- parking ----
select is(pg_temp.essai('ecriture',
  $q$insert into public.parking_reservations (spot, client, start_date, nights) values (14, 'T', current_date + 1, 1)$q$),
  'err=23P01', 'parking : place déjà prise sur une nuit commune → exclusion 23P01');
select is(pg_temp.essai('gestion',
  $q$insert into public.parking_reservations (spot, client, start_date, nights) values (14, 'T', current_date - 1, 2)$q$),
  'err=23P01', 'parking : chevauchement refusé même à la gestion');
select is(pg_temp.essai('ecriture',
  $q$insert into public.parking_reservations (spot, client, start_date, nights) values (14, 'T', current_date + 2, 1)$q$),
  'ok', 'parking : séjour contigu (départ = arrivée) accepté');
select is(pg_temp.essai('ecriture',
  $q$update public.parking_reservations set start_date = current_date - 10 where id = 'f0000000-0000-4000-8000-000000000101'$q$),
  'err=P0001', 'parking : reculer le début dans le passé verrouillé refusé hors gestion');

-- ----------------------------------------------------------------- PDJ ----
select is(pg_temp.essai('ecriture',
  $q$with i as (insert into public.pdj_breakfasts (service_date, room, addons, rate_plan, adults, breakfasts_included)
                values (current_date, 102, 'PDJ', 'BAR 4 PAX', 4, 4) returning breakfasts_included)
     select count(*) from i where breakfasts_included = 2$q$),
  'ok', 'PDJ : cases incluses plafonnées à 2 (ligne d''import)');
select is(pg_temp.essai('ecriture',
  $q$with i as (insert into public.pdj_breakfasts (service_date, room, addons, adults, breakfasts_included)
                values (current_date, 102, 'SANS', 2, 2) returning breakfasts_included)
     select count(*) from i where breakfasts_included = 0$q$),
  'ok', 'PDJ : sans addon PDJ, 0 inclus quoi qu''on écrive');
select is(pg_temp.essai('ecriture',
  $q$with i as (insert into public.pdj_breakfasts (service_date, room, manual_kind, breakfasts_included)
                values (current_date, 103, 'inclus', 3) returning breakfasts_included)
     select count(*) from i where breakfasts_included = 3$q$),
  'ok', 'PDJ : ligne manuelle laissée telle quelle');

-- --------------------------------------------------------------- caisse ----
select is(pg_temp.essai('ecriture',
  $q$update public.caisse_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000102'$q$),
  'err=42501', 'caisse clôturée : modification refusée (écriture)');
select is(pg_temp.essai('gestion',
  $q$update public.caisse_sheets set cnt_10 = 3 where id = 'f0000000-0000-4000-8000-000000000102'$q$),
  'err=42501', 'caisse clôturée : modification refusée (gestion aussi)');
select is(pg_temp.essai('ecriture',
  $q$update public.caisse_sheets set status = 'draft', validated_at = null where id = 'f0000000-0000-4000-8000-000000000102'$q$),
  'ok', 'caisse clôturée : réouverture permise');
select is(pg_temp.essai(null,
  $q$update public.caisse_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000102'$q$),
  'ok', 'caisse clôturée : contexte système non bloqué');

-- -------------------------------------------------------- rapprochement ----
select is(pg_temp.essai('ecriture',
  $q$insert into public.rapro_rooms (report_date, room) values (current_date - 1, 103)$q$),
  'err=42501', 'rapro clôturé : ajout d''une chambre refusé');
select is(pg_temp.essai('gestion',
  $q$update public.rapro_rooms set status = 'nettoyee' where id = 'f0000000-0000-4000-8000-000000000104'$q$),
  'err=42501', 'rapro clôturé : statut figé (gestion aussi)');
select is(pg_temp.essai('ecriture',
  $q$delete from public.rapro_rooms where id = 'f0000000-0000-4000-8000-000000000104'$q$),
  'err=42501', 'rapro clôturé : suppression refusée');
select is(pg_temp.essai('ecriture',
  $q$update public.rapro_rooms set status = 'nettoyee' where id = 'f0000000-0000-4000-8000-000000000104'$q$,
  $q$update public.rapro_sheets set status = 'draft' where id = 'f0000000-0000-4000-8000-000000000103'$q$),
  'ok', 'rapro rouvert : statut modifiable');
select is(pg_temp.essai(null,
  $q$update public.rapro_rooms set status = 'nettoyee' where id = 'f0000000-0000-4000-8000-000000000104'$q$),
  'ok', 'rapro clôturé : contexte système non bloqué');

select * from finish();
rollback;
