-- =============================================================================
-- RAPRO — status NULLABLE : NULL = « aucune couleur ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- SÛR EN PRODUCTION, NON DESTRUCTIF : ne supprime ni ne réécrit aucune donnée
-- (juste DROP NOT NULL + DROP DEFAULT sur une colonne existante). Idempotent.
--
-- POURQUOI
--   Le statut (couleur) et le sur-statut « bloquée la veille » (carried_manual)
--   sont deux dimensions ORTHOGONALES. Il faut pouvoir poser le liseré sur une
--   chambre SANS lui donner de couleur (elle reste grise si non vendue). Cela
--   suppose une ligne (status NULL, carried_manual true) → d'où le status
--   nullable. NULL signifie « aucune couleur » :
--     - chambre VENDUE   sans couleur explicite → verte (nettoyée par défaut) ;
--     - chambre NON vendue sans couleur explicite → grise.
--   Une couleur EXPLICITE (nettoyee / refus / non_nettoyee) est stockée telle
--   quelle et s'affiche pour toutes les chambres, vendues ou non.
--
-- ⚠ NE PAS jouer `rapro_rooms.sql` : il commence par `drop table … cascade`
--   (script de PREMIER déploiement) et EFFACERAIT toutes les lignes existantes.
-- =============================================================================

alter table public.rapro_rooms alter column status drop not null;
alter table public.rapro_rooms alter column status drop default;

-- Le CHECK existant `status in (...)` laisse déjà passer NULL (un IN sur NULL vaut
-- UNKNOWN, qu'un CHECK considère satisfait). Rien à modifier côté contrainte.
