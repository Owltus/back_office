-- ============================================================================
-- DIAGNOSTIC SÉCURITÉ — LECTURE SEULE (Étape 1 du plan securite-remediation-2026-07-27)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. NE MODIFIE RIEN.
-- Objectif : connaître l'état RÉEL de la prod avant d'écrire le moindre correctif.
-- Reporter les résultats dans doc/rapport securité/etat-policies-prod.md.
--
-- Règle d'or : ne jamais faire de `drop policy if exists "<nom>"` sur un nom
-- deviné. Les `<nom>` à réutiliser dans les Étapes 2/3/4 sont ceux que renvoie
-- la requête (a) ci-dessous.
-- ============================================================================

-- (a) Toutes les policies, par table (source de vérité des noms à droper).
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- (b) Toute table dont la RLS serait désactivée. ATTENDU : 0 ligne.
select relname
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
  and not relrowsecurity
order by relname;

-- (c) C1 — corps des fonctions critiques (garde de rôle en 1re ligne attendue,
--     SECURITY DEFINER, search_path figé).
select pg_get_functiondef('public.admin_update_password'::regprocedure);
select pg_get_functiondef('public.get_user_role'::regprocedure);
select pg_get_functiondef('public.is_admin'::regprocedure);

-- (d) G1/G2 — anti-escalade de profiles : policies + trigger.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;
select tgname
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

-- (e) H1/H2 — lectures encore trop larges. ATTENDU après Étape 2 : seul
--     hotel_config (laissé ouvert volontairement).
select tablename, policyname, qual
from pg_policies
where schemaname = 'public' and cmd = 'SELECT'
  and (qual = 'true' or qual ilike '%auth.uid() IS NOT NULL%')
order by tablename;

-- (f) Droits d'exécution des fonctions sensibles (anon ne doit PAS exécuter
--     admin_update_password / set_user_grade / set_page_permission).
select p.proname, r.rolname as granted_to
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in ('admin_update_password', 'set_user_grade', 'set_page_permission', 'remove_page_permission')
  and a.privilege_type = 'EXECUTE'
order by p.proname, r.rolname;
