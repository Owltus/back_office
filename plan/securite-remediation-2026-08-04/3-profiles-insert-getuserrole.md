# Étape 3 — E1 + F3 : anti-escalade à l'INSERT de `profiles` + versionner `get_user_role`

## Objectif

Fermer l'angle mort d'escalade verticale : l'anti-escalade de rôle actuelle ne
couvre que l'UPDATE, l'INSERT de `profiles` n'est régi par aucun objet versionné.
Et versionner le corps réel de `get_user_role`, garde d'écriture de nombreuses
tables, aujourd'hui absent du dépôt (placeholder).

## Contexte

`profiles.sql` ne porte qu'une policy UPDATE figeant `role` + un trigger
`protect_role_escalation` **BEFORE UPDATE seulement** (la fonction référence
`old.role`, donc plante/est inopérante en INSERT). Si la policy INSERT live
autorise un self-insert sans borner `role` (à confirmer Étape 2), un JWT sans
ligne profil peut s'auto-insérer `role='admin'`. `get_user_role` garde encore les
écritures des 6 fichiers de table (cf. Étape 4) mais son corps n'est pas versionné.

## Fichier(s) impacté(s)

- `supabase/profiles.sql`
- `supabase/security_core.sql`

## Travail à réaliser

### 1. Policy INSERT bornée sur `profiles` (E1)

Selon le verdict de l'Étape 2. Deux modèles possibles ; retenir celui qui colle au
flux réel de création (`ComptesBoard.tsx` insère la ligne sous session admin) :

```sql
-- Un admin insère n'importe quel rôle ; un non-admin ne peut s'auto-insérer
-- qu'en 'utilisateur' (jamais 'admin').
drop policy if exists "profiles insert (bornee)" on public.profiles;
create policy "profiles insert (bornee)"
  on public.profiles for insert to authenticated
  with check (
    public.is_admin()
    or (id = auth.uid() and role = 'utilisateur')
  );
```

### 2. Étendre la garde trigger à l'INSERT (E1, défense en profondeur)

La fonction actuelle référence `old` -> réécrire pour gérer les deux TG_OP :

```sql
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.role := 'utilisateur'; end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not public.is_admin() then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role_escalation on public.profiles;
create trigger protect_role_escalation
  before insert or update on public.profiles
  for each row execute function public.prevent_self_role_change();
```

### 3. Versionner `get_user_role` (F3)

Coller dans `security_core.sql` le corps réel récupéré à l'Étape 2
(`pg_get_functiondef`), en s'assurant qu'il porte bien
`security definer set search_path = public`. Remplacer le placeholder
`>>> COLLER ICI ... <<<` (lignes 83-87).

## Ordre d'exécution

1. Vérifier le verdict Étape 2 (policy INSERT live).
2. Jouer la policy INSERT + le trigger réécrit dans Supabase.
3. Coller `get_user_role` dans `security_core.sql` et le rejouer.
4. Committer les deux fichiers `.sql` mis à jour.

## Critère de validation

- Sur un **compte jetable non-admin** : tenter `insert into profiles (id, role)
  values (auth.uid(), 'admin')` via PostgREST -> la ligne est créée avec
  `role='utilisateur'` (ou rejetée), jamais `admin`.
- `select pg_get_functiondef('public.get_user_role()'::regprocedure)` correspond
  au corps versionné dans `security_core.sql`.

## Contrôle /borg

Après exécution, auditer : (1) la policy INSERT ne casse pas le flux légitime de
création de compte admin (`create-user` + insert `ComptesBoard`) ; (2) le trigger
`before insert or update` n'introduit pas de régression sur l'UPDATE existant
(figement de `role` toujours effectif) ; (3) `get_user_role` versionné est
identique au live (aucune dérive de garde qui rouvrirait des écritures).
