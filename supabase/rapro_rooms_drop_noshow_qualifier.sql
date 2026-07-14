-- =============================================================================
-- RAPRO — RETRAIT du statut 'noshow' ET de la colonne `qualifier` (sur-statuts).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. SÛR EN PRODUCTION.
--
-- Décision : le seul livrable qui compte est la LISTE DES CHAMBRES NETTOYÉES
-- (facturation ELIOR). Le no-show et le faux no-show (sur-statut) n'y ajoutent
-- rien → on les retire. Les statuts se réduisent à trois :
--   nettoyee | non_nettoyee (« Bloquée ») | refus (hors charge, non facturé).
--
-- Ce script (a) reclasse les anciennes lignes 'noshow', (b) supprime la colonne
-- `qualifier` (et sa contrainte), (c) resserre le CHECK de `status`. L'ordre
-- importe : (a) AVANT (c), sinon l'ajout de contrainte échouerait sur les lignes
-- 'noshow' existantes. Idempotent (ré-exécutable), ne touche ni la clé unique
-- ni le trigger `rapro_rooms_stamp`.
--
-- Après ce script, ne PLUS jouer `rapro_rooms_qualifier.sql` ni
-- `rapro_rooms_qualifier_trim.sql` (obsolètes : la colonne n'existe plus).
-- =============================================================================

-- (a) Reclasse les anciennes lignes 'noshow' en 'refus' — même sens comptable
--     (HORS CHARGE, non facturé), pour ne pas les faire basculer en « nettoyée »
--     (facturable) par le défaut. Pour au contraire les compter comme nettoyées,
--     remplacer 'refus' par 'nettoyee' ci-dessous.
update public.rapro_rooms
  set status = 'refus'
  where status = 'noshow';

-- (b) Supprime la 2e dimension (sur-statut) : la colonne et sa contrainte.
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_qualifier_check;
alter table public.rapro_rooms
  drop column if exists qualifier;

-- (c) Resserre le CHECK de `status` aux trois valeurs restantes.
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_status_check;
alter table public.rapro_rooms
  add constraint rapro_rooms_status_check
  check (status in ('nettoyee', 'non_nettoyee', 'refus'));
