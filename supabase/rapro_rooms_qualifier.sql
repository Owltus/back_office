-- =============================================================================
-- RAPRO — sur-statuts : colonne `qualifier` (dimension ORTHOGONALE au `status`)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. SÛR EN PRODUCTION.
--
-- Le statut de chambre a désormais DEUX dimensions :
--   - `status`    : statut de BASE, terminal (nettoyee / non_nettoyee / refus /
--                   noshow) — le « circuit classique ». Inchangé.
--   - `qualifier` : SUR-STATUT optionnel (cas particulier), au plus un par chambre.
--                   'faux_noshow' : PMS a déclaré le client absent, il est présent.
--
-- Ce script est ADDITIF, IDEMPOTENT, et NE MODIFIE AUCUNE LIGNE (qualifier NULL
-- par défaut → satisfait le CHECK, aucune migration). La clé unique
-- (report_date, room) et le trigger `rapro_rooms_stamp` sont INCHANGÉS.
--
-- Remplace `rapro_rooms_add_statuses.sql` (supprimé) : `faux_noshow` n'est plus
-- une valeur de `status` mais un `qualifier`. Ne jamais jouer les deux.
-- =============================================================================

alter table public.rapro_rooms
  add column if not exists qualifier text;   -- NULL = aucun sur-statut

alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_qualifier_check;
alter table public.rapro_rooms
  add constraint rapro_rooms_qualifier_check
  check (qualifier is null or qualifier in ('faux_noshow'));
