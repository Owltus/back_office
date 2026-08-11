-- =============================================================================
-- pdj_breakfasts — colonne `manual_kind` (saisie manuelle d'un PDJ)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Non destructif.
--
-- Permet de saisir à la main un petit-déjeuner dans une chambre NON check-in
-- (day-use, no-show revenu « Reinstate »…), invisible des imports In-House.
--   manual_kind = 'inclus' → PDJ inclus (compte dans breakfasts_included) ;
--   manual_kind = 'extra'  → PDJ à la carte (compte dans les extras) ;
--   manual_kind = null      → ligne normale (issue d'un import).
-- =============================================================================

alter table public.pdj_breakfasts
  add column if not exists manual_kind text
    check (manual_kind is null or manual_kind in ('inclus', 'extra'));
