-- =============================================================================
-- RAPRO — AJOUT du sur-statut « bloquée la veille » POSÉ À LA MAIN.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- SÛR EN PRODUCTION, NON DESTRUCTIF : ne supprime ni ne réécrit aucune donnée
-- (juste un ADD COLUMN avec défaut). Idempotent (ré-exécutable).
--
-- Contexte : le liseré « bloquée la veille » est normalement DÉRIVÉ (roulement
-- calculé depuis les jours passés). Cette colonne permet de le POSER directement
-- sur le jour courant (double-clic) — cas d'un report tardif après clôture, sans
-- avoir à rouvrir le jour d'avant. Orthogonal au `status` (couleur) : une chambre
-- peut être `nettoyee` ET porter ce flag. Traité par le roulement comme une
-- origine (cf. lib/rapro/carryover.ts).
--
-- ⚠ NE PAS jouer `rapro_rooms.sql` : il commence par `drop table … cascade`
--   (script de PREMIER déploiement) et EFFACERAIT toutes les lignes existantes.
-- =============================================================================

alter table public.rapro_rooms
  add column if not exists carried_manual boolean not null default false;
