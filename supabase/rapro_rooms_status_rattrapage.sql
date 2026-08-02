-- =============================================================================
-- RAPRO — élargit `status` au statut « rattrapage ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- SÛR EN PRODUCTION, NON DESTRUCTIF : ne supprime ni ne réécrit AUCUNE donnée —
-- élargit seulement la contrainte CHECK de la colonne `status`. Idempotent.
--
-- POURQUOI
--   « rattrapage » = ménage FAIT aujourd'hui sur une chambre REPORTÉE non vendue
--   (bloquée la veille, vidée depuis). Il est facturable à ELIOR comme une
--   nettoyée, mais la chambre n'a PAS été vendue aujourd'hui (elle l'a été la
--   veille) : il ne doit donc jamais compter dans les « chambres vendues ». Ce
--   4e statut permet à l'analytique mensuelle de le distinguer d'une vraie
--   nettoyée sans relire l'occupation jour par jour.
--
--   Sur la grille il s'affiche VERT (comme une nettoyée) ; c'est le liseré
--   « bloquée la veille » qui le distingue à l'œil. Le clic gauche le pose
--   automatiquement sur une reportée non vendue (cf. lib/rapro/constants.ts).
--
-- ⚠ NE PAS jouer `rapro_rooms.sql` : il commence par `drop table … cascade`
--   (script de PREMIER déploiement) et EFFACERAIT toutes les lignes existantes.
-- =============================================================================

-- La contrainte CHECK inline d'une colonne est nommée `<table>_<column>_check`
-- par PostgreSQL. On la remplace par une version qui accepte « rattrapage ».
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_status_check;

alter table public.rapro_rooms
  add constraint rapro_rooms_status_check
  check (
    status is null
    or status in ('nettoyee', 'non_nettoyee', 'refus', 'rattrapage')
  );
