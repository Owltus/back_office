# Étape 7 — I6 : `set_user_grade` refuse de rétrograder le dernier admin

## Objectif

Empêcher un verrouillage total de l'administration : `set_user_grade` a bien une
garde `is_admin()` et valide le grade, mais rien n'empêche de rétrograder le
DERNIER admin (ou de se rétrograder soi-même) -> plus aucun admin -> personne ne
peut plus attribuer de droits (`is_admin()` requis partout).

## Contexte

Disponibilité, pas confidentialité — mais l'impact est un lockout irréversible sans
intervention service_role. Le pendant existe déjà côté `delete-user` (refus de
supprimer un admin) ; il manque sur `set_user_grade`.

## Fichier(s) impacté(s)

- `supabase/page_permissions.sql` (fonction `set_user_grade`)

## Travail à réaliser

Ajouter la garde avant l'`update` (page_permissions.sql:121-132) :

```sql
create or replace function public.set_user_grade(p_user uuid, p_grade text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_grade not in ('admin', 'utilisateur') then
    raise exception 'invalid grade: %', p_grade;
  end if;
  -- Garde « dernier admin » : refuser de rétrograder le seul admin restant.
  if p_grade <> 'admin'
     and exists (select 1 from public.profiles where id = p_user and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'dernier admin: impossible de le rétrograder';
  end if;
  update public.profiles set role = p_grade where id = p_user;
end;
$$;
```

Option supplémentaire (au choix de l'utilisateur) : interdire aussi
l'auto-rétrogradation (`if p_user = auth.uid() and p_grade <> 'admin' then raise ...`).

## Ordre d'exécution

1. Jouer la fonction réécrite en base.
2. Committer `page_permissions.sql`.

## Critère de validation

- Avec un seul admin en base : `set_user_grade(<cet admin>, 'utilisateur')` lève
  `dernier admin`.
- Avec deux admins : la rétrogradation de l'un fonctionne.
- La promotion `utilisateur -> admin` fonctionne toujours.

## Contrôle /borg

Auditer : (1) la garde ne bloque pas un changement légitime (promotion, ou
rétrogradation quand >1 admin) ; (2) `search_path` figé conservé ; (3) le comptage
`count(*) ... role='admin'` n'est pas contournable par une race (acceptable ici,
opération admin rare ; noter si un `for update` est souhaité).
