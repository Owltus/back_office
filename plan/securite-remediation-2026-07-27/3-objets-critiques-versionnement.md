# Étape 3 — Objets critiques : vérification, réécriture si besoin, versionnement (C1, G1/G2, M2)

## Objectif

Garantir que les objets qui portent réellement la sécurité — `admin_update_password`,
`get_user_role`, la table `profiles` et son anti-escalade — sont **corrects** ET
**versionnés dans `supabase/`**, pour que le dépôt redevienne la source de vérité et
qu'un audit futur ne reparte plus de suppositions.

## Contexte

C1 : si la garde de `admin_update_password` (SECURITY DEFINER) a sauté, tout compte
`utilisateur` réinitialise le mot de passe d'un admin → prise de contrôle totale. Ces
objets viennent de l'app `repjour` autrefois co-hébergée (partage terminé) → dérive
possible, et **rien n'est dans le dépôt**. L'Étape 1 a tranché s'il faut réécrire ou
seulement rapatrier.

## Fichier(s) impacté(s)

- `supabase/security_core.sql` (nouveau : `get_user_role`, `admin_update_password`)
- `supabase/profiles.sql` (nouveau : table + policies + trigger anti-escalade)

## Travail à réaliser

### 1. Rapatrier la définition confirmée à l'Étape 1

Coller dans `security_core.sql` la sortie exacte de `pg_get_functiondef(...)` des deux
fonctions (source de vérité versionnée), et dans `profiles.sql` la définition de la
table + les policies + le trigger relevés. Idempotent (`create or replace function`,
`drop policy if exists` / `create policy`).

### 2. Réécrire UNIQUEMENT si l'Étape 1 a montré une garde manquante

`admin_update_password` doit impérativement, dans cet ordre :

```sql
create or replace function public.admin_update_password(target_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Garde de rôle EN PREMIÈRE LIGNE : un non-admin ne va pas plus loin.
  if public.get_user_role() <> 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- ... corps existant (mise à jour du mot de passe) ...
end;
$$;

revoke all on function public.admin_update_password(uuid, text) from anon;
grant execute on function public.admin_update_password(uuid, text) to authenticated;
```

Anti-escalade `profiles` (si absente) : policy self-update qui **fige `role`** +
trigger `BEFORE UPDATE` forçant `NEW.role := OLD.role` sauf `is_admin()`.

```sql
-- self-update sans toucher au rôle
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- ceinture + bretelles : trigger anti-escalade
create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
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
```

### 3. Aligner la dépendance résiduelle

Noter dans `CLAUDE.md` (faits DB vérifiés) que ces objets sont désormais versionnés,
et que toute modification passe par ces fichiers.

## Ordre d'exécution

1. Coller les définitions confirmées (Étape 1) dans `security_core.sql` + `profiles.sql`.
2. Si réécriture nécessaire : utilisateur exécute le SQL correctif dans le SQL Editor.
3. Mettre à jour `CLAUDE.md`.

## Critère de validation

- Avec un JWT **non-admin** : `PATCH /rest/v1/profiles?id=eq.<moi>` body `{"role":"admin"}`
  est **refusé** (ou le `role` reste inchangé) — testé sur compte jetable.
- Avec un JWT non-admin : `rpc/admin_update_password` renvoie une erreur (403/forbidden).
- `security_core.sql` et `profiles.sql` reflètent l'état prod (re-dump identique).

## Contrôle /borg

Objets SECURITY DEFINER + trigger : auditer que `admin_update_password` a bien
`search_path` figé (sinon détournement via schéma), que la garde est en 1re ligne, que
le trigger anti-escalade couvre AUSSI l'INSERT si `profiles` accepte des inserts client
(`ComptesBoard.tsx:232-239`), et qu'aucun `grant ... to anon` ne subsiste sur ces
fonctions.
