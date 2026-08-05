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
-- ============================================================================

alter table public.profiles enable row level security;

-- 1) Self-update SANS pouvoir changer son rôle : le `role` écrit doit rester
--    égal au rôle courant. Un non-admin ne peut donc pas se promouvoir.
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    -- B2 : figer aussi l'email (jamais édité par /profil) → pas d'usurpation
    -- d'affichage dans la console admin (profiles.email vs auth.users.email).
    and email = (select email from public.profiles where id = auth.uid())
  );

-- 2) Ceinture + bretelles : trigger BEFORE UPDATE qui FORCE le rôle à sa valeur
--    précédente sauf si l'appelant est admin. Neutralise tout contournement de
--    policy (ex. update via une RPC mal gardée).
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role_escalation on public.profiles;
create trigger protect_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

-- 3) VÉRIFICATION (lecture seule) — avec un JWT NON-admin (compte jetable),
--    l'appel PostgREST suivant doit laisser `role` INCHANGÉ :
--      patch /rest/v1/profiles?id=eq.<mon_id>  body {"role":"admin"}
--    puis  select role from profiles where id = auth.uid();  -- attendu : rôle d'origine
