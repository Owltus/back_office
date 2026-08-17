-- =============================================================================
-- Parking — nouveau statut 'employe' (véhicule du personnel de l'hôtel).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- Reste un STATUT DE RÉSERVATION comme les autres (visible et cyclable dans
-- le planning /parking) mais est explicitement exclu des vues analytiques
-- (voir parking_analytics_agg.sql) : une voiture d'employé n'est pas une
-- occupation client et ne doit pas gonfler le TO / captage analytique.
--
-- À ne pas confondre avec FIRST_STAFF_SPOT (places 13 & 14, tampon
-- "personnel" au niveau de la PLACE physique, mécanisme différent et déjà
-- existant) : 'employe' est un statut de RÉSERVATION, posable sur n'importe
-- quelle place 1 à 14.
--
-- Idempotent : drop/add constraint rejouable sans dommage.
-- =============================================================================
alter table public.parking_reservations
  drop constraint if exists parking_reservations_status_check;

alter table public.parking_reservations
  add constraint parking_reservations_status_check
  check (status in ('reserve', 'paye', 'checkout', 'employe'));
