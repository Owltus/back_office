# Étape 1 — Dictionnaire des comptes (SQL)

## Objectif

Donner à chaque numéro de compte comptable un **nom humain**, indépendant des codes, stocké
en base et éditable. C'est la donnée qui rend le plusieurs-à-plusieurs lisible : un compte
partagé par 5 postes porte partout le même nom clair.

## Contexte

Le référentiel actuel (`facturation_ref_imputations`, PK `(code_analytique, compte)`) porte
`section`/`libelle`/`description` mais **aucun libellé propre au compte**. Le sens du compte
n'existe qu'en creux dans la `description` d'un couple. On crée une table dédiée
`facturation_ref_comptes` calquée sur les conventions existantes (RLS par page, RPC de
gestion, seed ré-exécutable).

## Fichier(s) impacté(s)

- `supabase/facturation_ref_comptes.sql` (nouveau) : table + RLS + index
- `supabase/facturation_ref_comptes_rpc.sql` (nouveau) : upsert / delete / reimport
- `supabase/facturation_ref_comptes_seed.sql` (nouveau) : amorçage des ~50 comptes distincts

## Travail à réaliser

### 1. Table + RLS

```sql
create table if not exists public.facturation_ref_comptes (
  compte      text primary key,                 -- numéro (ex. '60710000')
  libelle     text not null default '',          -- nom humain (ex. 'Achats de denrées')
  updated_at  timestamptz not null default now()
);
-- Lecture = permission 'lecture' sur page facturation ; écriture = 'gestion'.
-- Reproduire EXACTEMENT le patron RLS de facturation_ref_imputations.sql (security_invoker
-- des vues éventuelles, policies par get_page_level('facturation')).
```

### 2. RPC (gestion)

Calquer `facturation_ref_imputations_crud.sql` / `_rpc.sql` :
- `facturation_ref_comptes_upsert(p_compte, p_libelle)` — garde `get_page_level('facturation') = 'gestion'`, `search_path` figé.
- `facturation_ref_comptes_delete(p_compte)` — refuser si le compte est encore référencé
  dans `facturation_ref_imputations` (garde d'intégrité, SQLSTATE explicite).
- `facturation_ref_comptes_reimport(p_rows jsonb)` — additif (`on conflict (compte) do update`),
  pour l'import de masse depuis l'éditeur.

### 3. Seed d'amorçage (AA3)

Générer un `insert … on conflict (compte) do nothing` pour chaque compte DISTINCT présent
dans `facturation_ref_imputations_seed.sql` (~50), avec un `libelle` au mieux dérivé de la
description dominante + intitulé standard du plan comptable. Exemples :

```sql
insert into public.facturation_ref_comptes (compte, libelle) values
  ('60710000', 'Achats de denrées (nourriture & boissons)'),
  ('60750000', 'Achats de boissons alcoolisées'),
  ('62783000', 'Commission d''encaissement ADYEN'),
  ('62810000', 'Abonnements & cotisations')
  -- … un par compte distinct
on conflict (compte) do nothing;
```

Note : amorçage volontairement imparfait ; le comptable affine ensuite via l'éditeur (étape 6).

## Ordre d'exécution

1. Table + RLS (`facturation_ref_comptes.sql`).
2. RPC (`_rpc.sql`).
3. Seed (`_seed.sql`), généré depuis les comptes distincts du référentiel.
4. L'UTILISATEUR joue les trois fichiers dans Supabase, dans cet ordre, AVANT tout push.

## Critère de validation

- `select count(*) from facturation_ref_comptes;` = nombre de comptes distincts attendu.
- Un compte sans permission `lecture` facturation lit 0 ligne (RLS).
- `facturation_ref_comptes_upsert` refusé sans niveau `gestion`.

## Contrôle /borg

Étape critique (nouvelle table + RLS + RPC + seed). Auditer :
- RLS : lecture bornée à la permission de page, écriture réservée `gestion`, `anon` révoqué.
- `search_path` figé dans les RPC ; pas de fuite de `service_role`.
- Garde d'intégrité au delete (compte encore référencé).
- Seed strictement additif (`on conflict do nothing`), ré-exécutable sans écraser une édition.
