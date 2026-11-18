-- =====================================================================
-- Journal des suppressions de `pms_daily_metrics` et destinataires du
-- rapport réservés à la gestion (audit de sécurité run-2 du 2026-11-18,
-- étape 1 du plan `plan/securite-audit-run2-2026-11-18/`)
-- =====================================================================
-- 1. pms_daily_metrics
--    Symptôme : une ligne de détail du rapport PMS supprimée ne laisse
--    aucune trace, alors que celles de `daily_reports` sont journalisées.
--    Cause : pas de trigger `log_delete` sur cette table.
--    Correctif : `audit_pms_daily_metrics_delete`, même modèle que
--    `audit_daily_reports_delete` (`private.log_delete`, BEFORE DELETE).
--    Innocuité : la seule suppression courante est la purge des lignes en
--    trop d'un réimport plus court (rare, quelques lignes). La table a bien
--    une colonne `id` (lue par `log_delete`).
--
-- 2. server_report_recipients
--    Symptôme : tout compte qui lit RepJour lit aussi les adresses e-mail
--    des destinataires du rapport.
--    Cause : la policy « srr read (page:repjour) » demande le rang 1.
--    Correctif : la même policy, recréée sous le même nom, demande la
--    gestion de RepJour (l'admin y a toujours la gestion).
--    Innocuité : l'Edge `send-report` et l'envoi automatique lisent la liste
--    avec la clé secrète (RLS contournée). À l'écran, la liste n'est lue que
--    par la fenêtre d'envoi et les réglages des destinataires, montrés aux
--    seuls admins (`DashboardBoard`, `isGradeAdmin`), qui ont la gestion de
--    toute page ; l'envoi manuel est déjà réservé aux admins par
--    `send-report`.
-- =====================================================================

-- 1. Journal des suppressions ----------------------------------------------
create trigger audit_pms_daily_metrics_delete
  before delete on public.pms_daily_metrics
  for each row execute function private.log_delete();

-- 2. Destinataires : lecture réservée à la gestion -------------------------
drop policy "srr read (page:repjour)" on public.server_report_recipients;
create policy "srr read (page:repjour)" on public.server_report_recipients
  for select to authenticated
  using ((select private.get_page_level('repjour')) = 'gestion');
