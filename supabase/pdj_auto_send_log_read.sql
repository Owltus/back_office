-- =============================================================================
-- pdj_auto_send_log_read — ouvre la LECTURE de pdj_auto_send_log au client.
--
-- POURQUOI : le bandeau « pas encore envoyé » de la page PDJ a besoin de savoir si
-- la feuille du jour a déjà été envoyée = présence d'une ligne pour la service_date.
-- Or la table a la RLS activée SANS policy (écrite/lue jusqu'ici uniquement par le
-- service_role de l'Edge Function) → un select client renvoie 0 ligne en silence,
-- et le bandeau resterait affiché en permanence.
--
-- CE QU'ON EXPOSE : uniquement service_date + sent_at (AUCUNE PII : ni nom, ni
-- montant). Lecture gardée par la permission de PAGE `pdj` (rank >= 1), exactement
-- comme la lecture de pdj_report_recipients → cohérent avec « lectures par page ».
-- L'écriture reste réservée au service_role (aucune policy INSERT/UPDATE/DELETE).
--
-- À EXÉCUTER PAR L'UTILISATEUR (Supabase → SQL Editor). Ré-exécutable (idempotent).
-- Prérequis : page_permissions.sql joué (fonctions get_page_level / page_level_rank).
-- =============================================================================

alter table public.pdj_auto_send_log enable row level security;

drop policy if exists pdj_auto_send_log_select on public.pdj_auto_send_log;
create policy pdj_auto_send_log_select on public.pdj_auto_send_log
  for select to authenticated
  using (page_level_rank(get_page_level('pdj')) >= 1);

-- =============================================================================
-- Vérification (lecture seule) — attendu : 1 policy SELECT, to {authenticated} :
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname='public' and tablename='pdj_auto_send_log';
-- =============================================================================
