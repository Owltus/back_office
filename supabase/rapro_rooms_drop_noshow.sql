-- =============================================================================
-- REMPLACÉ — NE PLUS REJOUER (bannière posée le 2026-09-28, revue des rejeux).
-- Pourquoi : il repose un CHECK de `status` à 3 valeurs. La prod en a 5 (+
-- 'rattrapage', 'non_vendue', et NULL = aucune couleur) : rejoué, il
-- échouerait s'il existe une ligne rattrapage/non_vendue, et sinon
-- RÉTRÉCIRAIT le CHECK en silence (ces statuts deviendraient impossibles à
-- enregistrer). Fait autorité : remediation_securite_2026-08-05.sql, bloc B7
-- (contrainte finale unique). « Idempotent » plus bas n'est plus vrai.
-- Conservé pour l'historique.
-- =============================================================================

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
