-- =============================================================================
-- REMPLACÉ le 2026-09-05 par supabase/private_rpc_relais.sql
-- (+ supabase/facturation_garde_null_2026-09-05.sql) — NE PLUS REJOUER.
-- Rejouer ce fichier recréerait une fonction security definer dans public
-- (Security Advisor rouvert, doublon avec le relais) ou une garde périmée.
-- Conservé pour l'historique.
-- =============================================================================

-- ============================================================================
-- facturation_ref_comptes — RPC d'écriture (SECURITY DEFINER, garde de rôle).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_ref_comptes.sql. Ré-exécutable (create or replace). Écriture du
-- dictionnaire UNIQUEMENT via ces RPC (la table n'a pas de policy write). Dépend de
-- page_level_rank() / get_page_level() déjà déployées.
--
-- Trois fonctions :
--   * facturation_ref_comptes_upsert(compte, libelle)  : création / renommage unitaire.
--   * facturation_ref_comptes_delete(compte)           : suppression gardée (refus si le
--       compte est encore référencé par un couple de facturation_ref_imputations).
--   * facturation_ref_comptes_reimport(jsonb)          : upsert ADDITIF en masse.
-- ============================================================================

-- 1) Upsert unitaire (création + renommage) ----------------------------------
create or replace function public.facturation_ref_comptes_upsert(
  p_compte  text,
  p_libelle text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(trim(p_compte), '')) < 1
     or char_length(coalesce(trim(p_libelle), '')) < 1 then
    raise exception 'compte et libelle requis';
  end if;

  insert into public.facturation_ref_comptes (compte, libelle)
  values (trim(p_compte), trim(p_libelle))
  on conflict (compte) do update
    set libelle = excluded.libelle;
end;
$$;

-- 2) Suppression gardée (compte encore référencé par un couple) --------------
-- Un compte présent dans facturation_ref_imputations est encore utilisé par une imputation
-- -> refus (SQLSTATE 23503, foreign_key_violation). to_regclass protège si la table couple
-- n'était pas déployée.
create or replace function public.facturation_ref_comptes_delete(
  p_compte text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  if to_regclass('public.facturation_ref_imputations') is not null
     and exists (
       select 1 from public.facturation_ref_imputations where compte = p_compte
     ) then
    raise exception 'compte % encore utilise par une imputation', p_compte
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.facturation_ref_comptes where compte = p_compte;
end;
$$;

-- 3) Réimport ADDITIF en masse (upsert, jamais de suppression) ---------------
-- Format d'entrée : tableau JSON d'objets { compte, libelle }.
create or replace function public.facturation_ref_comptes_reimport(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows doit etre un tableau JSON';
  end if;

  insert into public.facturation_ref_comptes (compte, libelle)
  select trim(r->>'compte'), trim(r->>'libelle')
  from jsonb_array_elements(p_rows) as r
  where coalesce(trim(r->>'compte'), '') <> ''
    and coalesce(trim(r->>'libelle'), '') <> ''
  on conflict (compte) do update
    set libelle = excluded.libelle;

  get diagnostics n = row_count;
  return n;
end;
$$;
