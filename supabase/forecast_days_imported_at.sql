-- =============================================================================
-- forecast_days_imported_at — fraîcheur du Forecast pour l'envoi auto RepJour.
--
-- Ajoute `imported_at` (horodatage du dernier import réussi d'une ligne de
-- prévision). L'Edge Function import-report l'estampille à chaque upsert ; le
-- déclencheur d'envoi auto s'en sert pour n'envoyer le RepJour QUE si le Forecast
-- du CYCLE HÔTELIER COURANT (bascule 02h00) a bien été importé — sinon il attend
-- (l'envoi manuel reste possible).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : ajoute une colonne avec défaut now() ; les lignes existantes
-- prennent l'instant de la migration (elles seront ré-estampillées au prochain
-- import réel). Aucune donnée effacée.
-- =============================================================================

alter table public.forecast_days
  add column if not exists imported_at timestamptz not null default now();

comment on column public.forecast_days.imported_at is
  'Horodatage du dernier import réussi de cette ligne (posé par import-report). '
  'Sert à juger la fraîcheur du Forecast pour l''envoi auto RepJour (cycle 02h).';

-- =============================================================================
-- Vérification (lecture seule) :
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='forecast_days'
--     and column_name='imported_at';   -- attendu : imported_at | timestamptz | NO
-- =============================================================================
