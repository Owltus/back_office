-- =============================================================================
-- RETRAIT de l'envoi e-mail du PDJ — suppression des 2 tables devenues MORTES.
--
-- CONTEXTE : la fonctionnalité « envoi du PDJ par e-mail » (auto + manuel) a été
-- ENTIÈREMENT retirée du code (plan/retrait-envoi-pdj/). Plus aucune ligne de code
-- (Edge Function ou client) ne lit ni n'écrit ces deux tables :
--   - public.pdj_report_recipients  (destinataires de l'e-mail PDJ)
--   - public.pdj_auto_send_log       (garde d'idempotence de l'envoi auto PDJ)
-- Elles sont donc dormantes. Ce script les SUPPRIME définitivement.
--
-- ⚠ DESTRUCTIF — À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, en
-- connaissance de cause. Supprime les tables ET leurs données (adresses de
-- diffusion PDJ + journal d'envoi). IRRÉVERSIBLE (pas de rollback après commit).
-- Ne PAS lancer si tu veux garder l'historique des envois PDJ.
--
-- PORTÉE : ne touche QUE ces 2 tables. Aucune incidence sur le Rep Jour
-- (server_report_recipients, daily_reports.auto_sent_at, report_send_throttle
-- restent intacts) ni sur la RÉCEPTION des données PDJ (pdj_breakfasts est une
-- AUTRE table, conservée : l'import In-House continue de l'alimenter).
--
-- Pas de `cascade` : ces tables n'ont aucun objet dépendant (aucune FK ne les
-- référence). `drop table` retire aussi automatiquement leurs policies RLS.
-- =============================================================================

drop table if exists public.pdj_report_recipients;
drop table if exists public.pdj_auto_send_log;

-- =============================================================================
-- Vérification (lecture seule) après exécution — les 2 requêtes doivent renvoyer 0 :
--   select count(*) from information_schema.tables
--   where table_schema = 'public'
--     and table_name in ('pdj_report_recipients', 'pdj_auto_send_log');   -- 0
--
--   select count(*) from pg_policies
--   where schemaname = 'public'
--     and tablename in ('pdj_report_recipients', 'pdj_auto_send_log');    -- 0
-- =============================================================================
