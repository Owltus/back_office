-- =============================================================================
-- RAPRO — RETRAIT des sur-statuts 'depart_anticipe' et 'delogement' (abandonnés).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. SÛR EN PRODUCTION.
--
-- Contexte : la 1re version de `rapro_rooms_qualifier.sql` autorisait trois
-- sur-statuts. On n'en garde qu'un : 'faux_noshow'. Ce script (a) efface les
-- lignes portant l'un des deux qualificatifs retirés, PUIS (b) resserre le CHECK
-- au seul 'faux_noshow'. L'étape (a) est indispensable AVANT (b), sinon l'ajout
-- de contrainte échouerait sur les lignes existantes.
--
-- Idempotent (ré-exécutable), ne touche ni la clé unique ni le trigger.
-- =============================================================================

-- (a) Retire le sur-statut des chambres qui portaient une valeur abandonnée
--     (le statut de BASE de la chambre est conservé, seule la ligne `qualifier`
--     repasse à NULL).
update public.rapro_rooms
  set qualifier = null
  where qualifier in ('depart_anticipe', 'delogement');

-- (b) Resserre la contrainte au seul sur-statut restant.
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_qualifier_check;
alter table public.rapro_rooms
  add constraint rapro_rooms_qualifier_check
  check (qualifier is null or qualifier in ('faux_noshow'));
