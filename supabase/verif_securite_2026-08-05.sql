-- =============================================================================
-- VÉRIFICATION SÉCURITÉ — pentest #2 du 2026-08-05
-- À EXÉCUTER APRÈS `remediation_securite_2026-08-05.sql`. LECTURE SEULE.
-- Toutes les lignes doivent afficher ok = true.
-- =============================================================================

-- A3 — caisse_stamp fige countersigned_by
-- 2026-09-28 : mis à jour. Depuis fk_auteur_triggers_2026-09-06.sql, l'auteur
-- est figé par `private.keep_author(new.countersigned_by, old.countersigned_by)`
-- et non plus par `new.countersigned_by := old.countersigned_by` : l'ancien
-- motif ne pouvait plus être trouvé. Les deux formes sont acceptées.
select 'A3 — caisse_stamp fige countersigned_by' as controle,
  coalesce((select pg_get_functiondef(p.oid) like '%countersigned_by := old.countersigned_by%'
             or pg_get_functiondef(p.oid) like '%countersigned_by := private.keep_author(new.countersigned_by, old.countersigned_by)%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'caisse_stamp'), false) as ok;

-- A2 — admin_update_password refuse une cible admin
-- 2026-09-28 : mis à jour. La fonction privilégiée vit dans private depuis
-- le 2026-09-05 (private_rpc_relais.sql) ; public n'a qu'un relais invoker.
select 'A2 — admin_update_password garde inter-admin (private)' as controle,
  coalesce((select pg_get_functiondef(p.oid) like '%Cible administrateur%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'admin_update_password'), false) as ok;

-- A4 — set_user_grade garde dernier admin
-- 2026-09-28 : mis à jour (même raison que A2 : corps dans private).
select 'A4 — set_user_grade garde dernier admin (private)' as controle,
  coalesce((select pg_get_functiondef(p.oid) like '%dernier admin%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'set_user_grade'), false) as ok;

-- B7 — CHECK status à 5 valeurs (dont non_vendue)
select 'B7 — rapro_rooms CHECK 5 valeurs' as controle,
  (select pg_get_constraintdef(oid) like '%non_vendue%'
   from pg_constraint
   where conname = 'rapro_rooms_status_check'
     and conrelid = 'public.rapro_rooms'::regclass) as ok;
