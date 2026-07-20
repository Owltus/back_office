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
-- =============================================================================

-- ---- Fonctions sans dépendance à la table -----------------------------------

-- Vrai si l'appelant est de grade 'admin'.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

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
  using (user_id = auth.uid() or public.is_admin());

-- Pas de policy INSERT/UPDATE/DELETE : écriture exclusivement via les RPC ci-dessous.

-- ---- Fonction dépendant de la table -----------------------------------------

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
  update public.profiles set role = p_grade where id = p_user;
end;
$$;

-- ---- Droits d'exécution -----------------------------------------------------
-- Les policies RLS évaluent get_page_level/is_admin/page_level_rank sous
-- l'identité de l'appelant → elles doivent être exécutables par authenticated.
grant execute on function public.is_admin()                            to authenticated;
grant execute on function public.page_level_rank(text)                 to authenticated;
grant execute on function public.get_page_level(text)                  to authenticated;
grant execute on function public.set_page_permission(uuid, text, text) to authenticated;
grant execute on function public.remove_page_permission(uuid, text)    to authenticated;
grant execute on function public.set_user_grade(uuid, text)            to authenticated;
