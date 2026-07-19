# Étape 2 — RPC `upsert`/`delete` + garde « déjà utilisée » + audit orphelins

## Objectif

Fournir les écritures du référentiel **uniquement** via des RPC `SECURITY DEFINER`
gardées par rôle (pattern facturation), et **interdire la suppression** d'une
imputation référencée ailleurs. Fournir aussi une requête d'**audit des codes
orphelins** (lecture seule) à lancer avant d'envisager toute FK (D2).

## Contexte

Le `code` est référencé dans 4 tables : `facturation_wordpool(code)`,
`facturation_issuer_codes(code)`, `facturation_issuer_denylist(code)` et
`facturation_learned_docs.codes` (**`text[]`**). La garde « déjà utilisée » est le
**seul** endroit fiable pour bloquer un DELETE (une policy RLS ne le peut pas). D5 :
le `code` est **immuable** → l'`upsert` met à jour par `code`, ne le renomme jamais.

## Fichier(s) impacté(s)

- `supabase/facturation_budget_lines_rpc.sql` (nouveau)

## Travail à réaliser

### 1. RPC `upsert` (création + édition, code immuable)

```sql
create or replace function public.facturation_budget_line_upsert(
  p_code text, p_label text, p_category text, p_hint text, p_tags text[], p_sort int default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_code, '')) < 3 or char_length(coalesce(p_label, '')) < 1 then
    raise exception 'code/label requis';
  end if;

  insert into public.facturation_budget_lines (code, label, category, hint, tags, sort_order)
  values (p_code, p_label, coalesce(p_category, ''), coalesce(p_hint, ''),
          coalesce(p_tags, '{}'), coalesce(p_sort, 0))
  on conflict (code) do update
    set label = excluded.label, category = excluded.category,
        hint = excluded.hint, tags = excluded.tags,
        sort_order = coalesce(p_sort, facturation_budget_lines.sort_order);
end; $$;
```

### 2. RPC `delete` avec garde « déjà utilisée »

Chaque test protégé par `to_regclass` (tables dépendantes potentiellement non
déployées, pattern maison). `learned_docs` → test **`p_code = any(codes)`** (colonne
tableau).

```sql
create or replace function public.facturation_budget_line_delete(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  if (to_regclass('public.facturation_wordpool') is not null
        and exists (select 1 from public.facturation_wordpool where code = p_code))
   or (to_regclass('public.facturation_issuer_codes') is not null
        and exists (select 1 from public.facturation_issuer_codes where code = p_code))
   or (to_regclass('public.facturation_issuer_denylist') is not null
        and exists (select 1 from public.facturation_issuer_denylist where code = p_code))
   or (to_regclass('public.facturation_learned_docs') is not null
        and exists (select 1 from public.facturation_learned_docs where p_code = any(codes)))
  then
    raise exception 'imputation % deja utilisee', p_code
      using errcode = 'foreign_key_violation';  -- code SQLSTATE 23503 → détectable côté front
  end if;

  delete from public.facturation_budget_lines where code = p_code;
end; $$;
```

Note : lever avec `errcode = 'foreign_key_violation'` (ou un message stable) permet
au front de distinguer « refus car utilisée » d'une vraie erreur, pour un feedback
clair. Le front bloquera **aussi en amont** (bouton désactivé, étape 5) — la RPC est
le **garde-fou serveur** de dernier recours.

### 3. Audit des orphelins (lecture seule, à lancer AVANT toute FK — D2)

```sql
-- Codes présents dans les données apprises mais ABSENTS du référentiel.
select distinct code from public.facturation_wordpool        where code not in (select code from public.facturation_budget_lines)
union select distinct code from public.facturation_issuer_codes   where code not in (select code from public.facturation_budget_lines)
union select distinct code from public.facturation_issuer_denylist where code not in (select code from public.facturation_budget_lines)
union select distinct unnest(codes) from public.facturation_learned_docs;
-- Si non vide : NE PAS poser de FK dures (elles échoueraient). S'appuyer sur la garde RPC.
```

## Ordre d'exécution

1. Écrire `supabase/facturation_budget_lines_rpc.sql` (les 2 RPC + le bloc d'audit en commentaire).
2. **L'utilisateur** l'exécute (après l'étape 1).
3. **L'utilisateur** lance la requête d'audit et rapporte le résultat (tranche D2 :
   garde applicative seule vs FK `NOT VALID` complémentaires).

## Critère de validation

- `upsert` crée puis met à jour une ligne (le `code` ne change jamais).
- `delete` sur un code **non utilisé** supprime ; sur un code **utilisé** lève une
  exception explicite (aucune suppression).
- Un `authenticated` sans rôle suffisant est refusé (`not authorized`).
- La requête d'audit tourne et liste les orphelins éventuels.

## Contrôle /borg

- **Garde de rôle** présente en 1re instruction des 2 RPC ; `security definer` +
  `set search_path = public`.
- **Garde « déjà utilisée »** couvre les **4** tables, dont `learned_docs.codes`
  (`= any(codes)`), chacune protégée par `to_regclass`.
- **Aucune FK dure posée** tant que l'audit n'a pas confirmé zéro orphelin (sinon
  risque de casse en prod).
- **Idempotence** : `create or replace function` ; ré-exécution sûre.
- **Immutabilité du code** : l'`upsert` ne renomme jamais la PK (pas de propagation
  cassante dans les 5 références).
