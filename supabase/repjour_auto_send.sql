-- =============================================================================
-- repjour_auto_send — garde d'idempotence de l'ENVOI AUTOMATIQUE du RepJour.
--
-- CONTEXTE : dès que le Comparison ET le Forecast du jour sont en base, l'Edge
-- Function import-report envoie automatiquement le rapport par e-mail (Resend).
-- Il faut garantir UN SEUL envoi par date de rapport, même si deux imports
-- arrivent quasi simultanément (Comparison et Forecast dans deux e-mails).
--
-- MÉCANISME : une colonne `auto_sent_at` (nullable) sur daily_reports. La
-- réservation est ATOMIQUE côté fonction :
--     update daily_reports set auto_sent_at = now()
--     where date = :d and auto_sent_at is null returning date;
-- Postgres sérialise les UPDATE concurrents sur la même ligne : une seule
-- invocation obtient une ligne en retour (elle envoie), l'autre en obtient zéro
-- (elle s'abstient). Pas de table séparée, pas de course.
--
-- L'envoi MANUEL (bouton admin de la barre du haut) N'utilise PAS cette garde :
-- un renvoi explicite reste possible même si auto_sent_at est déjà posé.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : ajoute une colonne nullable. Aucune donnée existante n'est
-- modifiée (les rapports déjà en base auront auto_sent_at = NULL, donc éligibles
-- à un envoi auto si un import les recomplète — comportement voulu).
-- =============================================================================

alter table public.daily_reports
  add column if not exists auto_sent_at timestamptz;

comment on column public.daily_reports.auto_sent_at is
  'Horodatage de l''envoi AUTOMATIQUE du rapport par e-mail (Resend). NULL = pas '
  'encore envoyé automatiquement. Posé atomiquement par l''Edge Function '
  'import-report pour garantir un envoi auto unique par date. L''envoi manuel '
  '(admin) ne le consulte pas.';

-- =============================================================================
-- Vérification (lecture seule) après exécution :
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='daily_reports'
--     and column_name='auto_sent_at';
--   -- attendu : auto_sent_at | timestamp with time zone | YES
-- =============================================================================
