-- =============================================================================
-- email_recipients_drop_2026-09-06 — suppression de la table `email_recipients`
-- (plan/correctifs-audit-2026-09-06/4-nettoyage.md)
--
-- Application : `supabase db query --linked -f supabase/email_recipients_drop_2026-09-06.sql`
-- DESTRUCTIF (drop table) — décidé par l'utilisateur le 2026-09-06 après preuve
-- qu'aucun code atteignable ne la lit :
--   * l'envoi serveur (Edge `send-report`) lit `server_report_recipients`
--     exclusivement (index.ts:149) ;
--   * côté front, le seul lecteur était `src/lib/repjour/email.ts` (construction
--     d'un `mailto:`), module SANS importateur depuis le retrait du bouton
--     « Envoyer par email » de DashboardBoard ; `RecipientsModal` reçoit
--     explicitement `serverReportRecipients` ;
--   * 8 lignes (1 seule active, de type `cc`), sauvegardées hors dépôt (PII)
--     avant suppression.
-- La table venait de l'ex-app repjour co-hébergée (liste du mailto). Les
-- fichiers email_recipients_rls_hardening.sql et email_recipients_email_format.sql
-- portent « SUPPRIMÉ — NE PLUS REJOUER ».
-- =============================================================================

drop table if exists public.email_recipients;

-- VÉRIFICATION (lecture seule)
select 'email_recipients presente (attendu 0)' as controle,
       (to_regclass('public.email_recipients') is not null)::int::text as valeur
union all
select 'server_report_recipients presente (attendu 1)',
       (to_regclass('public.server_report_recipients') is not null)::int::text;
