-- =============================================================================
-- 91_audit_rls.test.sql — audit de sécurité RLS du 2026-10-17 (base LOCALE).
--
-- Fige ce que 01_rls_matrice et 04_classeur_acces ne couvrent pas : les
-- contournements EN DEUX TEMPS (un UPDATE qui fait entrer la ligne dans le
-- USING d'un DELETE plus strict), les fenêtres que l'UPDATE élargit, et les
-- colonnes d'auteur figées.
--
-- Comptes créés DANS la transaction (aucune dépendance au seed : le fichier
-- tourne aussi sur une copie de la prod). Tout est annulé à la fin.
--
-- Les cas « F1 » à « F3 » figent les défauts trouvés par l'audit et corrigés
-- le même jour (migrations 20261017100000 et 20261017110000).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- ---------------------------------------------------------------- comptes ---
create temp table t_compte (compte text primary key, uid uuid);
insert into t_compte values
  ('lecture',  'a0d17000-0000-4000-8000-0000000000a1'),
  ('ecriture', 'a0d17000-0000-4000-8000-0000000000a2'),
  ('gestion',  'a0d17000-0000-4000-8000-0000000000a3'),
  ('admin',    'a0d17000-0000-4000-8000-0000000000a4');
insert into auth.users (id, email)
  select uid, 'audit90-' || compte || '@exemple.test' from t_compte;
insert into public.profiles (id, email, role)
  select uid, 'audit90-' || compte || '@exemple.test', 'utilisateur' from t_compte;
set local session_replication_role = replica;
update public.profiles set role = 'admin' where id = 'a0d17000-0000-4000-8000-0000000000a4';
set local session_replication_role = origin;
insert into public.user_page_permissions (user_id, page, level)
  select c.uid, p, case c.compte when 'lecture' then 'lecture' when 'ecriture' then 'ecriture' else 'gestion' end
    from t_compte c, unnest(array['pdj','caisse','literie','classeur','affichage']) p
   where c.compte <> 'admin';

-- ------------------------------------------------------------- utilitaires ---
create function pg_temp.en_tant_que(p_compte text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select uid from t_compte where compte = p_compte),
                      'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Exécute les commandes sous le compte, dans une sous-transaction ANNULÉE.
-- Rend le nombre de lignes de la DERNIÈRE commande, ou err=SQLSTATE.
create function pg_temp.essai(p_compte text, p_sqls text[]) returns text
language plpgsql as $$
declare v_n bigint; s text; v_res text;
begin
  begin
    perform pg_temp.en_tant_que(p_compte);
    foreach s in array p_sqls loop
      if s ~* '^\s*(select|with)' then execute s into v_n;
      else execute s; get diagnostics v_n = row_count; end if;
    end loop;
    v_res := v_n::text;
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v_res := 'err=' || sqlstate;
  end;
  return v_res;
end $$;

-- ---------------------------------------------------------------- données ---
insert into public.pdj_breakfasts (id, service_date, room, guest_name, adults, addons)
  values ('a0d17000-0000-4000-8000-000000000010', current_date, 101, 'AUDIT FICTIF', 2, 'PDJ');
insert into public.caisse_cautions (id, room, amount, taken_date)
  values ('a0d17000-0000-4000-8000-000000000011', 101, 50, current_date - 20);
insert into public.baby_cots (id, label) values ('a0d17000-0000-4000-8000-000000000012', 'audit90');
insert into public.baby_cot_assignments (id, cot_id, start_date, end_date)
  values ('a0d17000-0000-4000-8000-000000000013', 'a0d17000-0000-4000-8000-000000000012', current_date, current_date);

select plan(12);

-- --------------------------------------------------- invariants qui tiennent ---
select is(pg_temp.essai('ecriture', array[
  $$delete from public.pdj_breakfasts where id = 'a0d17000-0000-4000-8000-000000000010'$$]),
  '0', 'PDJ : une ligne IMPORTÉE ne se supprime pas directement au rang écriture');
select is(pg_temp.essai('gestion', array[
  $$delete from public.pdj_breakfasts where id = 'a0d17000-0000-4000-8000-000000000010'$$]),
  '1', 'PDJ : la gestion supprime une ligne importée');
select is(pg_temp.essai('ecriture', array[
  $$delete from public.caisse_cautions where id = 'a0d17000-0000-4000-8000-000000000011'$$]),
  '0', 'Caution de J-20 : pas de suppression directe au rang écriture');
select is(pg_temp.essai('lecture', array[
  $$update public.caisse_cautions set taken_date = current_date where id = 'a0d17000-0000-4000-8000-000000000011'$$]),
  '0', 'Caution : le rang lecture ne modifie rien');
select is(pg_temp.essai('ecriture', array[
  $$with i as (insert into public.affiche_templates (name, created_by) values ('a', 'a0d17000-0000-4000-8000-0000000000a4') returning created_by)
    select count(*) from i where created_by = 'a0d17000-0000-4000-8000-0000000000a4'$$]),
  '0', 'Affichage : created_by forgé à l''insertion est réécrit (auteur = appelant)');
select is(pg_temp.essai('ecriture', array[
  $$with i as (insert into public.caisse_sheets (report_date, shift, status, validated_by, countersigned_by)
      values (current_date, 'nuit', 'validated', 'a0d17000-0000-4000-8000-0000000000a4', 'a0d17000-0000-4000-8000-0000000000a4')
      returning validated_by, countersigned_by)
    select count(*) from i where validated_by = 'a0d17000-0000-4000-8000-0000000000a4'
                              or countersigned_by = 'a0d17000-0000-4000-8000-0000000000a4'$$]),
  '0', 'Caisse : validated_by / countersigned_by forgés à l''insertion sont réécrits');
select is(pg_temp.essai('ecriture', array[
  $$insert into public.baby_cot_assignments (cot_id, start_date, end_date)
      values ('a0d17000-0000-4000-8000-000000000012', current_date - 30, current_date)$$]),
  'err=42501', 'Lits bébé : création d''un prêt commencé à J-30 refusée au rang écriture');

-- ------------------------------------------- findings (comportement attendu) ---
-- F1 : manual_kind passé à non-NULL fait entrer la ligne importée dans le
-- USING de « pdj delete (page:pdj) ».
select is(pg_temp.essai('ecriture', array[
  $$update public.pdj_breakfasts set manual_kind = 'extra' where id = 'a0d17000-0000-4000-8000-000000000010'$$,
  $$delete from public.pdj_breakfasts where id = 'a0d17000-0000-4000-8000-000000000010'$$]),
  'err=42501', 'F1 PDJ : une ligne importée ne devient pas « manuelle » pour être supprimée');
select isnt(pg_temp.essai('ecriture', array[
  $$update public.pdj_breakfasts set manual_kind = 'extra' where id = 'a0d17000-0000-4000-8000-000000000010'$$]),
  '1', 'F1 PDJ : manual_kind d''une ligne importée est figé hors gestion');
-- F2 : taken_date ramenée au jour même fait entrer la caution dans le USING
-- de « caisse cautions delete (page:caisse) ».
select is(pg_temp.essai('ecriture', array[
  $$update public.caisse_cautions set taken_date = current_date where id = 'a0d17000-0000-4000-8000-000000000011'$$,
  $$delete from public.caisse_cautions where id = 'a0d17000-0000-4000-8000-000000000011'$$]),
  'err=42501', 'F2 Caution : une caution de J-20 ne se supprime pas en changeant sa date');
select isnt(pg_temp.essai('ecriture', array[
  $$update public.caisse_cautions set taken_date = current_date where id = 'a0d17000-0000-4000-8000-000000000011'$$]),
  '1', 'F2 Caution : taken_date est figée hors gestion');
-- F3 : l'UPDATE ne borne que end_date ; le début recule sans limite.
select isnt(pg_temp.essai('ecriture', array[
  $$update public.baby_cot_assignments set start_date = current_date - 30 where id = 'a0d17000-0000-4000-8000-000000000013'$$]),
  '1', 'F3 Lits bébé : le début d''un prêt ne recule pas hors fenêtre (comme parking_no_past_rewrite)');

select * from finish();
rollback;
