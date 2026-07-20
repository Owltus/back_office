# Étape 1 — Socle SQL : table de permissions, fonction, RPC

## Objectif

Poser en base tout ce dont dépend l'étanchéité : une table `user_page_permissions` (le « qui a quel niveau sur quelle page »), une fonction `get_page_level(page)` réutilisable par toutes les policies RLS, les RPC réservées à l'administrateur pour attribuer/retirer les droits et changer le grade, et le backfill qui aligne les comptes existants sur le nouveau modèle. Aucune modification destructrice : ajout de table, ajout de fonctions, `UPDATE` ciblé et confirmé.

## Contexte

Le grade reste porté par `profiles.role` (enum inchangé, 3 valeurs conservées). Le fin — le niveau par page — vit dans une table dédiée plutôt que dans une colonne JSON : requêtable, indexable, et adressable proprement par les RLS. `get_page_level` centralise la règle « admin = Gestion partout, sinon le niveau stocké, sinon rien » de sorte que les 14 tables de l'Étape 2 n'aient qu'à appeler cette fonction. Les écritures sur la table de permissions passent **exclusivement** par des RPC `SECURITY DEFINER` gardées admin (même pattern que le domaine `facturation`) : le client n'écrit jamais la table en direct, ce qui ferme la porte à l'auto-élévation.

## Fichier(s) impacté(s)

- `supabase/user_page_permissions.sql` (nouveau — table + RLS, exécuté par l'utilisateur)
- `supabase/page_permissions_fn.sql` (nouveau — `get_page_level`, `page_level_rank`, `is_admin`)
- `supabase/page_permissions_rpc.sql` (nouveau — `set_page_permission`, `remove_page_permission`, `set_user_grade`)
- `supabase/backfill_grades.sql` (nouveau — `super_utilisateur` → `utilisateur`, ciblé)

## Travail à réaliser

### 1. Table `user_page_permissions` + RLS

```sql
create table if not exists public.user_page_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  page    text not null,
  level   text not null check (level in ('lecture','ecriture','gestion')),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (user_id, page)
);
alter table public.user_page_permissions enable row level security;

-- Lecture : chacun voit SES droits ; un admin voit tout (pour l'écran /comptes)
drop policy if exists "upp select self or admin" on public.user_page_permissions;
create policy "upp select self or admin" on public.user_page_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Aucune policy write : toute écriture passe par les RPC SECURITY DEFINER (§3)
```

Absence de ligne pour `(user, page)` = **aucun accès** à la page (défaut = fermé, conforme à la décision de migration).

### 2. Fonctions `is_admin`, `page_level_rank`, `get_page_level`

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.page_level_rank(p_level text)
returns int language sql immutable as $$
  select case p_level when 'lecture' then 1 when 'ecriture' then 2 when 'gestion' then 3 else 0 end;
$$;

create or replace function public.get_page_level(p_page text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then 'gestion'                          -- admin = Gestion partout
    else (select level from public.user_page_permissions
          where user_id = auth.uid() and page = p_page)            -- sinon le niveau stocké (ou NULL)
  end;
$$;
```

`page_level_rank(get_page_level('caisse')) >= 2` = « au moins Écriture sur la caisse » — le prédicat que l'Étape 2 posera partout.

### 3. RPC d'administration (gardées admin)

```sql
create or replace function public.set_page_permission(p_user uuid, p_page text, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_level not in ('lecture','ecriture','gestion') then raise exception 'invalid level'; end if;
  insert into public.user_page_permissions (user_id, page, level, updated_by)
  values (p_user, p_page, p_level, auth.uid())
  on conflict (user_id, page) do update
    set level = excluded.level, updated_at = now(), updated_by = auth.uid();
end;
$$;

create or replace function public.remove_page_permission(p_user uuid, p_page text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  delete from public.user_page_permissions where user_id = p_user and page = p_page;
end;
$$;

create or replace function public.set_user_grade(p_user uuid, p_grade text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_grade not in ('admin','utilisateur') then raise exception 'invalid grade'; end if;
  update public.profiles set role = p_grade where id = p_user;
end;
$$;
```

`set_user_grade` remplace l'`UPDATE profiles` direct fait aujourd'hui côté client (`ComptesBoard.saveEdit`) par un canal serveur gardé — cohérent avec l'étanchéité voulue.

### 4. Backfill des grades (confirmation requise)

```sql
-- OPÉRATION DE MASSE — à exécuter après validation explicite de l'utilisateur
update public.profiles set role = 'utilisateur' where role = 'super_utilisateur';
```

Les comptes `admin` sont laissés intacts. Aucune permission par page n'est créée (table rase, décision de migration) — le pré-remplissage éventuel se fait à l'Étape 8, avant bascule.

## Ordre d'exécution

1. Exécuter `page_permissions_fn.sql` (les fonctions, dont dépendent la table et les RPC).
2. Exécuter `user_page_permissions.sql` (table + RLS).
3. Exécuter `page_permissions_rpc.sql` (RPC admin).
4. Après confirmation explicite : exécuter `backfill_grades.sql`.

## Critère de validation

- Un `admin` obtient `get_page_level('<n'importe quelle page>') = 'gestion'`.
- Un `utilisateur` sans ligne obtient `get_page_level(...) = NULL` (aucun accès).
- Après `set_page_permission`, `get_page_level` renvoie le niveau attribué.
- Un `utilisateur` appelant `set_page_permission` / `set_user_grade` reçoit `not authorized`.
- Un `utilisateur` ne peut pas `INSERT`/`UPDATE` directement `user_page_permissions` (aucune policy write).
- Scripts idempotents (ré-exécutables sans effet de bord).

## Contrôle /borg

Étape critique (nouvelle table de sécurité + fonctions `SECURITY DEFINER` + `UPDATE` de masse). /borg doit auditer : la table n'a bien **aucune** policy write (écriture RPC only) ; `is_admin()` / `get_page_level()` fixent `search_path = public` (pas d'injection de schéma) ; `set_user_grade` ne permet pas de se promouvoir soi-même (garde admin en tête) ; le backfill ne touche que `super_utilisateur` ; aucune escalade possible pour un grade `utilisateur` (analogue au risque G1 de l'audit sécurité).
