-- =============================================================================
-- report_send_throttle_progressive — passe l'anti-spam de l'envoi MANUEL d'un
-- blocage fixe (5 min) à une COURBE PROGRESSIVE.
--
-- Ajoute une colonne `recent_sends` (jsonb) qui mémorise les horodatages epoch
-- (ms) des envois récents d'un utilisateur (élagués à 1 h côté Edge Function
-- send-report). La logique :
--   - délai de base 10 s entre deux envois ;
--   - >= 5 envois en 1 min  → écart requis porté à 5 min ;
--   - >= 10 envois en 5 min → écart requis porté à 1 h.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : ajoute une colonne avec défaut '[]'. La colonne last_sent_at
-- existante est conservée (toujours mise à jour). Aucune donnée effacée.
-- =============================================================================

alter table public.report_send_throttle
  add column if not exists recent_sends jsonb not null default '[]'::jsonb;

comment on column public.report_send_throttle.recent_sends is
  'Horodatages epoch (ms) des envois manuels récents (max ~30, élagués à 1 h par '
  'l''Edge Function send-report) — alimente l''anti-spam progressif.';

-- =============================================================================
-- Vérification (lecture seule) :
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='report_send_throttle'
--     and column_name='recent_sends';   -- attendu : recent_sends | jsonb
-- =============================================================================
