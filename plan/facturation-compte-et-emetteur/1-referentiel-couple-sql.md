# Étape 1 — Référentiel couple (code + compte) en base + réimport

## Objectif

Créer la table du référentiel qui porte le COUPLE `(code_analytique, compte)`, avec `section`, `libelle`, `description`, en RLS lecture authentifiée et écriture par RPC. Fournir un réimport JSON réexécutable (le fichier du comptable) protégé par un jeton de confirmation. À l'issue, le vrai plan analytique vit en base, réimportable, sans que l'UI en dépende encore.

## Contexte

Le référentiel actuel `facturation_budget_lines` a `code` en PK, sans `compte`. La cible est un plusieurs-à-plusieurs code↔compte. Choix D1 : table PLATE (une ligne = un couple) répétant section/libellé/description — trivial à réimporter, ~90 lignes. Base de PRODUCTION : SQL exécuté par l'utilisateur ; un réimport « remplaçant » est destructif, donc gardé par un jeton de confirmation (modèle `supabase/facturation_reset_DANGER.sql`).

## Fichier(s) impacté(s)

- `supabase/facturation_ref_imputations.sql` (nouveau) — table + RLS + seed initial (JSON fourni)
- `supabase/facturation_ref_imputations_rpc.sql` (nouveau) — RPC de réimport bulk

## Travail à réaliser

### 1. Table + RLS

```sql
create table if not exists public.facturation_ref_imputations (
  code_analytique text not null,
  compte          text not null,
  section         text not null default '',
  libelle         text not null default '',
  description     text not null default '',
  sort_order      int  not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (code_analytique, compte)
);
create index if not exists facturation_ref_imp_compte_idx
  on public.facturation_ref_imputations (compte);
```

- Trigger `_touch()` (updated_at), modèle `facturation_budget_lines_touch` (`set search_path = public`).
- RLS : `select to authenticated using (true)` ; AUCUNE policy d'écriture (RPC only).

### 2. RPC de réimport (SECURITY DEFINER)

- Garde de rôle en tête : `if public.page_level_rank(public.get_page_level('facturation')) < 2 then raise exception 'not authorized'; end if;` + `set search_path = public`.
- Entrée : `jsonb` (tableau des lignes). Upsert `on conflict (code_analytique, compte) do update`.
- Réimport « remplaçant » (suppression des couples disparus) : gardé par un jeton `set facturation.confirm_reimport = '...'` posé dans la même session SQL (modèle `facturation_reset_DANGER.sql`). Sans jeton : upsert additif seul, jamais de suppression.

### 3. Seed initial

- Insérer le JSON fourni (plan analytique du comptable) par le même chemin que le réimport.
- AVANT le seed, faire corriger par le contact compta les incohérences repérées : doublon `FMMATTECHo` + `60630000`, variante `RAFBOUT` / `RAFBOUTooo`, et la nature des `o` en fin de code (des zéros ?).

## Ordre d'exécution

1. L'utilisateur exécute `facturation_ref_imputations.sql` dans Supabase → SQL Editor.
2. Puis `facturation_ref_imputations_rpc.sql`.
3. Réimport du JSON nettoyé via la RPC.

## Critère de validation

- `select count(*) from public.facturation_ref_imputations` = nombre de lignes du JSON nettoyé.
- Un utilisateur sans niveau écriture sur `facturation` ne peut pas appeler la RPC (`not authorized`).
- Réexécution des deux fichiers sans erreur (idempotents).

## Contrôle /borg

Étape critique (SQL, table + RPC en PRODUCTION, réimport potentiellement destructif). Audit post-exécution :
- Garde de rôle en tête de CHAQUE RPC + `set search_path = public`.
- Le réimport « remplaçant » est inatteignable sans le jeton de confirmation.
- Aucune policy d'écriture directe sur la table (RPC only).
- Pas de FK dure vers d'autres tables (des couples orphelins appris restent possibles).
