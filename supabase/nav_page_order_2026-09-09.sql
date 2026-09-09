-- =============================================================================
-- nav_page_order_2026-09-09.sql — ordre des pages de navigation, par compte
--
-- Application : `supabase db query --linked -f supabase/nav_page_order_2026-09-09.sql`
-- Idempotent, une transaction. Aucune donnée réécrite, aucune policy modifiée.
--
-- POURQUOI / décisions (plan/navigation-ordre-et-accueil) :
--
--   * L'ordre des pages devient une préférence PAR COMPTE, et la page en tête
--     de cet ordre est la page d'accueil du compte (celle vers laquelle `/`
--     redirige). Jusqu'ici l'ordre était figé dans le registre client
--     `src/lib/permissions/pages.ts` et l'accueil codé en dur sur `/repjour`.
--
--   * La préférence vit sur `profiles`, PAS sur `user_page_permissions`, pour
--     une raison structurelle : un compte admin n'a AUCUNE ligne de permission
--     (son accès total vient de `private.get_page_level`, branche
--     `when private.is_admin() then 'gestion'`). Un rang porté par la ligne de
--     permission ne pourrait donc jamais stocker l'ordre d'un admin, alors que
--     la décision produit est qu'il puisse le personnaliser comme les autres.
--
--   * AUCUNE policy n'est modifiée, et c'est voulu. Le réglage est ouvert à
--     l'admin (`Admin manages profiles`, FOR ALL) ET à chacun sur son propre
--     compte : or `Users update own profile` ne fige que `role` et `email`
--     dans son WITH CHECK, donc toute autre colonne est déjà auto-éditable —
--     comme `first_name` l'est aujourd'hui. Aucune RPC n'est nécessaire.
--
--   * `get_my_access()` n'est PAS touchée : elle construit son champ `profile`
--     avec `to_jsonb(p)`, donc la colonne remonte seule au client. Le contrôle
--     17 de verif_audit_2026-09-06.sql reste valide.
--
--   * Colonne NULLABLE sans valeur par défaut : `null` = « aucune préférence »
--     et vaut, côté client, l'ordre du registre. Les comptes existants gardent
--     donc exactement le comportement actuel, sans backfill, et une page
--     ajoutée plus tard n'oblige à aucune reprise de données.
--
--   * Pas de journalisation : `audit_log` est un journal de SÉCURITÉ (16 lignes
--     à ce jour). Un ordre d'affichage que l'utilisateur peut changer lui-même
--     n'y a pas sa place, et l'y écrire imposerait d'élargir le CHECK sur
--     `audit_log.action`. Le trigger `audit_profiles` reste sur `UPDATE OF role`.
--
-- ATTENTION : ne JAMAIS rejouer supabase/profiles.sql en entier — son bloc 2
-- porte « REMPLACÉ — NE PLUS REJOUER » et rouvrirait l'escalade de rôle.
--
-- ⚠ La liste des 8 clés de page ci-dessous est la TROISIÈME occurrence dans le
-- dépôt, après le CHECK de `user_page_permissions` (securite_audit_2026-09-06.sql)
-- et le registre `src/lib/permissions/pages.ts`. Toute nouvelle page doit être
-- ajoutée aux TROIS endroits.
-- =============================================================================

begin;

-- ---- La colonne -------------------------------------------------------------
-- Ordre choisi des pages, de la première à la dernière. La tête vaut page
-- d'accueil. Peut être PARTIEL et PÉRIMÉ sans dommage : le client réconcilie
-- (cf. `orderedPages`, src/lib/permissions/navigation.ts) en filtrant sur les
-- droits puis en complétant avec les pages accordées absentes de la liste.
alter table public.profiles
  add column if not exists page_order text[];

comment on column public.profiles.page_order is
  'Ordre choisi des pages de navigation ; la tête est la page d''accueil. '
  'NULL = aucune préférence (ordre du registre client). Peut être partiel ou '
  'périmé : le client réconcilie avec les droits à la lecture.';

-- ---- Garde-fou --------------------------------------------------------------
-- Inclusion dans les 8 clés connues + longueur bornée. Volontairement PAS de
-- contrôle d'unicité : l'expression nécessaire (`array(select distinct …)`)
-- n'est pas immutable, donc inutilisable dans un CHECK. Les doublons sont
-- écartés à la saisie et restent sans effet à la lecture (la réconciliation ne
-- retient qu'une occurrence par clé).
alter table public.profiles
  drop constraint if exists profiles_page_order_check;

alter table public.profiles
  add constraint profiles_page_order_check check (
    page_order is null
    or (
      page_order <@ array['repjour', 'pdj', 'parking', 'rapro', 'caisse',
                          'affichage', 'facturation', 'literie']::text[]
      and coalesce(array_length(page_order, 1), 0) <= 8
    )
  );

commit;

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'colonne page_order presente' as controle,
       count(*)::text as valeur
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'page_order' and data_type = 'ARRAY'
union all
select 'colonne nullable (attendu YES)',
       coalesce(max(is_nullable), 'ABSENTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'page_order'
union all
select 'contrainte profiles_page_order_check presente',
       count(*)::text
from pg_constraint
where conname = 'profiles_page_order_check'
union all
select 'comptes avec preference (attendu 0 juste apres migration)',
       count(*)::text
from public.profiles
where page_order is not null
union all
select 'policies profiles inchangees (attendu 4)',
       count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
union all
select 'trigger protect_role_escalation intact (attendu 1)',
       count(*)::text
from pg_trigger
where tgname = 'protect_role_escalation' and not tgisinternal
union all
select 'audit_profiles toujours sur UPDATE OF role (attendu 1)',
       count(*)::text
from pg_trigger
where tgname = 'audit_profiles' and not tgisinternal
union all
select 'get_my_access inchangee : invoker (attendu f)',
       coalesce(max(prosecdef::text), 'ABSENTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_my_access';
