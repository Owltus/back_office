-- =============================================================================
-- REMPLACÉ le 2026-09-05 par supabase/private_rpc_relais.sql
-- (+ supabase/facturation_garde_null_2026-09-05.sql) — NE PLUS REJOUER.
-- Rejouer ce fichier recréerait une fonction security definer dans public
-- (Security Advisor rouvert, doublon avec le relais) ou une garde périmée.
-- Conservé pour l'historique.
-- =============================================================================

-- ============================================================================
-- facturation_ref_imputations — RPC de réimport (SECURITY DEFINER, garde de rôle).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_ref_imputations.sql. Ré-exécutable (create or replace).
-- Écriture du référentiel UNIQUEMENT via ces RPC (la table n'a pas de policy write).
-- Dépend de page_level_rank() / get_page_level() déjà déployées.
--
-- Deux modes :
--   * facturation_ref_reimport(jsonb)         : upsert ADDITIF (n'efface jamais).
--   * facturation_ref_reimport_replace(jsonb) : upsert + SUPPRESSION des couples
--       absents du fichier. DESTRUCTIF -> bloqué sans jeton dans la MÊME session :
--         set facturation.confirm_reimport = 'OUI_REMPLACER';
--
-- Format d'entrée : tableau JSON d'objets
--   {code_analytique, compte, section, libelle, description, sort_order?}
-- ============================================================================

-- 1) Réimport ADDITIF (upsert, jamais de suppression) ------------------------
create or replace function public.facturation_ref_reimport(p_rows jsonb)
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

  insert into public.facturation_ref_imputations
    (code_analytique, compte, section, libelle, description, sort_order)
  select
    trim(r->>'code_analytique'),
    trim(r->>'compte'),
    coalesce(r->>'section', ''),
    coalesce(r->>'libelle', ''),
    coalesce(r->>'description', ''),
    coalesce((r->>'sort_order')::int, 0)
  from jsonb_array_elements(p_rows) as r
  where coalesce(trim(r->>'code_analytique'), '') <> ''
    and coalesce(trim(r->>'compte'), '') <> ''
  on conflict (code_analytique, compte) do update
    set section    = excluded.section,
        libelle    = excluded.libelle,
        description = excluded.description,
        sort_order = excluded.sort_order;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- 2) Réimport REMPLAÇANT (upsert + suppression des couples absents) ----------
-- DESTRUCTIF : gardé par un jeton de confirmation posé dans la MÊME session :
--   set facturation.confirm_reimport = 'OUI_REMPLACER';
create or replace function public.facturation_ref_reimport_replace(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if current_setting('facturation.confirm_reimport', true) is distinct from 'OUI_REMPLACER' then
    raise exception
      'Reimport REMPLACANT bloque (destructif). Pour confirmer, execute d''abord dans CETTE session : set facturation.confirm_reimport = ''OUI_REMPLACER'';';
  end if;

  -- Upsert d'abord (réutilise la garde + l'insert additif ci-dessus).
  perform public.facturation_ref_reimport(p_rows);

  -- Puis suppression des couples ABSENTS du fichier fourni.
  delete from public.facturation_ref_imputations t
  where not exists (
    select 1 from jsonb_array_elements(p_rows) as r
    where trim(r->>'code_analytique') = t.code_analytique
      and trim(r->>'compte') = t.compte
  );
  get diagnostics removed = row_count;

  -- Consommer le jeton : un second remplacement redemandera confirmation.
  perform set_config('facturation.confirm_reimport', '', false);
  return removed;
end;
$$;
