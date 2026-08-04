-- =============================================================================
-- VÉRIFICATION SÉCURITÉ — pentest du 2026-08-04
--
-- À EXÉCUTER APRÈS `remediation_securite_2026-08-04.sql`. LECTURE SEULE.
-- Chaque ligne renvoie un contrôle + OK/KO. Tout doit être OK (sauf F2 si des
-- adresses non conformes subsistent — voir le NOTICE du script de remédiation).
-- =============================================================================

-- E1a — Policy INSERT bornée présente sur profiles
select 'E1a — policy INSERT profiles' as controle,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd = 'INSERT'
  ) as ok;

-- E1b — Trigger anti-escalade couvre bien INSERT ET UPDATE
select 'E1b — trigger insert+update profiles' as controle,
  (
    select count(*) = 2 from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'profiles'
      and trigger_name = 'protect_role_escalation'
      and event_manipulation in ('INSERT', 'UPDATE')
  ) as ok;

-- M2a — Fonction d'occupation minimale présente
select 'M2a — fonction daily_reports_occ' as controle,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'daily_reports_occ'
  ) as ok;

-- M2b — daily_reports NE référence PLUS rapro dans sa policy SELECT
select 'M2b — daily_reports SELECT sans rapro' as controle,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_reports'
      and cmd = 'SELECT' and coalesce(qual, '') like '%rapro%'
  ) as ok;

-- M2c — anon/public ne peuvent PAS exécuter daily_reports_occ
select 'M2c — daily_reports_occ pas d''exec anon/public' as controle,
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
    lateral aclexplode(p.proacl) a
    where n.nspname = 'public' and p.proname = 'daily_reports_occ'
      and a.privilege_type = 'EXECUTE'
      and (a.grantee = 0 or a.grantee = 'anon'::regrole)
  ) as ok;

-- I6 — set_user_grade porte la garde « dernier admin »
select 'I6 — garde dernier admin' as controle,
  (
    select pg_get_functiondef(p.oid) like '%dernier admin%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_user_grade'
  ) as ok;

-- F4 — search_path figé sur les 7 fonctions d'estampillage présentes
select 'F4 — search_path triggers stamp' as controle,
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('caisse_stamp','rapro_sheets_stamp','rapro_rooms_stamp',
                        'pms_daily_metrics_stamp','parking_set_updated_at',
                        'pdj_set_updated_at','easter_eggs_set_updated_at')
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  ) as ok;

-- F2 — CHECK de format email posé
select 'F2 — CHECK format email' as controle,
  exists (
    select 1 from pg_constraint
    where conname = 'email_recipients_email_format'
      and conrelid = 'public.email_recipients'::regclass
  ) as ok;

-- Contrôle transverse — aucune table publique sans RLS
select 'RLS — aucune table sans RLS' as controle,
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ) as ok;
