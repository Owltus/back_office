-- =============================================================================
-- 01_rls_matrice.test.sql — MATRICE RLS compte × table × opération × fenêtre.
-- Plan environnement-dev-docker-2026-10-12, étape 10. Base LOCALE seulement.
--
-- Principe (décision D15-A) : en local `postgres` est superuser et contourne la
-- RLS ; chaque essai s'exécute donc sous `authenticated` (ou `anon`) avec
-- `request.jwt.claims`, dans une sous-transaction TOUJOURS annulée
-- (`pg_temp.essai`). Le tout est dans `begin … rollback` : rien ne reste.
--
-- Oracle INDÉPENDANT des policies : `t_niveau` recopie à la main les droits
-- décrits en tête de `supabase/seed.sql`, et `pg_temp.attendu` traduit une
-- règle métier (r1 = lecture, r2 = écriture, g = gestion, fenêtres) en
-- résultat attendu. Résultats possibles d'un essai :
--   ok         la commande a touché (ou vu) au moins une ligne ;
--   zero       0 ligne, sans erreur (select/update/delete refusés par la RLS) ;
--   err=XXXXX  SQLSTATE levé (42501 = refus RLS d'un insert, ou de privilège).
-- Exhaustif sur les REFUS : chaque cas est joué pour TOUS les comptes.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- ---------------------------------------------------------------- comptes ---
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
    -- Compte révoqué : JWT valide, AUCUN profil (garde NULL).
    ('sans_profil', null, 'b0000000-0000-4000-8000-0000000000ff', 7),
    ('anon',        null, null, 8)
  ) as c(compte, email, repli, ordre)
  left join public.profiles p on p.email = c.email;

-- Spécification des droits de page (en-tête du seed), rang 1/2/3.
create temp table t_niveau (compte text, page text, rang int);
insert into t_niveau
select c, p, case
    when c in ('admin', 'gestion') then 3
    when c = 'ecriture' then 2
    when c = 'lecture' then 1
    when c = 'reception' then case p when 'repjour' then 1 when 'classeur' then 1
                                     when 'facturation' then 0 else 2 end
    else 0 end
  from unnest(array['admin','gestion','ecriture','lecture','aucun','reception','sans_profil','anon']) c,
       unnest(array['repjour','pdj','parking','rapro','caisse','affichage','facturation','literie','classeur']) p;

-- ------------------------------------------------------------- utilitaires ---
create function pg_temp.en_tant_que(p_compte text) returns void
language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  if p_compte is null then return; end if;
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

-- Exécute p_sql sous le compte, dans une sous-transaction ANNULÉE (le rôle
-- et les écritures reviennent avec elle). p_prep : préparation en postgres.
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

-- Règles : r1 / r2 / g (rang de page), admin, uid (tout authentifié),
-- profil (a un profil), auteur_ecriture (g, ou r2 ET auteur = compte ecriture),
-- jamais. Suffixe « ! » : le refus est une ERREUR 42501 pour tous (privilège
-- absent) ; suffixe « ? » : erreur 42501 pour qui passe le USING (rang >= 2 :
-- la NOUVELLE ligne échoue au WITH CHECK), 0 ligne pour les autres ; suffixe
-- « 0 » : le refus est toujours 0 ligne (oracle compté par une CTE).
create function pg_temp.attendu(p_regle text, p_compte text, p_page text, p_op text)
returns text language plpgsql as $$
declare
  r int := coalesce((select rang from t_niveau where compte = p_compte and page = p_page), 0);
  regle text := rtrim(p_regle, '!?0');
  permis boolean;
begin
  if p_compte = 'anon' then
    return 'err=42501';   -- anon : aucun privilège sur public
  end if;
  permis := case regle
    when 'r1' then r >= 1
    when 'r2' then r >= 2
    when 'g' then r = 3
    when 'admin' then p_compte = 'admin'
    when 'uid' then true
    when 'profil' then p_compte <> 'sans_profil'
    when 'auteur_ecriture' then r = 3 or (r >= 2 and p_compte = 'ecriture')
    when 'jamais' then false
  end;
  if permis is null then raise exception 'règle inconnue %', p_regle; end if;
  return case when permis then 'ok'
              when p_regle like '%0' then 'zero'
              when p_op = 'insert' or p_regle like '%!' then 'err=42501'
              when p_regle like '%?' and r >= 2 then 'err=42501'
              else 'zero' end;
end $$;

-- ---------------------------------------------------------------- données ---
-- Écrites en mode replica (valeurs exactes, triggers coupés), annulées à la fin.
set local session_replication_role = replica;

delete from public.pdj_breakfasts where service_date between current_date - 5 and current_date - 3 and room in (102, 103, 104);
delete from public.pdj_externals where service_date in (current_date - 3, current_date - 4);
delete from public.parking_reservations where spot in (13, 14);
delete from public.rapro_rooms where report_date in (current_date - 2, current_date - 3) and room in (102, 103);
delete from public.rapro_sheets where report_date in (current_date - 2, current_date - 3);
delete from public.caisse_sheets where report_date in (current_date - 1, current_date - 2);
delete from public.literie_sheets where report_date in (current_date - 2, current_date - 3);

insert into public.pdj_breakfasts (id, service_date, room, manual_kind) values
  ('f0000000-0000-4000-8000-000000000001', current_date - 3, 102, 'extra'),
  ('f0000000-0000-4000-8000-000000000002', current_date - 4, 102, 'extra'),
  ('f0000000-0000-4000-8000-000000000003', current_date - 3, 104, null);
insert into public.pdj_externals (service_date, count) values (current_date - 3, 1), (current_date - 4, 1);
insert into public.pdj_addon_production (id, service_date, code, total_count) values
  ('f0000000-0000-4000-8000-000000000004', current_date - 3, 'TSTX', 1),
  ('f0000000-0000-4000-8000-000000000005', current_date - 4, 'TSTX', 1);
-- Fenêtre parking : sur la FIN de séjour (start + nights >= J - 7).
insert into public.parking_reservations (id, spot, client, start_date, nights) values
  ('f0000000-0000-4000-8000-000000000006', 14, 'Fixture', current_date - 8, 1),
  ('f0000000-0000-4000-8000-000000000007', 14, 'Fixture', current_date - 9, 1);
insert into public.rapro_rooms (id, report_date, room) values
  ('f0000000-0000-4000-8000-000000000008', current_date - 2, 102),
  ('f0000000-0000-4000-8000-000000000009', current_date - 3, 102);
insert into public.rapro_sheets (id, report_date, status) values
  ('f0000000-0000-4000-8000-000000000010', current_date - 2, 'draft'),
  ('f0000000-0000-4000-8000-000000000011', current_date - 3, 'draft');
insert into public.caisse_sheets (id, report_date, shift, status) values
  ('f0000000-0000-4000-8000-000000000012', current_date - 1, 'matin', 'draft'),
  ('f0000000-0000-4000-8000-000000000013', current_date - 2, 'matin', 'draft');
insert into public.caisse_cautions (id, room, amount, taken_date) values
  ('f0000000-0000-4000-8000-000000000014', 102, 50, current_date),
  ('f0000000-0000-4000-8000-000000000015', 102, 50, current_date - 30),
  ('f0000000-0000-4000-8000-000000000016', 102, 50, current_date - 31);
insert into public.literie_sheets (id, report_date) values
  ('f0000000-0000-4000-8000-000000000017', current_date - 2),
  ('f0000000-0000-4000-8000-000000000018', current_date - 3);
insert into public.baby_cots (id, label) values
  ('f0000000-0000-4000-8000-000000000019', 'Lit fixture'),
  ('f0000000-0000-4000-8000-000000000026', 'Lit fixture libre');
insert into public.baby_cot_assignments (id, cot_id, start_date, end_date) values
  ('f0000000-0000-4000-8000-000000000020', 'f0000000-0000-4000-8000-000000000019', current_date - 5, current_date - 2),
  ('f0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000019', current_date - 6, current_date - 3);
insert into public.pms_daily_metrics (id, report_date, line_no, section) values
  ('f0000000-0000-4000-8000-000000000022', date '2099-01-01', 1, 'Fixture');
insert into public.affiche_templates (id, name, created_by) values
  ('f0000000-0000-4000-8000-000000000023', 'Fixture ecriture', (select uid from t_compte where compte = 'ecriture')),
  ('f0000000-0000-4000-8000-000000000024', 'Fixture admin',    (select uid from t_compte where compte = 'admin'));
insert into public.daily_reports (date, month, year, day_of_month, days_in_month,
  rj_nuitees, rj_to, rj_pm, rj_revpar, rj_room_revenue,
  rmtd_nuitees, rmtd_to, rmtd_pm, rmtd_revpar, rmtd_room_revenue,
  pm_nuitees, pm_to, pm_pm, pm_revpar, pm_room_revenue)
values (date '2099-01-01', 1, 2099, 1, 31, 1,1,1,1,1, 1,1,1,1,1, 1,1,1,1,1);
insert into public.budget (year, month, nuitees, taux_occupation, prix_moyen, revpar, room_revenue)
values (2099, 1, 1, 1, 1, 1, 1);
insert into public.forecast_days (date, month, year, occ, rev_ht, rev_ttc, adr_ttc, occ_percent)
values (date '2099-01-01', 1, 2099, 1, 1, 1, 1, 1);
insert into public.server_report_recipients (email) values ('fixture@exemple.test');
insert into public.audit_log (table_name, record_id, action) values ('fixture', 'fixture', 'INSERT');
insert into public.facturation_issuer_denylist (issuer, code) values ('FIXTURE', 'X');
-- Le compte révoqué EXISTE dans auth.users (banni), sans profil ; idem pour
-- l'identifiant que l'admin reçoit le droit de profiler.
insert into auth.users (id, email) values
  ('b0000000-0000-4000-8000-0000000000ff', 'revoque@exemple.test'),
  ('c0000000-0000-4000-8000-000000000001', 'neuf@exemple.test');
-- Sorties de fenêtre : places libres à l'arrivée.
delete from public.rapro_rooms where report_date = current_date - 4 and room = 102;
delete from public.rapro_sheets where report_date = current_date - 4;  -- jour non clôturé
delete from public.caisse_sheets where report_date = current_date - 3 and shift = 'matin';

set local session_replication_role = origin;

-- ------------------------------------------------------------------ cas ---
create temp table t_cas (
  ord serial, tbl text, page text, op text, cas text, regle text,
  sql text, prep text, comptes text[]
);

-- Valeurs d'un rapport (daily_reports) : 20 colonnes obligatoires.
create function pg_temp.dr(p_date text) returns text language sql as $$
  select format('insert into public.daily_reports (date, month, year, day_of_month, days_in_month,
    rj_nuitees, rj_to, rj_pm, rj_revpar, rj_room_revenue, rmtd_nuitees, rmtd_to, rmtd_pm, rmtd_revpar,
    rmtd_room_revenue, pm_nuitees, pm_to, pm_pm, pm_revpar, pm_room_revenue)
    values (date %L, 1, 2099, 2, 31, 1,1,1,1,1, 1,1,1,1,1, 1,1,1,1,1)', p_date) $$;

insert into t_cas (tbl, page, op, cas, regle, sql, prep) values
-- PDJ : fenêtre 3 jours (J-3 dans la fenêtre, J-4 hors fenêtre).
('pdj_breakfasts','pdj','select','fixture','r1', $q$select count(*) from public.pdj_breakfasts where id = 'f0000000-0000-4000-8000-000000000001'$q$, null),
('pdj_breakfasts','pdj','insert','J-3','r2', $q$insert into public.pdj_breakfasts (service_date, room, manual_kind) values (current_date - 3, 103, 'extra')$q$, null),
('pdj_breakfasts','pdj','insert','J-4','g', $q$insert into public.pdj_breakfasts (service_date, room, manual_kind) values (current_date - 4, 103, 'extra')$q$, null),
('pdj_breakfasts','pdj','update','J-3','r2', $q$update public.pdj_breakfasts set served = not served where id = 'f0000000-0000-4000-8000-000000000001'$q$, null),
('pdj_breakfasts','pdj','update','J-4','g', $q$update public.pdj_breakfasts set served = not served where id = 'f0000000-0000-4000-8000-000000000002'$q$, null),
('pdj_breakfasts','pdj','update','J-3 → J-5 (sortie de fenêtre)','g?', $q$update public.pdj_breakfasts set service_date = current_date - 5 where id = 'f0000000-0000-4000-8000-000000000001'$q$, null),
-- Une ligne IMPORTÉE ne devient pas manuelle hors gestion (sinon supprimable
-- et hors plafond) : trigger pdj_breakfasts_manual_kind_fige, 42501.
('pdj_breakfasts','pdj','update','import → manuel','g?', $q$update public.pdj_breakfasts set manual_kind = 'extra' where id = 'f0000000-0000-4000-8000-000000000003'$q$, null),
('pdj_breakfasts','pdj','update','manuel extra → inclus','r2', $q$update public.pdj_breakfasts set manual_kind = 'inclus' where id = 'f0000000-0000-4000-8000-000000000001'$q$, null),
('pdj_breakfasts','pdj','delete','manuel J-3','r2', $q$delete from public.pdj_breakfasts where id = 'f0000000-0000-4000-8000-000000000001'$q$, null),
('pdj_breakfasts','pdj','delete','manuel J-4','g', $q$delete from public.pdj_breakfasts where id = 'f0000000-0000-4000-8000-000000000002'$q$, null),
('pdj_breakfasts','pdj','delete','import J-3','g', $q$delete from public.pdj_breakfasts where id = 'f0000000-0000-4000-8000-000000000003'$q$, null),
('pdj_externals','pdj','select','fixture','r1', $q$select count(*) from public.pdj_externals where service_date = current_date - 3$q$, null),
('pdj_externals','pdj','insert','J-3','r2', $q$insert into public.pdj_externals (service_date, count) values (current_date - 3, 2)$q$, $q$delete from public.pdj_externals where service_date = current_date - 3$q$),
('pdj_externals','pdj','insert','J-4','g', $q$insert into public.pdj_externals (service_date, count) values (current_date - 4, 2)$q$, $q$delete from public.pdj_externals where service_date = current_date - 4$q$),
('pdj_externals','pdj','update','J-3','r2', $q$update public.pdj_externals set count = count + 1 where service_date = current_date - 3$q$, null),
('pdj_externals','pdj','update','J-4','g', $q$update public.pdj_externals set count = count + 1 where service_date = current_date - 4$q$, null),
('pdj_externals','pdj','delete','J-3','g', $q$delete from public.pdj_externals where service_date = current_date - 3$q$, null),
('pdj_addon_production','pdj','select','fixture','r1', $q$select count(*) from public.pdj_addon_production where id = 'f0000000-0000-4000-8000-000000000004'$q$, null),
('pdj_addon_production','pdj','insert','J-3','r2', $q$insert into public.pdj_addon_production (service_date, code) values (current_date - 3, 'TSTY')$q$, null),
('pdj_addon_production','pdj','insert','J-4','g', $q$insert into public.pdj_addon_production (service_date, code) values (current_date - 4, 'TSTY')$q$, null),
('pdj_addon_production','pdj','update','J-3','r2', $q$update public.pdj_addon_production set total_count = 2 where id = 'f0000000-0000-4000-8000-000000000004'$q$, null),
('pdj_addon_production','pdj','update','J-4','g', $q$update public.pdj_addon_production set total_count = 2 where id = 'f0000000-0000-4000-8000-000000000005'$q$, null),
('pdj_addon_production','pdj','delete','J-3','g', $q$delete from public.pdj_addon_production where id = 'f0000000-0000-4000-8000-000000000004'$q$, null),
('pdj_daily_agg','pdj','select','vue','r1', $q$select count(*) from public.pdj_daily_agg where service_date = current_date - 3$q$, null),
('pdj_service_dates','pdj','select','vue','r1', $q$select count(*) from public.pdj_service_dates$q$, null),
-- Parking : fenêtre 7 jours sur la FIN du séjour ; création sur le début.
('parking_reservations','parking','select','fixture','r1', $q$select count(*) from public.parking_reservations where id = 'f0000000-0000-4000-8000-000000000006'$q$, null),
('parking_reservations','parking','insert','début J-7','r2', $q$insert into public.parking_reservations (spot, client, start_date, nights) values (13, 'T', current_date - 7, 1)$q$, null),
('parking_reservations','parking','insert','début J-8','g', $q$insert into public.parking_reservations (spot, client, start_date, nights) values (13, 'T', current_date - 8, 1)$q$, null),
('parking_reservations','parking','update','fin J-7','r2', $q$update public.parking_reservations set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000006'$q$, null),
('parking_reservations','parking','update','fin J-8','g', $q$update public.parking_reservations set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000007'$q$, null),
('parking_reservations','parking','delete','fin J-7','r2', $q$delete from public.parking_reservations where id = 'f0000000-0000-4000-8000-000000000006'$q$, null),
('parking_reservations','parking','delete','fin J-8','g', $q$delete from public.parking_reservations where id = 'f0000000-0000-4000-8000-000000000007'$q$, null),
('parking_daily_occupation','parking','select','vue','r1', $q$select count(*) from public.parking_daily_occupation$q$, null),
('parking_arrivals_agg','parking','select','vue','r1', $q$select count(*) from public.parking_arrivals_agg$q$, null),
('parking_tarifs','parking','select','seed','r1', $q$select count(*) from public.parking_tarifs$q$, null),
('parking_tarifs','parking','insert','-','jamais', $q$insert into public.parking_tarifs default values$q$, null),
('parking_tarifs','parking','update','-','jamais', $q$update public.parking_tarifs set price_ttc = price_ttc$q$, null),
('parking_tarifs','parking','delete','-','jamais', $q$delete from public.parking_tarifs$q$, null),
-- Rapprochement : fenêtre 2 jours.
('rapro_rooms','rapro','select','fixture','r1', $q$select count(*) from public.rapro_rooms where id = 'f0000000-0000-4000-8000-000000000008'$q$, null),
('rapro_rooms','rapro','insert','J-2','r2', $q$insert into public.rapro_rooms (report_date, room) values (current_date - 2, 103)$q$, null),
('rapro_rooms','rapro','insert','J-3','g', $q$insert into public.rapro_rooms (report_date, room) values (current_date - 3, 103)$q$, null),
('rapro_rooms','rapro','update','J-2','r2', $q$update public.rapro_rooms set status = 'nettoyee' where id = 'f0000000-0000-4000-8000-000000000008'$q$, null),
('rapro_rooms','rapro','update','J-3','g', $q$update public.rapro_rooms set status = 'nettoyee' where id = 'f0000000-0000-4000-8000-000000000009'$q$, null),
('rapro_rooms','rapro','update','J-2 → J-4 (sortie de fenêtre)','g?', $q$update public.rapro_rooms set report_date = current_date - 4 where id = 'f0000000-0000-4000-8000-000000000008'$q$, null),
('rapro_rooms','rapro','delete','J-2','r2', $q$delete from public.rapro_rooms where id = 'f0000000-0000-4000-8000-000000000008'$q$, null),
('rapro_rooms','rapro','delete','J-3','g', $q$delete from public.rapro_rooms where id = 'f0000000-0000-4000-8000-000000000009'$q$, null),
('rapro_sheets','rapro','select','fixture','r1', $q$select count(*) from public.rapro_sheets where id = 'f0000000-0000-4000-8000-000000000010'$q$, null),
('rapro_sheets','rapro','insert','J-2','r2', $q$insert into public.rapro_sheets (report_date) values (current_date - 2)$q$, $q$delete from public.rapro_sheets where id = 'f0000000-0000-4000-8000-000000000010'$q$),
('rapro_sheets','rapro','insert','J-3','g', $q$insert into public.rapro_sheets (report_date) values (current_date - 3)$q$, $q$delete from public.rapro_sheets where id = 'f0000000-0000-4000-8000-000000000011'$q$),
('rapro_sheets','rapro','update','J-2','r2', $q$update public.rapro_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000010'$q$, null),
('rapro_sheets','rapro','update','J-3','g', $q$update public.rapro_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000011'$q$, null),
('rapro_sheets','rapro','delete','J-2','r2', $q$delete from public.rapro_sheets where id = 'f0000000-0000-4000-8000-000000000010'$q$, null),
('rapro_sheets','rapro','delete','J-3','g', $q$delete from public.rapro_sheets where id = 'f0000000-0000-4000-8000-000000000011'$q$, null),
('rapro_daily_agg','rapro','select','vue','r1', $q$select count(*) from public.rapro_daily_agg$q$, null),
-- Caisse : feuilles 1 jour ; cautions 30 jours (modif), jour même (suppression).
('caisse_sheets','caisse','select','fixture','r1', $q$select count(*) from public.caisse_sheets where id = 'f0000000-0000-4000-8000-000000000012'$q$, null),
('caisse_sheets','caisse','insert','J-1','r2', $q$insert into public.caisse_sheets (report_date, shift) values (current_date - 1, 'soir')$q$, null),
('caisse_sheets','caisse','insert','J-2','g', $q$insert into public.caisse_sheets (report_date, shift) values (current_date - 2, 'soir')$q$, null),
('caisse_sheets','caisse','update','J-1','r2', $q$update public.caisse_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000012'$q$, null),
('caisse_sheets','caisse','update','J-2','g', $q$update public.caisse_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000013'$q$, null),
('caisse_sheets','caisse','update','J-1 → J-3 (sortie de fenêtre)','g?', $q$update public.caisse_sheets set report_date = current_date - 3 where id = 'f0000000-0000-4000-8000-000000000012'$q$, null),
('caisse_sheets','caisse','delete','J-1','g', $q$delete from public.caisse_sheets where id = 'f0000000-0000-4000-8000-000000000012'$q$, null),
('caisse_cautions','caisse','select','fixture','r1', $q$select count(*) from public.caisse_cautions where id = 'f0000000-0000-4000-8000-000000000015'$q$, null),
('caisse_cautions','caisse','insert','J-40','r2', $q$insert into public.caisse_cautions (room, amount, taken_date) values (102, 10, current_date - 40)$q$, null),
('caisse_cautions','caisse','update','J','r2', $q$update public.caisse_cautions set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000014'$q$, null),
('caisse_cautions','caisse','update','J-30','r2', $q$update public.caisse_cautions set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000015'$q$, null),
('caisse_cautions','caisse','update','J-31','g', $q$update public.caisse_cautions set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000016'$q$, null),
('caisse_cautions','caisse','delete','J','r2', $q$delete from public.caisse_cautions where id = 'f0000000-0000-4000-8000-000000000014'$q$, null),
('caisse_cautions','caisse','delete','J-30','g', $q$delete from public.caisse_cautions where id = 'f0000000-0000-4000-8000-000000000015'$q$, null),
('caisse_cautions','caisse','delete','J-31','g', $q$delete from public.caisse_cautions where id = 'f0000000-0000-4000-8000-000000000016'$q$, null),
-- Literie : feuilles et lits bébé 2 jours.
('literie_sheets','literie','select','fixture','r1', $q$select count(*) from public.literie_sheets where id = 'f0000000-0000-4000-8000-000000000017'$q$, null),
('literie_sheets','literie','insert','J-2','r2', $q$insert into public.literie_sheets (report_date) values (current_date - 2)$q$, $q$delete from public.literie_sheets where id = 'f0000000-0000-4000-8000-000000000017'$q$),
('literie_sheets','literie','insert','J-3','g', $q$insert into public.literie_sheets (report_date) values (current_date - 3)$q$, $q$delete from public.literie_sheets where id = 'f0000000-0000-4000-8000-000000000018'$q$),
('literie_sheets','literie','update','J-2','r2', $q$update public.literie_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000017'$q$, null),
('literie_sheets','literie','update','J-3','g', $q$update public.literie_sheets set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000018'$q$, null),
('literie_sheets','literie','delete','J-2','jamais', $q$delete from public.literie_sheets where id = 'f0000000-0000-4000-8000-000000000017'$q$, null),
('baby_cot_assignments','literie','select','fixture','r1', $q$select count(*) from public.baby_cot_assignments where id = 'f0000000-0000-4000-8000-000000000020'$q$, null),
('baby_cot_assignments','literie','insert','début J-2','r2', $q$insert into public.baby_cot_assignments (cot_id, start_date, end_date) values ('f0000000-0000-4000-8000-000000000019', current_date - 2, current_date)$q$, null),
('baby_cot_assignments','literie','insert','début J-3','g', $q$insert into public.baby_cot_assignments (cot_id, start_date, end_date) values ('f0000000-0000-4000-8000-000000000019', current_date - 3, current_date)$q$, null),
('baby_cot_assignments','literie','update','fin J-2','r2', $q$update public.baby_cot_assignments set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000020'$q$, null),
('baby_cot_assignments','literie','update','fin J-3','g', $q$update public.baby_cot_assignments set comment = 'x' where id = 'f0000000-0000-4000-8000-000000000021'$q$, null),
-- Début reculé hors fenêtre (J-5 → J-6) : gestion seule (trigger
-- baby_cot_assignments_no_past_rewrite, 42501) ; avancé : écriture.
('baby_cot_assignments','literie','update','début reculé J-6','g?', $q$update public.baby_cot_assignments set start_date = current_date - 6 where id = 'f0000000-0000-4000-8000-000000000020'$q$, null),
('baby_cot_assignments','literie','update','début avancé J-4','r2', $q$update public.baby_cot_assignments set start_date = current_date - 4 where id = 'f0000000-0000-4000-8000-000000000020'$q$, null),
('baby_cot_assignments','literie','delete','fin J-2','r2', $q$delete from public.baby_cot_assignments where id = 'f0000000-0000-4000-8000-000000000020'$q$, null),
('baby_cot_assignments','literie','delete','fin J-3','g', $q$delete from public.baby_cot_assignments where id = 'f0000000-0000-4000-8000-000000000021'$q$, null),
('baby_cots','literie','select','fixture','r1', $q$select count(*) from public.baby_cots where id = 'f0000000-0000-4000-8000-000000000019'$q$, null),
('baby_cots','literie','insert','-','g', $q$insert into public.baby_cots (label) values ('T')$q$, null),
('baby_cots','literie','update','-','g', $q$update public.baby_cots set label = 'T' where id = 'f0000000-0000-4000-8000-000000000019'$q$, null),
('baby_cots','literie','delete','-','g', $q$delete from public.baby_cots where id = 'f0000000-0000-4000-8000-000000000026'$q$, null),
('hotel_rooms','literie','select','seed','r1', $q$select count(*) from public.hotel_rooms where room = 102$q$, null),
('hotel_rooms','literie','insert','-','jamais', $q$insert into public.hotel_rooms (room) values (999)$q$, null),
('hotel_rooms','literie','update','-','r2', $q$update public.hotel_rooms set literie_synthetique = not literie_synthetique where room = 102$q$, null),
-- Numéro de chambre figé pour tout compte (trigger hotel_rooms_room_fige).
('hotel_rooms','literie','update','renuméroter','jamais?', $q$update public.hotel_rooms set room = 999 where room = 102$q$, null),
('hotel_rooms','literie','delete','-','jamais', $q$delete from public.hotel_rooms where room = 102$q$, null),
('literie_stock','literie','select','seed','r1', $q$select count(*) from public.literie_stock$q$, null),
('literie_stock','literie','insert','-','jamais', $q$insert into public.literie_stock default values$q$, null),
('literie_stock','literie','update','-','jamais', $q$update public.literie_stock set synthetic_pillows = synthetic_pillows$q$, null),
('literie_stock','literie','delete','-','jamais', $q$delete from public.literie_stock$q$, null),
('literie_stock_movements','literie','select','seed','r1', $q$select count(*) from public.literie_stock_movements$q$, null),
('literie_stock_movements','literie','insert','-','jamais', $q$insert into public.literie_stock_movements (room, item, direction) values (102, 'oreiller', 'retour')$q$, null),
('literie_stock_movements','literie','update','-','jamais', $q$update public.literie_stock_movements set quantity = quantity$q$, null),
('literie_stock_movements','literie','delete','-','jamais', $q$delete from public.literie_stock_movements$q$, null),
-- RepJour (sans fenêtre de date : rang de page seul).
('daily_reports','repjour','select','fixture','r1', $q$select count(*) from public.daily_reports where date = date '2099-01-01'$q$, null),
('daily_reports','repjour','insert','-','r2', pg_temp.dr('2099-01-02'), null),
('daily_reports','repjour','update','-','r2', $q$update public.daily_reports set alerts = alerts where date = date '2099-01-01'$q$, null),
('daily_reports','repjour','delete','-','r2', $q$delete from public.daily_reports where date = date '2099-01-01'$q$, null),
('budget','repjour','select','fixture','r1', $q$select count(*) from public.budget where year = 2099$q$, null),
('budget','repjour','insert','-','g', $q$insert into public.budget (year, month, nuitees, taux_occupation, prix_moyen, revpar, room_revenue) values (2099, 2, 1, 1, 1, 1, 1)$q$, null),
('budget','repjour','update','-','g', $q$update public.budget set nuitees = 2 where year = 2099$q$, null),
('budget','repjour','delete','-','g', $q$delete from public.budget where year = 2099$q$, null),
-- 2099 n'est jamais le mois d'import : l'écriture manuelle est fermée.
('forecast_days','repjour','select','fixture','r1', $q$select count(*) from public.forecast_days where date = date '2099-01-01'$q$, null),
('forecast_days','repjour','insert','2099','g', $q$insert into public.forecast_days (date, month, year, occ, rev_ht, rev_ttc, adr_ttc, occ_percent) values (date '2099-01-02', 1, 2099, 1, 1, 1, 1, 1)$q$, null),
('forecast_days','repjour','update','2099','g', $q$update public.forecast_days set occ = 2 where date = date '2099-01-01'$q$, null),
('forecast_days','repjour','delete','2099','g', $q$delete from public.forecast_days where date = date '2099-01-01'$q$, null),
('pms_daily_metrics','repjour','select','fixture','r1', $q$select count(*) from public.pms_daily_metrics where id = 'f0000000-0000-4000-8000-000000000022'$q$, null),
('pms_daily_metrics','repjour','insert','-','r2', $q$insert into public.pms_daily_metrics (report_date, line_no, section) values (date '2099-01-01', 2, 'T')$q$, null),
('pms_daily_metrics','repjour','update','-','r2', $q$update public.pms_daily_metrics set today = 1 where id = 'f0000000-0000-4000-8000-000000000022'$q$, null),
('pms_daily_metrics','repjour','delete','-','r2', $q$delete from public.pms_daily_metrics where id = 'f0000000-0000-4000-8000-000000000022'$q$, null),
('server_report_recipients','repjour','select','fixture','r1', $q$select count(*) from public.server_report_recipients where email = 'fixture@exemple.test'$q$, null),
('server_report_recipients','repjour','insert','-','g', $q$insert into public.server_report_recipients (email) values ('nouveau@exemple.test')$q$, null),
('server_report_recipients','repjour','update','-','g', $q$update public.server_report_recipients set name = 'x' where email = 'fixture@exemple.test'$q$, null),
('server_report_recipients','repjour','delete','-','g', $q$delete from public.server_report_recipients where email = 'fixture@exemple.test'$q$, null),
('repjour_auto_send_log','repjour','select','seed','g', $q$select count(*) from public.repjour_auto_send_log$q$, null),
('repjour_auto_send_log','repjour','insert','-','jamais', $q$insert into public.repjour_auto_send_log default values$q$, null),
('repjour_auto_send_log','repjour','update','-','jamais!', $q$update public.repjour_auto_send_log set note = note$q$, null),
('repjour_auto_send_log','repjour','delete','-','jamais!', $q$delete from public.repjour_auto_send_log$q$, null),
-- Affichage : modification/suppression = gestion, ou écriture sur SES modèles.
('affiche_templates','affichage','select','fixture','r1', $q$select count(*) from public.affiche_templates where id = 'f0000000-0000-4000-8000-000000000023'$q$, null),
('affiche_templates','affichage','insert','-','r2', $q$insert into public.affiche_templates (name) values ('T')$q$, null),
('affiche_templates','affichage','update','modèle du compte ecriture','auteur_ecriture', $q$update public.affiche_templates set name = 'x' where id = 'f0000000-0000-4000-8000-000000000023'$q$, null),
('affiche_templates','affichage','update','modèle de l''admin','g', $q$update public.affiche_templates set name = 'x' where id = 'f0000000-0000-4000-8000-000000000024'$q$, null),
('affiche_templates','affichage','delete','modèle du compte ecriture','auteur_ecriture', $q$delete from public.affiche_templates where id = 'f0000000-0000-4000-8000-000000000023'$q$, null),
('affiche_templates','affichage','delete','modèle de l''admin','g', $q$delete from public.affiche_templates where id = 'f0000000-0000-4000-8000-000000000024'$q$, null),
-- Transverse / administration.
('audit_log','-','select','fixture','admin', $q$select count(*) from public.audit_log where record_id = 'fixture'$q$, null),
('audit_log','-','insert','-','jamais', $q$insert into public.audit_log (table_name, record_id, action) values ('x', 'x', 'INSERT')$q$, null),
('audit_log','-','update','-','jamais!', $q$update public.audit_log set action = action$q$, null),
('audit_log','-','delete','-','jamais!', $q$delete from public.audit_log$q$, null),
('hotel_config','-','select','-','uid', $q$select count(*) from public.hotel_config$q$, null),
('hotel_config','-','insert','-','jamais', $q$insert into public.hotel_config default values$q$, $q$delete from public.hotel_config$q$),
('hotel_config','-','update','-','admin', $q$update public.hotel_config set name = name$q$, null),
('hotel_config','-','delete','-','jamais', $q$delete from public.hotel_config$q$, null),
('easter_eggs','-','select','-','uid', $q$select count(*) from public.easter_eggs$q$, null),
('easter_eggs','-','insert','-','admin', $q$insert into public.easter_eggs (keyword, effect_id) values ('fixture-mot', 'x')$q$, null),
('easter_eggs','-','update','-','admin', $q$update public.easter_eggs set enabled = enabled$q$, null),
('easter_eggs','-','delete','-','admin', $q$delete from public.easter_eggs$q$, null),
('profiles','-','select','son profil','profil', $q$select count(*) from public.profiles where id = auth.uid()$q$, null),
('profiles','-','select','profils des autres','admin', $q$select count(*) from public.profiles where id is distinct from auth.uid()$q$, null),
('profiles','-','insert','autre id, rôle utilisateur','admin', $q$insert into public.profiles (id, email, role) values ('c0000000-0000-4000-8000-000000000001', 'neuf@exemple.test', 'utilisateur')$q$, null),
('profiles','-','update','son nom affiché','profil', $q$update public.profiles set display_name = 'x' where id = auth.uid()$q$, null),
('profiles','-','update','profil d''un autre','admin', $q$update public.profiles set display_name = 'x' where email = 'lecture@exemple.test' and id is distinct from auth.uid()$q$, null),
('profiles','-','delete','profil d''un autre','admin', $q$delete from public.profiles where email = 'aucun@exemple.test' and id is distinct from auth.uid()$q$, null),
('user_page_permissions','-','select','droits des autres','admin', $q$select count(*) from public.user_page_permissions where user_id is distinct from auth.uid()$q$, null),
('user_page_permissions','-','insert','se donner gestion','jamais', $q$insert into public.user_page_permissions (user_id, page, level) values (auth.uid(), 'facturation', 'gestion')$q$, $q$delete from public.user_page_permissions where page = 'facturation'$q$),
('user_page_permissions','-','update','monter son droit','jamais', $q$update public.user_page_permissions set level = 'gestion' where user_id = auth.uid()$q$, null),
('user_page_permissions','-','delete','-','jamais', $q$delete from public.user_page_permissions$q$, null),
('report_send_throttle','-','select','-','jamais', $q$select count(*) from public.report_send_throttle$q$, null),
('report_send_throttle','-','insert','-','jamais', $q$insert into public.report_send_throttle (user_id) values (auth.uid())$q$, $q$delete from public.report_send_throttle$q$),
('report_send_throttle','-','update','-','jamais', $q$update public.report_send_throttle set recent_sends = recent_sends$q$, null),
('report_send_throttle','-','delete','-','jamais', $q$delete from public.report_send_throttle$q$, null);

-- Facturation : lecture au rang 1, AUCUNE écriture directe (RPC seulement).
insert into t_cas (tbl, page, op, cas, regle, sql, prep)
select t, 'facturation', op, '-', case op when 'select' then 'r1' else 'jamais' end,
       case op
         when 'select' then format('select count(*) from public.%I', t)
         when 'insert' then format('insert into public.%I default values', t)
         when 'update' then format('update public.%I set %I = %I', t, col, col)
         else format('delete from public.%I', t) end,
       null
  from (values ('facturation_budget_lines', 'label'), ('facturation_issuer_codes', 'count'),
               ('facturation_issuer_denylist', 'code'), ('facturation_issuers', 'count'),
               ('facturation_learned_docs', 'method'), ('facturation_ref_comptes', 'libelle'),
               ('facturation_ref_imputations', 'libelle'), ('facturation_wordpool', 'count')) f(t, col),
       unnest(array['select', 'insert', 'update', 'delete']) op;
insert into t_cas (tbl, page, op, cas, regle, sql, prep) values
('facturation_issuer_memory','facturation','select','vue','r1', $q$select count(*) from public.facturation_issuer_memory$q$, null);

-- Cas réservés à certains comptes.
insert into t_cas (tbl, page, op, cas, regle, sql, prep, comptes) values
-- Escalade : un utilisateur ne change pas son propre rôle. La ligne est bien
-- écrite (le trigger `protect_role_escalation` remet l'ancien rôle EN SILENCE) :
-- l'oracle est donc « aucune ligne admin au retour ».
('profiles','-','update','se nommer admin','jamais', $q$with u as (update public.profiles set role = 'admin' where id = auth.uid() returning role) select count(*) from u where role = 'admin'$q$, null,
  array['gestion','ecriture','lecture','aucun','reception']),
-- Compte révoqué (auth.users sans profil) : ne se recrée pas un profil admin.
-- Refus par la RLS (42501) depuis 20261017110000_regles_ecriture ; avant, la
-- ligne passait et le trigger forçait « utilisateur » (oracle « 0 admin »).
('profiles','-','insert','se recréer admin','jamais', $q$with i as (insert into public.profiles (id, email, role) values (auth.uid(), 'revoque@exemple.test', 'admin') returning role) select count(*) from i where role = 'admin'$q$, null,
  array['sans_profil']),
-- Un compte révoqué ne se recrée pas non plus un profil « utilisateur »
-- (insertion réservée à l'admin depuis 20261017110000_regles_ecriture).
('profiles','-','insert','se recréer utilisateur','jamais', $q$insert into public.profiles (id, email, role) values (auth.uid(), 'revoque@exemple.test', 'utilisateur')$q$, null,
  array['sans_profil']),
-- Un compte non admin ne crée pas le profil d'un AUTRE.
('profiles','-','insert','profil d''un autre, rôle admin','jamais', $q$with i as (insert into public.profiles (id, email, role) values ('c0000000-0000-4000-8000-000000000001', 'neuf@exemple.test', 'admin') returning role) select count(*) from i$q$, null,
  array['gestion','ecriture','lecture','aucun','reception','sans_profil']);

-- ---------------------------------------------------------------- tests ---
create function pg_temp.matrice() returns setof text language plpgsql as $$
declare m record; c record;
begin
  for m in select * from t_cas order by ord loop
    for c in select * from t_compte
              where m.comptes is null or compte = any (m.comptes) order by ordre loop
      return next is(
        pg_temp.essai(c.compte, m.sql, m.prep),
        pg_temp.attendu(m.regle, c.compte, m.page, m.op),
        format('%s %s [%s] — %s', m.tbl, m.op, m.cas, c.compte));
    end loop;
  end loop;
end $$;

select plan(
  2 + (select count(*)::int from t_cas m join t_compte c on m.comptes is null or c.compte = any (m.comptes)));

-- Garde-fous de la fixture : l'oracle suppose les comptes du seed.
select is((select count(*)::int from t_compte where uid is not null), 7, 'les 6 comptes du seed existent (+ sans profil)');
select is(
  (select string_agg(u.page || ':' || u.level, ',' order by u.page)
     from public.user_page_permissions u join t_compte c on c.uid = u.user_id where c.compte = 'reception'),
  'affichage:ecriture,caisse:ecriture,classeur:lecture,literie:ecriture,parking:ecriture,pdj:ecriture,rapro:ecriture,repjour:lecture',
  'droits du compte reception conformes à la spécification');

select * from pg_temp.matrice();

select * from finish();
rollback;
