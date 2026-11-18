-- =====================================================================
-- Comptes : le dernier administrateur ne se retire plus, par aucun chemin
-- (audit de sécurité run-2 du 2026-11-18, étape 1 du plan
-- `plan/securite-audit-run2-2026-11-18/`)
-- =====================================================================
-- Symptôme : un admin peut laisser l'app SANS admin. Par un appel direct à
--   l'API (`update profiles set role = 'utilisateur'` sur sa propre ligne,
--   ou `delete` du dernier profil admin), la policy « Admin manages
--   profiles » le laisse faire. Deux `set_user_grade` simultanés passent
--   aussi tous les deux. La gestion des comptes reste alors fermée jusqu'à
--   une réparation à la main avec la clé serveur.
-- Cause : la règle « au moins un admin » ne vit que dans
--   `private.set_user_grade`, sous la forme d'un comptage sans verrou suivi
--   d'un UPDATE. Elle ne protège ni l'écriture directe, ni la suppression,
--   ni deux appels concurrents.
-- Correctif :
--   1. trigger `protect_zz_dernier_admin` (BEFORE UPDATE OF role OR DELETE,
--      fonction `private.profiles_garde_dernier_admin`) : un changement qui
--      retire le rôle admin (UPDATE vers un autre rôle, ou DELETE d'un
--      admin) est refusé (42501) s'il ne reste aucun autre admin. Le
--      contrôle se fait sous `pg_advisory_xact_lock` : deux retraits
--      simultanés sont mis l'un après l'autre, le second voit le premier.
--      Comparaisons NULL-sûres (`is distinct from`), jamais `<>`. Le nom
--      trie APRÈS `protect_role_escalation` (même moment BEFORE, ordre
--      alphabétique) : le rôle lu est le rôle final.
--   2. `prevent_self_role_change` fige aussi `created_at` sur un UPDATE.
--   Le contrôle de `set_user_grade` est gardé : son message reste le
--   premier vu par l'écran /comptes (testé dans 02_rpc_privilegiees).
-- Innocuité : l'écran /comptes passe déjà par `set_user_grade`, qui refuse
--   le même cas avant d'écrire. La suppression d'un compte (Edge
--   `delete-user`) ne vise jamais l'appelant, qui est admin : il reste donc
--   au moins un admin, et la suppression en cascade d'un compte non admin
--   ne lit même pas la règle. La copie de la prod et le seed écrivent en
--   `session_replication_role = replica` (triggers coupés), et TRUNCATE ne
--   déclenche pas de trigger de ligne. Aucune donnée réécrite.
--   Dernières définitions : baseline (prevent_self_role_change).
-- =====================================================================

-- 1. Garde du dernier admin -------------------------------------------------
create or replace function private.profiles_garde_dernier_admin()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Rien ne quitte le rôle admin : rien à vérifier.
  if old.role is distinct from 'admin'
     or (tg_op = 'UPDATE' and new.role is not distinct from 'admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Un retrait à la fois : le suivant attend et relit la table après lui.
  perform pg_advisory_xact_lock(hashtext('profiles:admins'));
  if not exists (
    select 1 from public.profiles p
     where p.role = 'admin' and p.id is distinct from old.id) then
    raise exception using
      errcode = '42501',
      message = 'dernier admin : retrait refusé (verrouillage total)';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

alter function private.profiles_garde_dernier_admin() owner to postgres;
revoke all on function private.profiles_garde_dernier_admin() from public, anon, authenticated;

create trigger protect_zz_dernier_admin
  before update of role or delete on public.profiles
  for each row execute function private.profiles_garde_dernier_admin();

-- 2. created_at figé ------------------------------------------------------
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_admin() then new.role := 'utilisateur'; end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not private.is_admin() then
      new.role := old.role;
    end if;
    -- 2026-11-18 : la date de création d'un compte ne se réécrit pas.
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
