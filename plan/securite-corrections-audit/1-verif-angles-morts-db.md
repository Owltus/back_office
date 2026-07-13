# Étape 1 — Vérifier les angles morts DB (escalade de rôle + RPC mot de passe)

## Objectif

Lever ou confirmer les deux risques potentiellement les plus graves de l'audit, dont les définitions ne sont pas dans le dépôt : (G1) un non-admin peut-il élever son propre `profiles.role` à `admin` ? (G2) la RPC `admin_update_password` revérifie-t-elle en interne que l'appelant est admin ? Coût quasi nul (inspection), impact maximal.

## Contexte

`get_user_role()` garde TOUTES les policies d'écriture de l'app ; elle lit `profiles.role`. Si un utilisateur peut réécrire son propre `role`, il devient admin et écrit partout — escalade totale. De même, si `admin_update_password` (`SECURITY DEFINER`, appelée client-side à `src/components/repjour/boards/ComptesBoard.tsx:269`) ne contrôle pas le rôle de l'appelant, tout authentifié réinitialise n'importe quel mot de passe. Ces deux protections sont censées préexister (app `repjour` co-hébergée) ; il faut le CONFIRMER, pas le supposer.

`profiles` et `admin_update_password` sont des objets PARTAGÉS : en cas de défaut, la correction se COORDONNE avec l'app propriétaire, elle ne se patche pas unilatéralement depuis ce dépôt.

## Fichier(s) impacté(s)

- Aucun fichier du dépôt (inspection dans Supabase → SQL Editor).
- Référence côté app : `src/components/repjour/boards/ComptesBoard.tsx` (consommateur de la RPC et des updates `profiles`).

## Travail à réaliser

### 1. Inspecter les policies RLS de `profiles` (G1)

```sql
-- Politiques et clauses (USING / WITH CHECK) sur profiles
select policyname, cmd, qual as using_clause, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles';

-- Triggers sur profiles (chercher un garde anti-escalade de rôle)
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;
```

Résultat attendu (SÛR) : soit la policy `UPDATE` porte un `WITH CHECK` qui empêche un non-admin de modifier `role` (p. ex. `role = (select role from profiles where id = auth.uid()) or get_user_role() = 'admin'`), soit un trigger `BEFORE UPDATE` rejette tout changement de `role` par un non-admin. Si NI l'un NI l'autre → G1 est réel.

### 2. Inspecter la RPC `admin_update_password` (G2)

```sql
select pg_get_functiondef(oid), prosecdef as is_security_definer
from pg_proc
where proname = 'admin_update_password';
```

Résultat attendu (SÛR) : le corps commence par un contrôle du rôle de l'appelant (p. ex. `if get_user_role() <> 'admin' then raise exception ...`). Si `SECURITY DEFINER` SANS ce contrôle → G2 est réel.

### 3. Correctif conditionnel (SEULEMENT si un défaut est confirmé)

Ne rien exécuter sans coordination — ce sont des objets partagés. À titre indicatif, la forme d'un garde anti-escalade sur `profiles` :

```sql
-- EXEMPLE à valider avec l'app proprietaire avant exécution.
create or replace function public.profiles_block_role_escalation()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and get_user_role() <> 'admin' then
    raise exception 'Changement de rôle réservé à un administrateur';
  end if;
  return new;
end;
$$;
```

## Ordre d'exécution

1. Exécuter les requêtes d'inspection (1) et (2) dans Supabase.
2. Consigner le verdict : G1 couvert oui/non, G2 couvert oui/non.
3. Si tout est couvert → clôturer l'étape (aucune action). Sinon → remonter à l'utilisateur pour coordination (ne pas patcher unilatéralement).

## Critère de validation

- Verdict écrit pour G1 et G2 (couvert / non couvert), appuyé sur le texte réel des policies/fonctions.
- Si non couvert : décision de coordination actée, aucun patch unilatéral appliqué.

## Contrôle /borg

Étape critique (touche potentiellement la frontière de privilèges sur une table partagée). Si un correctif est appliqué (après coordination), /borg doit auditer : le garde n'empêche PAS un admin légitime de changer un rôle ; il rejette bien un non-admin ; aucune régression sur les autres policies de `profiles` ; pas d'impact sur l'app `repjour`.
