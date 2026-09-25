-- =============================================================================
-- page_classeur_2026-09-25.sql — déclaration de la page « classeur »
--
-- Application : `supabase db query --linked -f supabase/page_classeur_2026-09-25.sql`
--
-- Symptôme : une nouvelle page de la navbar doit être déclarée à TROIS endroits
--   (CLAUDE.md, section Authentification) : le registre client `PAGES`
--   (src/lib/permissions/pages.ts), le CHECK de `user_page_permissions.page`
--   (securite_audit_2026-09-06.sql, bloc 7) et celui de `profiles.page_order`
--   (nav_page_order_2026-09-09.sql). Sans les deux déclarations en base, un
--   admin qui accorde le droit `classeur` depuis /comptes se voit refuser
--   l'INSERT (23514), et un compte qui place la page dans son ordre aussi.
--
-- Correctif : les deux CHECK sont recréés avec la 9e clé. Aucune table, aucune
--   policy, aucune fonction n'est touchée : la page n'a pas encore de données.
--   `private.get_page_level(text)` n'énumère pas les pages (elle lit la ligne
--   de droits du compte), donc rien à changer côté RLS pour l'instant. Quand
--   des tables arriveront, leurs policies suivront `page_permissions_rls*`
--   (lecture gatée par `private.get_page_level('classeur')`).
--
-- Innocuité : `drop constraint if exists` + `add constraint` dans UNE
--   transaction ; l'ensemble accepté est strictement ÉLARGI (les 8 anciennes
--   clés restent valides), donc aucune ligne existante ne peut violer le
--   nouveau CHECK. Aucune donnée réécrite. Idempotent.
--
-- Vérification : section finale (lecture seule). Attendu : les deux
--   définitions contiennent 'classeur', la borne de longueur vaut 9, et
--   aucune ligne de droits n'est hors des 9 clés.
-- =============================================================================

begin;

-- (1) user_page_permissions.page : 8 → 9 clés --------------------------------
alter table public.user_page_permissions
  drop constraint if exists user_page_permissions_page_check;
alter table public.user_page_permissions
  add constraint user_page_permissions_page_check
  check (page in ('repjour', 'pdj', 'parking', 'rapro', 'caisse', 'affichage',
                  'facturation', 'literie', 'classeur'));

-- (2) profiles.page_order : inclusion dans les 9 clés, longueur <= 9 ---------
alter table public.profiles
  drop constraint if exists profiles_page_order_check;
alter table public.profiles
  add constraint profiles_page_order_check check (
    page_order is null
    or (
      page_order <@ array['repjour', 'pdj', 'parking', 'rapro', 'caisse',
                          'affichage', 'facturation', 'literie',
                          'classeur']::text[]
      and coalesce(array_length(page_order, 1), 0) <= 9
    )
  );

commit;

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'user_page_permissions_page_check contient classeur' as controle,
       (pg_get_constraintdef(oid) like '%classeur%')::text as ok
from pg_constraint where conname = 'user_page_permissions_page_check'
union all
select 'profiles_page_order_check contient classeur et borne 9',
       (pg_get_constraintdef(oid) like '%classeur%'
        and pg_get_constraintdef(oid) like '%<= 9%')::text
from pg_constraint where conname = 'profiles_page_order_check'
union all
select 'lignes de droits hors des 9 cles (attendu 0)',
       count(*)::text
from public.user_page_permissions
where page not in ('repjour', 'pdj', 'parking', 'rapro', 'caisse', 'affichage',
                   'facturation', 'literie', 'classeur');
