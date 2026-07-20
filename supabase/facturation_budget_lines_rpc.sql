-- ============================================================================
-- facturation_budget_lines — RPC CRUD (SECURITY DEFINER, garde de rôle).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_budget_lines.sql (la table doit exister). Ré-exécutable
-- (create or replace). Dépend de get_user_role() déjà déployée.
--
-- Écritures du référentiel UNIQUEMENT via ces RPC (la table n'a pas de policy write).
-- Le `code` est IMMUABLE : l'upsert met à jour par code, ne le renomme jamais (le code
-- est référencé comme chaîne dans facturation_wordpool / issuer_codes / issuer_denylist /
-- learned_docs — le renommer casserait ces références silencieusement).
-- ============================================================================

-- 1) Upsert (création + édition ; code immuable) -----------------------------
create or replace function public.facturation_budget_line_upsert(
  p_code     text,
  p_label    text,
  p_category text,
  p_hint     text,
  p_tags     text[],
  p_sort     int default null,
  p_create   boolean default false  -- true = CRÉATION : refuse d'écraser un code existant
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_code, '')) < 3 or char_length(coalesce(p_label, '')) < 1 then
    raise exception 'code (>= 3) et label requis';
  end if;
  -- Garde d'unicité SERVEUR à la création : ferme la fenêtre de cache périmé côté client
  -- (sinon un « Ajouter » sur un code déjà en base écraserait la ligne via le do update).
  if p_create and exists (
    select 1 from public.facturation_budget_lines where code = p_code
  ) then
    raise exception 'imputation % existe deja', p_code using errcode = 'unique_violation';
  end if;

  insert into public.facturation_budget_lines (code, label, category, hint, tags, sort_order)
  values (
    p_code,
    p_label,
    coalesce(p_category, ''),
    coalesce(p_hint, ''),
    coalesce(p_tags, '{}'),
    coalesce(p_sort, 0)
  )
  on conflict (code) do update
    set label      = excluded.label,
        category   = excluded.category,
        hint       = excluded.hint,
        tags       = excluded.tags,
        sort_order = coalesce(p_sort, facturation_budget_lines.sort_order);
end;
$$;

-- 2) Delete avec garde « déjà utilisée » -------------------------------------
-- Refuse la suppression si le code est référencé dans l'une des 4 tables apprises.
-- Chaque test est protégé par to_regclass (tables dépendantes éventuellement non déployées).
-- learned_docs.codes est un text[] → test `p_code = any(codes)`.
create or replace function public.facturation_budget_line_delete(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
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
    -- SQLSTATE 23503 (foreign_key_violation) → détectable côté front pour un message clair.
    raise exception 'imputation % deja utilisee', p_code
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.facturation_budget_lines where code = p_code;
end;
$$;

-- ============================================================================
-- 3) AUDIT DES ORPHELINS (lecture seule) — à lancer AVANT d'envisager toute FK dure.
-- Liste les codes présents dans les données APPRISES mais ABSENTS du référentiel.
-- Si le résultat est NON VIDE : ne PAS poser de clés étrangères (elles échoueraient) ;
-- s'appuyer sur la garde applicative ci-dessus. Décommenter pour exécuter.
-- ----------------------------------------------------------------------------
-- select distinct code as code_orphelin, 'wordpool' as source
--   from public.facturation_wordpool
--   where code not in (select code from public.facturation_budget_lines)
-- union
-- select distinct code, 'issuer_codes'
--   from public.facturation_issuer_codes
--   where code not in (select code from public.facturation_budget_lines)
-- union
-- select distinct code, 'issuer_denylist'
--   from public.facturation_issuer_denylist
--   where code not in (select code from public.facturation_budget_lines)
-- union
-- select distinct c, 'learned_docs'
--   from public.facturation_learned_docs, unnest(codes) as c
--   where c not in (select code from public.facturation_budget_lines)
-- order by source, code_orphelin;
-- ============================================================================
