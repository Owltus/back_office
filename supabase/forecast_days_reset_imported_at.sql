-- =============================================================================
-- ONE-SHOT DÉJÀ APPLIQUÉ — NE PLUS REJOUER (bannière posée le 2026-09-28).
-- Pourquoi : c'est un UPDATE DE MASSE sans WHERE qui remet imported_at de
-- TOUTES les lignes de forecast_days à l'an 2000. Il fermait la fenêtre
-- transitoire du backfill du 2026-08-08 ; rejoué aujourd'hui, il rendrait
-- « périmé » le Forecast réellement importé du mois, et le garde-fou
-- d'envoi automatique du RepJour (Forecast FRAIS exigé) bloquerait l'envoi de
-- la nuit jusqu'au prochain import. La mention « Réexécutable sans dommage »
-- ci-dessous est FAUSSE depuis la mise en service de l'envoi automatique.
-- =============================================================================

-- =============================================================================
-- forecast_days_reset_imported_at — ferme la fenêtre transitoire du backfill.
--
-- PROBLÈME : forecast_days_imported_at.sql a ajouté imported_at avec DEFAULT now(),
-- donc TOUTES les lignes existantes ont pris l'instant de la migration. Pendant
-- ~12 h elles paraissent « importées ce cycle » → le garde-fou d'envoi auto
-- (autoSend.ts, fenêtre 12 h) pourrait envoyer le RepJour avec un projeté PÉRIMÉ.
--
-- CORRECTIF : remettre les lignes existantes à un horodatage ANCIEN. Elles ne
-- seront plus jamais « fraîches » tant qu'un import Forecast RÉEL ne les a pas
-- ré-estampillées (import-report/repjour.ts pose imported_at = now() à chaque
-- upsert). Choix conservateur : on ne peut pas distinguer une ligne backfillée
-- d'un vrai import récent, donc on remet TOUT à l'ancien — un import à venir
-- corrige. Conséquence acceptée : si un Forecast a été réellement importé
-- aujourd'hui sans ré-import ce soir, son mois sera « pas frais » jusqu'au prochain
-- import (donc pas d'auto-send sur ce mois d'ici là — prudent, jamais de fausse
-- donnée).
--
-- ⚠ MASS UPDATE (sans WHERE) — CONFIRMATION EXPLICITE REQUISE avant exécution.
-- Ne touche QUE imported_at : aucune donnée métier (occ, rev_ht, rev_ttc, adr…)
-- n'est modifiée. À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Réexécutable sans dommage.
-- =============================================================================

update public.forecast_days
  set imported_at = timestamptz '2000-01-01 00:00:00+00';

-- =============================================================================
-- Vérification (lecture seule) — attendu : frais = 0
--   select count(*) as total,
--          count(*) filter (where imported_at > now() - interval '12 hours') as frais
--   from public.forecast_days;
-- =============================================================================
