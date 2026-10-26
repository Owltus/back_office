-- Page `planning` (2026-10-27, demande utilisateur : « prépare les choses,
-- une page vide pour l'instant »). Même geste que la page `classeur` du
-- 2026-09-25 : la clé entre dans les deux contrôles de la base, sinon un
-- droit accordé sur la page serait refusé à l'écriture.
--   - user_page_permissions.page : liste des clés de `lib/permissions/pages.ts`
--   - profiles.page_order : mêmes clés, longueur bornée au nombre de pages (10)
-- Aucune table, aucune donnée : la page n'a pas encore de contenu.

alter table public.user_page_permissions
  drop constraint if exists user_page_permissions_page_check;
alter table public.user_page_permissions
  add constraint user_page_permissions_page_check
  check (page in ('repjour', 'pdj', 'parking', 'rapro', 'caisse', 'affichage',
                  'facturation', 'literie', 'classeur', 'planning'));

alter table public.profiles
  drop constraint if exists profiles_page_order_check;
alter table public.profiles
  add constraint profiles_page_order_check check (
    page_order is null
    or (
      page_order <@ array['repjour', 'pdj', 'parking', 'rapro', 'caisse',
                          'affichage', 'facturation', 'literie',
                          'classeur', 'planning']::text[]
      and coalesce(array_length(page_order, 1), 0) <= 10
    )
  );
