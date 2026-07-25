-- ============================================================================
-- rapro_sheets : ajout de la colonne operator_name — nom de l'hôtelier saisi au
-- modal de clôture (équivalent de caisse_sheets.operator_initials). C'est une
-- donnée SAISIE par le client via l'upsert de validateSheet (comme `comment`),
-- distincte de `validated_by` (uid posé côté serveur par le trigger).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Non destructif et
-- ré-exécutable (add column if not exists).
-- ============================================================================

alter table public.rapro_sheets
  add column if not exists operator_name text not null default '';
