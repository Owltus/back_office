-- =============================================================================
-- Parking — contrainte anti-chevauchement au niveau BASE (garde-fou structurel).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- Contexte : le contrôle anti-chevauchement (`hasOverlap`, lib/parking/model.ts)
-- n'est vérifié QUE côté client, sur l'état local du navigateur. Si deux postes
-- créent/déplacent une réservation sur la même place à quelques secondes
-- d'écart, avant que le temps réel n'ait propagé l'un des deux, rien ne bloque
-- le second en base : un doublon peut s'écrire (constaté le 2026-08-17, place 3,
-- réservation "DHEILLY", corrigé manuellement avant cette migration).
--
-- Cette contrainte EXCLUDE rend un chevauchement structurellement impossible,
-- quoi qu'il arrive côté client : Postgres refuse toute ligne dont la période
-- occupée (arrivée incluse, départ exclu — même sémantique que hasOverlap : le
-- jour de départ, start_date + nights, est déjà libre) chevauche une autre
-- réservation déjà posée sur la même place.
--
-- Nécessite l'extension btree_gist (permet l'égalité `=` dans un index GiST,
-- utilisé ici pour comparer `spot` en plus du recouvrement `&&` des dates).
--
-- Prérequis : aucune ligne en conflit en base (vérifié via
-- parking_check_overlaps.sql — 0 ligne). Si des conflits subsistent, cette
-- migration échoue avec une erreur Postgres nommant les lignes en cause : les
-- résoudre manuellement puis rejouer.
-- =============================================================================

create extension if not exists btree_gist;

alter table public.parking_reservations
  drop constraint if exists parking_reservations_no_overlap;

alter table public.parking_reservations
  add constraint parking_reservations_no_overlap
  exclude using gist (
    spot with =,
    daterange(start_date, start_date + nights, '[)') with &&
  );
