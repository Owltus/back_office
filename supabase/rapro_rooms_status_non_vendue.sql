-- =============================================================================
-- RAPRO — élargit `status` au statut « non_vendue ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- SÛR EN PRODUCTION, NON DESTRUCTIF : ne supprime ni ne réécrit AUCUNE donnée —
-- élargit seulement la contrainte CHECK de la colonne `status`. Idempotent.
--
-- POURQUOI
--   « non_vendue » = correction d'occupation INVERSE. Le rooming In-House (PMS)
--   marque parfois une chambre occupée alors qu'elle n'a PAS été vendue (erreur
--   d'export, annulation tardive). Jusqu'ici on pouvait corriger dans un seul
--   sens (marquer vendue une chambre non vendue) ; ce statut ajoute le sens
--   symétrique : sortir une chambre des vendues.
--
--   La chambre passe alors GRISE, quitte les « vendues » et le dû (aucun ménage
--   à faire), n'est pas facturable et ne roule pas. Le clic gauche la pose dans
--   le cycle des chambres vendues : vert → refus → bloquée → non vendue → vert
--   (cf. lib/rapro/constants.ts, fonction nextFill).
--
-- ⚠ NE PAS jouer `rapro_rooms.sql` : il commence par `drop table … cascade`
--   (script de PREMIER déploiement) et EFFACERAIT toutes les lignes existantes.
-- =============================================================================

-- La contrainte CHECK inline d'une colonne est nommée `<table>_<column>_check`
-- par PostgreSQL. On la remplace par une version qui accepte « non_vendue ».
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_status_check;

alter table public.rapro_rooms
  add constraint rapro_rooms_status_check
  check (
    status is null
    or status in ('nettoyee', 'non_nettoyee', 'refus', 'rattrapage', 'non_vendue')
  );
