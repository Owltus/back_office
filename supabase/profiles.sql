-- ============================================================================
-- profiles — anti-escalade de rôle (G1/G2) + rapatriement dans le dépôt.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS le diagnostic
-- (Étape 1). Ces objets EXISTENT déjà en prod (vérifiés le 2026-07-20) mais
-- n'étaient pas versionnés : ce fichier les rend reproductibles.
--
-- ⚠ RECONCILIER AVEC LE DUMP (Étape 1) AVANT D'EXÉCUTER :
--   - Reprendre le NOM EXACT de la policy self-update relevé par la requête (d).
--     S'il diffère de "Users update own profile", ADAPTER le drop ci-dessous —
--     sinon on laisse en place l'ancienne (permissive) en plus de la nouvelle.
--   - Ne PAS toucher à la table (create table) : la définition réelle vit en prod.
--     Ce fichier ne gère QUE les gardes (policy + trigger), idempotentes.
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
-- ============================================================================

alter table public.profiles enable row level security;

-- 1) Self-update SANS pouvoir changer son rôle : le `role` écrit doit rester
--    égal au rôle courant. Un non-admin ne peut donc pas se promouvoir.
-- 2026-09-05 : texte aligné sur rpc_invoker_2026-09.sql (autorité). L'ancienne
-- sous-requête sur profiles était récursive (42P17 « infinite recursion detected
-- in policy », bug depuis le 2026-08-05) ; role/email sont désormais lus via
-- les aides security definer du schéma private.
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select private.get_user_role())
    -- B2 : figer aussi l'email (jamais édité par /profil) → pas d'usurpation
    -- d'affichage dans la console admin (profiles.email vs auth.users.email).
    and email = (select private.get_user_email())
  );

-- 2) Ceinture + bretelles : trigger protect_role_escalation.
--    REMPLACÉ — NE PLUS REJOUER ce bloc : la version de prod (branche INSERT
--    du 2026-08-04, security INVOKER depuis le 2026-09-06) est versionnée dans
--    private_schema_aides.sql (prevent_self_role_change) ; rejouer l'ancien
--    corps rouvrirait l'escalade à l'INSERT.
--    CHECK profiles.role réduit à utilisateur/admin : securite_audit_2026-09-06.sql.

-- 3) VÉRIFICATION (lecture seule) — avec un JWT NON-admin (compte jetable),
--    l'appel PostgREST suivant doit laisser `role` INCHANGÉ :
--      patch /rest/v1/profiles?id=eq.<mon_id>  body {"role":"admin"}
--    puis  select role from profiles where id = auth.uid();  -- attendu : rôle d'origine
