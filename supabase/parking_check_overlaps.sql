-- =============================================================================
-- Parking — script de VÉRIFICATION (lecture seule, aucune écriture).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- Objectif : confirmer ou infirmer un chevauchement réel en base, suite à un
-- signalement visuel sur la réservation "DHEILLY" (place 3, nuit du vendredi
-- 31 juillet au samedi 1er août 2026). Deux requêtes :
--   1. Toutes les lignes DHEILLY telles qu'elles existent réellement en base.
--   2. Un détecteur général de chevauchement, sur TOUTE la table (même place,
--      dates qui se recouvrent), pour vérifier qu'aucune autre place n'a le
--      même souci ailleurs.
--
-- Rappel du modèle (lib/parking/model.ts) : une réservation occupe sa place du
-- jour d'arrivée (start_date) jusqu'à la VEILLE du départ (start_date + nights
-- - 1 inclus) — start_date + nights est le jour de DÉPART, déjà libre. Deux
-- réservations sur la même place se chevauchent seulement si
-- a.start_date < b.start_date + b.nights ET b.start_date < a.start_date + a.nights.
-- =============================================================================

-- --- 1. Toutes les réservations "Dheilly" (recherche large, insensible à la casse) --
select
  id,
  spot,
  client,
  start_date,
  nights,
  (start_date + nights)::date as depart_le,
  status,
  comment,
  created_at,
  updated_at
from public.parking_reservations
where client ilike '%dheilly%'
order by start_date;

-- --- 2. Détecteur général de chevauchement (toute la table, toutes places) ---
-- Une ligne en résultat = un VRAI conflit (deux résas incompatibles sur la
-- même place). Aucune ligne = aucun chevauchement en base, le souci constaté
-- à l'écran est purement visuel.
select
  a.id          as id_a,
  a.client      as client_a,
  a.spot,
  a.start_date  as arrivee_a,
  (a.start_date + a.nights)::date as depart_a,
  a.status      as statut_a,
  b.id          as id_b,
  b.client      as client_b,
  b.start_date  as arrivee_b,
  (b.start_date + b.nights)::date as depart_b,
  b.status      as statut_b
from public.parking_reservations a
join public.parking_reservations b
  on a.spot = b.spot
  and a.id < b.id
  and a.start_date < (b.start_date + b.nights)
  and b.start_date < (a.start_date + a.nights)
order by a.spot, a.start_date;
