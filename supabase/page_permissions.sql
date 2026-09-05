-- =============================================================================
-- page_permissions — socle des droits PAR PAGE (grades + niveaux)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- NON DESTRUCTIF : ajoute une table + des fonctions + des RPC. Ne modifie
-- aucune table existante, n'écrit aucune donnée métier.
--
-- MODÈLE
--   - Grade de compte : profiles.role reste tel quel. Un compte 'admin' est
--     super-administrateur (accès total partout + administration des comptes).
--     Tout autre grade ('utilisateur', et 'super_utilisateur' legacy) n'a que
--     les droits qu'on lui accorde page par page.
--   - Niveau par page (table user_page_permissions) : 'lecture' < 'ecriture' <
--     'gestion'. Absence de ligne = AUCUN accès à la page (défaut fermé).
--   - get_page_level(page) : 'gestion' si l'appelant est admin, sinon le niveau
--     stocké, sinon NULL. C'est la fonction que les policies RLS des tables
--     métier interrogeront (voir page_permissions_rls.sql).
--
-- SÉCURITÉ
--   - La table n'a AUCUNE policy d'écriture : elle ne se modifie QUE via les RPC
--     SECURITY DEFINER gardées admin ci-dessous (impossible pour un utilisateur
--     de s'auto-attribuer un droit).
--   - is_admin() / get_page_level() sont SECURITY DEFINER + search_path=public
--     (lisent profiles/permissions sans dépendre de la RLS de l'appelant, sur le
--     modèle de get_user_role()).
--
-- ORDRE INTERNE : la table est créée AVANT get_page_level(), car cette fonction
-- SQL référence la table et son corps est validé à la création.
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
-- =============================================================================

-- ---- Fonctions sans dépendance à la table -----------------------------------

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : is_admin vit désormais dans le schéma private
-- (autorité : supabase/private_schema_aides.sql). Ne pas rejouer ce bloc
-- (fonction et ses grants) : il recréerait une fonction security definer dans
-- public (Security Advisor rouvert, doublon avec le relais). Conservé pour
-- l'historique.
-- ---------------------------------------------------------------------------
-- Vrai si l'appelant est de grade 'admin'.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : page_level_rank vit désormais dans le schéma private
-- (autorité : supabase/private_schema_aides.sql). Ne pas rejouer ce bloc
-- (fonction et ses grants) : il recréerait une fonction security definer dans
-- public (Security Advisor rouvert, doublon avec le relais). Conservé pour
-- l'historique.
-- ---------------------------------------------------------------------------
-- Ordre total des niveaux (0 = aucun accès).
create or replace function public.page_level_rank(p_level text)
returns int
language sql immutable
as $$
  select case p_level
    when 'lecture' then 1
    when 'ecriture' then 2
    when 'gestion' then 3
    else 0
  end;
$$;

-- ---- Table + RLS (lecture self/admin ; AUCUNE écriture directe) --------------
create table if not exists public.user_page_permissions (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  page       text not null,
  level      text not null check (level in ('lecture', 'ecriture', 'gestion')),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (user_id, page)
);

alter table public.user_page_permissions enable row level security;

-- SELECT : chacun voit SES droits ; un admin voit tout (écran /comptes).
drop policy if exists "upp select self or admin" on public.user_page_permissions;
create policy "upp select self or admin"
  on public.user_page_permissions for select
  to authenticated
  using (user_id = auth.uid() or private.is_admin());

-- Pas de policy INSERT/UPDATE/DELETE : écriture exclusivement via les RPC ci-dessous.

-- ---- Fonction dépendant de la table -----------------------------------------

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : get_page_level vit désormais dans le schéma private
-- (autorité : supabase/private_schema_aides.sql). Ne pas rejouer ce bloc
-- (fonction et ses grants) : il recréerait une fonction security definer dans
-- public (Security Advisor rouvert, doublon avec le relais). Conservé pour
-- l'historique.
-- ---------------------------------------------------------------------------
-- Niveau de l'appelant sur une page : admin = 'gestion' partout, sinon le niveau
-- stocké (ou NULL = aucun accès).
create or replace function public.get_page_level(p_page text)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.is_admin() then 'gestion'
    else (select level from public.user_page_permissions
          where user_id = auth.uid() and page = p_page)
  end;
$$;

-- ---- RPC d'administration (gardées admin) -----------------------------------

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : set_page_permission vit désormais dans le schéma
-- private (autorité : supabase/private_rpc_relais.sql). Ne pas rejouer ce bloc
-- (fonction et ses grants) : il recréerait une fonction security definer dans
-- public (Security Advisor rouvert, doublon avec le relais). Conservé pour
-- l'historique.
-- ---------------------------------------------------------------------------
-- Attribue / met à jour le niveau d'un utilisateur sur une page.
create or replace function public.set_page_permission(p_user uuid, p_page text, p_level text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_level not in ('lecture', 'ecriture', 'gestion') then
    raise exception 'invalid level: %', p_level;
  end if;
  insert into public.user_page_permissions (user_id, page, level, updated_by)
  values (p_user, p_page, p_level, auth.uid())
  on conflict (user_id, page) do update
    set level = excluded.level, updated_at = now(), updated_by = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : remove_page_permission vit désormais dans le schéma
-- private (autorité : supabase/private_rpc_relais.sql). Ne pas rejouer ce bloc
-- (fonction et ses grants) : il recréerait une fonction security definer dans
-- public (Security Advisor rouvert, doublon avec le relais). Conservé pour
-- l'historique.
-- ---------------------------------------------------------------------------
-- Retire tout accès d'un utilisateur à une page.
create or replace function public.remove_page_permission(p_user uuid, p_page text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  delete from public.user_page_permissions where user_id = p_user and page = p_page;
end;
$$;

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : set_user_grade vit désormais dans le schéma private
-- (autorité : supabase/private_rpc_relais.sql). Ne pas rejouer ce bloc
-- (fonction et ses grants) : il recréerait une fonction security definer dans
-- public (Security Advisor rouvert, doublon avec le relais). Conservé pour
-- l'historique.
-- ---------------------------------------------------------------------------
-- Change le grade d'un compte (canal serveur gardé, remplace l'update client direct).
create or replace function public.set_user_grade(p_user uuid, p_grade text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_grade not in ('admin', 'utilisateur') then
    raise exception 'invalid grade: %', p_grade;
  end if;
  -- Garde « dernier admin » (A4) : refuser de rétrograder le SEUL admin restant
  -- (sinon verrouillage total de l'administration).
  if p_grade <> 'admin'
     and exists (select 1 from public.profiles where id = p_user and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'dernier admin: rétrogradation refusée (verrouillage total)';
  end if;
  -- Traçabilité (A4, pentest #2) : journaliser AVANT l'update (capture l'ancien rôle).
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    'profiles', p_user::text, 'set_user_grade',
    jsonb_build_object(
      'old_role', (select role from public.profiles where id = p_user),
      'new_grade', p_grade
    ),
    auth.uid(), now()
  );
  update public.profiles set role = p_grade where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : les privilèges sont posés avec les fonctions dans le
-- schéma private (private_schema_aides.sql, private_rpc_relais.sql). Ces grants
-- échoueraient pour les 3 aides (plus dans public) et ne viseraient que les
-- relais pour les 3 RPC. Conservé pour l'historique.
-- ---------------------------------------------------------------------------
-- ---- Droits d'exécution -----------------------------------------------------
-- Les policies RLS évaluent get_page_level/is_admin/page_level_rank sous
-- l'identité de l'appelant → elles doivent être exécutables par authenticated.
grant execute on function public.is_admin()                            to authenticated;
grant execute on function public.page_level_rank(text)                 to authenticated;
grant execute on function public.get_page_level(text)                  to authenticated;
grant execute on function public.set_page_permission(uuid, text, text) to authenticated;
grant execute on function public.remove_page_permission(uuid, text)    to authenticated;
grant execute on function public.set_user_grade(uuid, text)            to authenticated;
