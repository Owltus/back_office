-- =============================================================================
-- Parking — TEST de la contrainte anti-chevauchement (sans danger).
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- Tout se passe dans une transaction terminée par ROLLBACK : que le test
-- réussisse ou échoue, RIEN n'est jamais écrit en base — aucune ligne
-- résiduelle à nettoyer ensuite.
--
-- Résultat attendu : la 1ʳᵉ insertion réussit, la 2ᵉ échoue avec une erreur
-- Postgres du type « conflicting key value violates exclusion constraint
-- "parking_reservations_no_overlap" » — la preuve que la contrainte bloque
-- bien un chevauchement, comme le faisait auparavant seulement l'écran.
-- =============================================================================

begin;

insert into public.parking_reservations (spot, client, start_date, nights, status)
values (5, 'TEST_CONTRAINTE_A', '2026-09-01', 1, 'reserve');

-- Même place, mêmes dates → DOIT échouer ici.
insert into public.parking_reservations (spot, client, start_date, nights, status)
values (5, 'TEST_CONTRAINTE_B', '2026-09-01', 1, 'paye');

rollback;
