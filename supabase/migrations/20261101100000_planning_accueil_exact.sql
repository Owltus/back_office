-- Tableau de l'accueil : un chiffre EXACT par moment (2026-11-01).
--
-- Symptôme : pour la Réception et le Club, deux réglages se contredisaient
-- (les besoins par poste et la présence minimum) ; 8 points « les besoins
-- demandent 2, la consigne en veut 3 » en production.
-- Décision utilisateur (plan `plan/planning-accueil-2026-11-01/`, D1, D3, D9,
-- D14) : un seul tableau matin / soir / nuit × jour, un chiffre exact par
-- case (« mardi matin : 3 », ni moins ni plus). Il est rangé dans
-- `planning_consignes` avec minimum = maximum ; aucune colonne retirée.
--
-- 1. Données : une case à deux chiffres garde le PLUS PETIT (D9 : samedi
--    matin 3 à 5 → 3, dimanche matin 3 à 4 → 3) ; une case sans plafond
--    garde son minimum.
-- 2. Contrainte : maximum renseigné ET égal au minimum.
--
-- Innocuité : aucune autre table touchée ; RLS, grants et l'unicité
-- (jour, periode) inchangés. Vérification : `supabase/tests/05_planning`.

update public.planning_consignes
   set maximum = minimum
 where maximum is distinct from minimum;

alter table public.planning_consignes
  add constraint planning_consignes_exact
  check (maximum is not null and maximum = minimum);

comment on table public.planning_consignes is
  'Tableau de l''accueil : nombre EXACT de personnes par jour et par moment (matin, soir, nuit), Réception et Club ensemble le matin et le soir, veilleurs la nuit. minimum = maximum (2026-11-01).';
