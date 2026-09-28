-- =============================================================================
-- REMPLACÉ — NE PLUS REJOUER (bannière posée le 2026-09-28, revue des rejeux).
-- Pourquoi : il repose un CHECK de `status` à 4 valeurs, dont 'noshow' (retiré
-- depuis) et sans 'rattrapage' ni 'non_vendue'. Rejoué, il échouerait s'il
-- existe une ligne rattrapage/non_vendue, et sinon remettrait un statut mort
-- et interdirait deux statuts vivants. La colonne `qualifier` est déjà
-- supprimée. Fait autorité : remediation_securite_2026-08-05.sql, bloc B7.
-- « SÛR EN PRODUCTION … Idempotent » plus bas n'est plus vrai.
-- Conservé pour l'historique.
-- =============================================================================

-- =============================================================================
-- RAPRO — RETRAIT du SUR-STATUT (colonne `qualifier`) UNIQUEMENT.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- SÛR EN PRODUCTION, NON DESTRUCTIF : ne supprime AUCUNE ligne (ni `drop table`,
-- ni `delete`, ni `update`). Idempotent (ré-exécutable).
--
-- Seul le « faux no-show » (sur-statut) est abandonné → on retire la 2e dimension
-- `qualifier`. Les statuts de chambre restent QUATRE, INCHANGÉS :
--   nettoyee | non_nettoyee (« Bloquée ») | refus | noshow.
--
-- ⚠ NE PAS jouer `rapro_rooms.sql` : il commence par `drop table … cascade`
--   (script de PREMIER déploiement) et EFFACERAIT toutes les lignes existantes.
-- =============================================================================

-- (1) Retire la 2e dimension (sur-statut) : sa contrainte puis la colonne.
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_qualifier_check;
alter table public.rapro_rooms
  drop column if exists qualifier;

-- (2) Garantit le CHECK de `status` sur les 4 valeurs (dont noshow). Idempotent :
--     rétablit `noshow` au cas où un script antérieur l'aurait retiré du CHECK.
alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_status_check;
alter table public.rapro_rooms
  add constraint rapro_rooms_status_check
  check (status in ('nettoyee', 'non_nettoyee', 'refus', 'noshow'));
