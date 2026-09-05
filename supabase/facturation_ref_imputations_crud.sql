-- =============================================================================
-- REMPLACÉ le 2026-09-05 par supabase/private_rpc_relais.sql
-- (+ supabase/facturation_garde_null_2026-09-05.sql) — NE PLUS REJOUER.
-- Rejouer ce fichier recréerait une fonction security definer dans public
-- (Security Advisor rouvert, doublon avec le relais) ou une garde périmée.
-- Conservé pour l'historique.
-- =============================================================================

-- ============================================================================
-- facturation_ref_imputations — RPC CRUD unitaire au COUPLE (code + compte).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_ref_imputations.sql (la table doit exister). Ré-exécutable
-- (create or replace). Dépend de page_level_rank() / get_page_level() déjà déployées.
--
-- Complète le réimport EN MASSE (facturation_ref_imputations_rpc.sql) par l'édition
-- POINT PAR POINT depuis le gestionnaire « Gérer les imputations ». Une imputation =
-- un COUPLE (code_analytique, compte) : c'est la granularité de création/suppression.
-- section / libelle / description sont portés PAR COUPLE (aucune propagation implicite
-- aux autres comptes du même code — le réimport reste le canal d'édition en masse).
--
-- Écriture du référentiel UNIQUEMENT via RPC (la table n'a pas de policy write).
-- ============================================================================

-- 1) Upsert d'un couple (création + édition) ---------------------------------
-- p_create=true → CRÉATION : refuse d'écraser un couple déjà en base (unicité
-- SERVEUR, SQLSTATE 23505) ; ferme la fenêtre de cache périmé côté client.
create or replace function public.facturation_ref_upsert(
  p_code        text,
  p_compte      text,
  p_section     text,
  p_libelle     text,
  p_description text,
  p_sort        int default null,
  p_create      boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(trim(p_code), '')) < 3
     or char_length(coalesce(trim(p_compte), '')) < 1
     or char_length(coalesce(p_libelle, '')) < 1 then
    raise exception 'code (>= 3), compte et libelle requis';
  end if;
  if p_create and exists (
    select 1 from public.facturation_ref_imputations
    where code_analytique = trim(p_code) and compte = trim(p_compte)
  ) then
    raise exception 'imputation %/% existe deja', trim(p_code), trim(p_compte)
      using errcode = 'unique_violation';
  end if;

  insert into public.facturation_ref_imputations
    (code_analytique, compte, section, libelle, description, sort_order)
  values (
    trim(p_code),
    trim(p_compte),
    coalesce(p_section, ''),
    coalesce(p_libelle, ''),
    coalesce(p_description, ''),
    coalesce(p_sort, 0)
  )
  on conflict (code_analytique, compte) do update
    set section     = excluded.section,
        libelle     = excluded.libelle,
        description = excluded.description,
        sort_order  = coalesce(p_sort, facturation_ref_imputations.sort_order);
end;
$$;

-- 2) Suppression d'un couple avec garde « code encore utilisé » --------------
-- Retirer UN compte d'un code multi-comptes est toujours permis (le code subsiste).
-- En revanche, supprimer le DERNIER couple d'un code encore référencé dans les
-- données apprises effacerait son libellé alors qu'il sert toujours → refus
-- (SQLSTATE 23503, foreign_key_violation), comme l'ancienne garde par code. Chaque
-- test est protégé par to_regclass (tables dépendantes éventuellement non déployées).
create or replace function public.facturation_ref_delete(
  p_code   text,
  p_compte text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  -- Combien d'AUTRES comptes ce code garderait-il après suppression de ce couple ?
  select count(*) into remaining
  from public.facturation_ref_imputations
  where code_analytique = p_code and compte <> p_compte;

  -- Dernier couple du code + code encore utilisé → refus (perte d'un libellé actif).
  if remaining = 0 and (
       (to_regclass('public.facturation_wordpool') is not null
          and exists (select 1 from public.facturation_wordpool where code = p_code))
    or (to_regclass('public.facturation_issuer_codes') is not null
          and exists (select 1 from public.facturation_issuer_codes where code = p_code))
    or (to_regclass('public.facturation_issuer_denylist') is not null
          and exists (select 1 from public.facturation_issuer_denylist where code = p_code))
    or (to_regclass('public.facturation_learned_docs') is not null
          and exists (select 1 from public.facturation_learned_docs where p_code = any(codes)))
  ) then
    raise exception 'imputation % deja utilisee', p_code
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.facturation_ref_imputations
  where code_analytique = p_code and compte = p_compte;
end;
$$;
