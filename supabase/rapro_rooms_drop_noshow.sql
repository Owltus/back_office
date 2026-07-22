-- =============================================================================
-- RAPRO — RETRAIT du statut `noshow` (« No-show »).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Idempotent.
-- Une seule écriture de données : un UPDATE CIBLÉ (WHERE status = 'noshow') qui
-- convertit les éventuelles lignes `noshow` en `refus`. Les deux statuts étaient
-- « hors charge / NON facturé » : la conversion préserve la comptabilité ELIOR.
-- On ne SUPPRIME pas ces lignes — sans ligne, la chambre repasserait « nettoyée »
-- (défaut), donc facturée à tort.
--
-- ⚠ NE PAS jouer `rapro_rooms.sql` : il commence par `drop table … cascade`
--   (script de PREMIER déploiement) et EFFACERAIT toutes les lignes existantes.
-- =============================================================================

-- (1) Convertit les no-show existants en refus (hors charge → hors charge).
--     WHERE ciblé : ne touche AUCUNE autre ligne. Si aucun no-show : no-op.
update public.rapro_rooms set status = 'refus' where status = 'noshow';

-- (2) Resserre le CHECK de `status` aux 3 valeurs restantes.
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_status_check;
alter table public.rapro_rooms
  add constraint rapro_rooms_status_check
  check (status in ('nettoyee', 'non_nettoyee', 'refus'));
