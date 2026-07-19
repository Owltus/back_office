# Étape 1 — Table `facturation_budget_lines` + RLS + seed « à l'identique »

## Objectif

Créer la table Supabase qui héberge le référentiel des imputations, avec lecture
ouverte aux authentifiés (pattern facturation), un `updated_at` auto, et un **seed
idempotent** qui reproduit **exactement** les ~55 lignes de `BUDGET_LINES`
(`src/lib/facturation/constants.ts`). À l'issue de cette étape, la donnée existe en
base sans que le comportement de l'app change encore.

## Contexte

Aucune migration versionnée dans le repo : **un fichier `.sql` par feature**,
idempotent, exécuté à la main par l'utilisateur. Le `code` devient une **PK
scalaire** (cible potentielle de FK, mais voir étape 2 / D2). `tags` en `text[]`
(calque de `BudgetLine.tags`). Prod live : le fichier doit être **purement additif**
(jamais de `drop table`).

## Fichier(s) impacté(s)

- `supabase/facturation_budget_lines.sql` (nouveau)

## Travail à réaliser

### 1. Table + RLS + trigger `updated_at`

```sql
-- ============================================================================
-- facturation_budget_lines — RÉFÉRENTIEL des imputations comptables (plan OKKO).
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable (idempotent,
-- purement ADDITIF : ne détruit jamais de données). Dépend de get_user_role() déjà déployée.
-- ============================================================================
create table if not exists public.facturation_budget_lines (
  code       text primary key,               -- ex. 'FMELECoooo' (casse / 'o' du scan conservés)
  label      text not null,
  category   text not null,
  hint       text not null default '',
  tags       text[] not null default '{}',
  sort_order int  not null default 0,          -- ordre d'affichage (ordre du plan analytique)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facturation_budget_lines enable row level security;
drop policy if exists "budget_lines read (authenticated)" on public.facturation_budget_lines;
create policy "budget_lines read (authenticated)" on public.facturation_budget_lines
  for select to authenticated using (true);
-- Pas de policy write : l'écriture passe UNIQUEMENT par les RPC SECURITY DEFINER (étape 2).

create or replace function public.facturation_budget_lines_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists facturation_budget_lines_touch on public.facturation_budget_lines;
create trigger facturation_budget_lines_touch before update on public.facturation_budget_lines
  for each row execute function public.facturation_budget_lines_touch();
```

### 2. Seed idempotent des ~55 lignes (reproduction exacte)

Générer le `insert` **depuis `constants.ts`** (source de vérité), avec `sort_order`
= index dans `BUDGET_LINES` (préserve l'ordre du plan pour le groupage du modal).
Ne rien réécrire si le code existe déjà (`on conflict do nothing`) → ré-exécutable
sans écraser d'éventuelles éditions faites via le CRUD.

```sql
insert into public.facturation_budget_lines (code, label, category, hint, tags, sort_order)
values
  ('FAABONoooo', 'Abonnements Administratifs', 'FRAIS ADMINISTRATIFS ET GENERAUX', 'umih, club hotelier', array['Administratif'], 0),
  -- … les ~55 lignes, dans l'ordre de BUDGET_LINES …
  ('FMELECoooo', 'Electricité', 'FRAIS EXPLOITATION / OPERATION', 'electricité', array['Énergie & fluides'], 20)
on conflict (code) do nothing;
```

Points d'attention (relevés par la reconnaissance) :
- **Apostrophes et accents** dans `label`/`hint` : doubler les `'` (`'d''actes'`),
  garder les accents tels quels (colonne `text`).
- **Codes proches à ne PAS fusionner** : `RAFBOUT` et `RAFBOUTooo` sont **deux codes
  distincts** ; libellés dupliqués sur des codes différents = normal (PK sur `code`).
- Le seed est un **artefact généré** : produire les 55 lignes exactes au moment de
  l'exécution, en lisant `BUDGET_LINES` (ne pas paraphraser).

## Ordre d'exécution

1. Écrire `supabase/facturation_budget_lines.sql` (table + RLS + trigger + seed complet).
2. **L'utilisateur** l'exécute dans le SQL Editor.
3. Contrôle post-exécution : `select count(*) from facturation_budget_lines;` doit
   égaler le nombre de lignes de `BUDGET_LINES`.

## Critère de validation

- La table existe, RLS activée, lecture OK pour un utilisateur authentifié.
- `count(*)` = nombre de lignes de `BUDGET_LINES` (aucune perdue, aucune en trop).
- Un `select` d'un code connu renvoie `label`/`category`/`hint`/`tags` identiques au
  front actuel.
- Ré-exécuter le fichier ne duplique rien et n'écrase rien (`on conflict do nothing`).

## Contrôle /borg

- **Reproduction exacte** : diff ligne à ligne seed ↔ `BUDGET_LINES` (55 codes, mêmes
  `label`/`category`/`hint`/`tags`, `RAFBOUT`≠`RAFBOUTooo`).
- **Additif only** : aucun `drop table` / `truncate` / `delete` ; ré-exécution sûre.
- **RLS** : lecture `authenticated` uniquement, **aucune** policy d'écriture (write =
  RPC seulement).
- **Échappement SQL** : apostrophes doublées, pas d'injection via les `hint` longs.
