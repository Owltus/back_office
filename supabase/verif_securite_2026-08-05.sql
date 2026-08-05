-- =============================================================================
-- VÉRIFICATION SÉCURITÉ — pentest #2 du 2026-08-05
-- À EXÉCUTER APRÈS `remediation_securite_2026-08-05.sql`. LECTURE SEULE.
-- Toutes les lignes doivent afficher ok = true.
-- =============================================================================

-- A3 — caisse_stamp fige countersigned_by
select 'A3 — caisse_stamp fige countersigned_by' as controle,
  (select pg_get_functiondef(p.oid) like '%countersigned_by := old.countersigned_by%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'caisse_stamp') as ok;

-- A2 — admin_update_password refuse une cible admin
select 'A2 — admin_update_password garde inter-admin' as controle,
  (select pg_get_functiondef(p.oid) like '%Cible administrateur%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_update_password') as ok;

-- A4 — set_user_grade garde dernier admin
select 'A4 — set_user_grade garde dernier admin' as controle,
  (select pg_get_functiondef(p.oid) like '%dernier admin%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_user_grade') as ok;

-- B7 — CHECK status à 5 valeurs (dont non_vendue)
select 'B7 — rapro_rooms CHECK 5 valeurs' as controle,
  (select pg_get_constraintdef(oid) like '%non_vendue%'
   from pg_constraint
   where conname = 'rapro_rooms_status_check'
     and conrelid = 'public.rapro_rooms'::regclass) as ok;
