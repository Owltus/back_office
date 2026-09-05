-- =============================================================================
-- facturation_garde_null_2026-09-05 — garde des 28 RPC facturation : NULL refusé
--
-- Application : `supabase db query --linked -f supabase/facturation_garde_null_2026-09-05.sql`
-- EN UNE FOIS. Idempotent (`create or replace`). Fichier GÉNÉRÉ depuis le
-- catalogue de prod (schéma private) : seule la condition de garde change.
--
-- FAILLE PRÉEXISTANTE (découverte le 2026-09-05 par la preuve par rôle du
-- plan security-advisor-zero) : les 28 RPC facturation gardaient par
--     if private.get_page_level('facturation') <> 'gestion' then raise …
-- Pour un compte SANS AUCUN droit sur la page facturation, get_page_level
-- renvoie NULL ; `NULL <> 'gestion'` vaut NULL, donc `if` ne lève rien :
-- n'importe quel compte connecté sans droit facturation pouvait écrire les
-- tables facturation_* via ces RPC (un compte avec 'lecture' était, lui,
-- refusé). Reproduit en transaction annulée avec un compte à 7 pages hors
-- facturation : facturation_wordpool_learn acceptée.
--
-- CORRECTIF : `is distinct from 'gestion'` (vrai pour NULL). Rien d'autre ne
-- change (mêmes corps, mêmes privilèges). Les policies, elles, utilisent
-- `= 'gestion'` ou `page_level_rank(...) >= n` (rang(NULL) = 0) : saines.
-- =============================================================================

-- private.facturation_budget_line_delete(text)
CREATE OR REPLACE FUNCTION private.facturation_budget_line_delete(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_budget_line_upsert(text,text,text,text,text[],integer,boolean)
CREATE OR REPLACE FUNCTION private.facturation_budget_line_upsert(p_code text, p_label text, p_category text, p_hint text, p_tags text[], p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_issuer_codes_forget(text,text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_forget(p_issuer text, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  if to_regclass('public.facturation_issuer_codes') is not null then
    delete from public.facturation_issuer_codes
     where issuer = p_issuer and code = p_code;
  end if;
end;
$function$
;

-- private.facturation_issuer_codes_forget(text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_forget(p_issuer text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_codes where issuer = p_issuer;
end;
$function$
;

-- private.facturation_issuer_codes_learn(text,text[])
CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_learn(p_issuer text, p_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_issuer, '')) < 4 then
    return; -- même garde anti faux-positifs que facturation_issuer_learn
  end if;

  insert into public.facturation_issuer_codes (issuer, code, count)
  select p_issuer, c.code, 1
  from unnest(p_codes) as c(code)
  on conflict (issuer, code)
  do update set count = facturation_issuer_codes.count + 1,
                updated_at = now();
end;
$function$
;

-- private.facturation_issuer_codes_unlearn(text,text[])
CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_unlearn(p_issuer text, p_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuer_codes w
     set count = greatest(0, w.count - 1),
         updated_at = now()
  from unnest(p_codes) as c(code)
  where w.issuer = p_issuer and w.code = c.code;

  delete from public.facturation_issuer_codes where count <= 0;
end;
$function$
;

-- private.facturation_issuer_delete(text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_delete(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuers where name = p_name;

  -- Oublier aussi la co-occurrence émetteur→codes (si la table est déployée).
  if to_regclass('public.facturation_issuer_codes') is not null then
    delete from public.facturation_issuer_codes where issuer = p_name;
  end if;

  -- Oublier aussi la denylist émetteur↔code (si la table est déployée).
  if to_regclass('public.facturation_issuer_denylist') is not null then
    delete from public.facturation_issuer_denylist where issuer = p_name;
  end if;
end;
$function$
;

-- private.facturation_issuer_denylist_add(text,text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_denylist_add(p_issuer text, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_issuer, '')) < 4 then
    return; -- garde homogène anti faux-positifs
  end if;

  insert into public.facturation_issuer_denylist (issuer, code)
  values (p_issuer, p_code)
  on conflict (issuer, code) do nothing;
end;
$function$
;

-- private.facturation_issuer_denylist_remove(text,text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_denylist_remove(p_issuer text, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_denylist
   where issuer = p_issuer and code = p_code;
end;
$function$
;

-- private.facturation_issuer_learn(text,text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_learn(p_name text, p_display text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_name, '')) < 4 then
    return; -- garde anti faux-positifs (noms trop courts)
  end if;

  insert into public.facturation_issuers (name, display, count)
  values (p_name, p_display, 1)
  on conflict (name)
  do update set count = facturation_issuers.count + 1,
                display = excluded.display,
                updated_at = now();
end;
$function$
;

-- private.facturation_issuer_merge(text,text,text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_merge(p_from_name text, p_to_name text, p_display text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers t
     set count   = t.count + coalesce(f.count, 0),
         display = coalesce(p_display, t.display),
         updated_at = now()
  from public.facturation_issuers f
  where t.name = p_to_name and f.name = p_from_name;

  delete from public.facturation_issuers where name = p_from_name;

  -- Propager la co-occurrence émetteur→codes (si la table est déployée).
  if to_regclass('public.facturation_issuer_codes') is not null then
    insert into public.facturation_issuer_codes (issuer, code, count)
    select p_to_name, code, count
    from public.facturation_issuer_codes where issuer = p_from_name
    on conflict (issuer, code)
    do update set count = facturation_issuer_codes.count + excluded.count,
                  updated_at = now();
    delete from public.facturation_issuer_codes where issuer = p_from_name;
  end if;

  -- Propager la denylist émetteur↔code (si la table est déployée).
  if to_regclass('public.facturation_issuer_denylist') is not null then
    insert into public.facturation_issuer_denylist (issuer, code)
    select p_to_name, code
    from public.facturation_issuer_denylist where issuer = p_from_name
    on conflict (issuer, code) do nothing;
    delete from public.facturation_issuer_denylist where issuer = p_from_name;
  end if;
end;
$function$
;

-- private.facturation_issuer_rename(text,text,text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_rename(p_old_name text, p_new_name text, p_display text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  insert into public.facturation_issuers (name, display, count)
  select p_new_name, p_display, coalesce(count, 0)
  from public.facturation_issuers where name = p_old_name
  on conflict (name)
  do update set count   = facturation_issuers.count + excluded.count,
                display = excluded.display,
                updated_at = now();

  delete from public.facturation_issuers where name = p_old_name;

  -- Propager la co-occurrence émetteur→codes (si la table est déployée).
  if to_regclass('public.facturation_issuer_codes') is not null then
    insert into public.facturation_issuer_codes (issuer, code, count)
    select p_new_name, code, count
    from public.facturation_issuer_codes where issuer = p_old_name
    on conflict (issuer, code)
    do update set count = facturation_issuer_codes.count + excluded.count,
                  updated_at = now();
    delete from public.facturation_issuer_codes where issuer = p_old_name;
  end if;

  -- Propager la denylist émetteur↔code (si la table est déployée).
  if to_regclass('public.facturation_issuer_denylist') is not null then
    insert into public.facturation_issuer_denylist (issuer, code)
    select p_new_name, code
    from public.facturation_issuer_denylist where issuer = p_old_name
    on conflict (issuer, code) do nothing;
    delete from public.facturation_issuer_denylist where issuer = p_old_name;
  end if;
end;
$function$
;

-- private.facturation_issuer_unlearn(text)
CREATE OR REPLACE FUNCTION private.facturation_issuer_unlearn(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers
     set count = count - 1, updated_at = now()
   where name = p_name;

  delete from public.facturation_issuers where name = p_name and count <= 0;
end;
$function$
;

-- private.facturation_learn_document(text,text,text,text[],jsonb,jsonb,text)
CREATE OR REPLACE FUNCTION private.facturation_learn_document(p_hash text, p_issuer text, p_display text, p_codes text[], p_deltas jsonb, p_comptes jsonb, p_method text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_hash, '')) < 16 then
    return false;                       -- hash invalide : rien appris
  end if;

  -- Journal en PREMIER : c'est lui qui décide de l'idempotence.
  insert into public.facturation_learned_docs (hash, issuer, codes, deltas, method, comptes)
  values (
    p_hash,
    nullif(p_issuer, ''),
    coalesce(p_codes, '{}'),
    coalesce(p_deltas, '{}'::jsonb),
    coalesce(nullif(p_method, ''), 'native'),
    coalesce(p_comptes, '{}'::jsonb)
  )
  on conflict (hash) do nothing;

  if not found then
    return false;                       -- déjà appris → AUCUN incrément (idempotent)
  end if;

  -- Incréments UNE seule fois, dans la même transaction, via les RPC existantes
  -- (mêmes corps que ceux que `forget` inverse → symétrie garantie).
  perform private.facturation_wordpool_learn(
    coalesce(p_codes, '{}'), coalesce(p_deltas, '{}'::jsonb)
  );
  if nullif(p_issuer, '') is not null then
    perform private.facturation_issuer_codes_learn(nullif(p_issuer, ''), coalesce(p_codes, '{}'));
    perform private.facturation_issuer_learn(nullif(p_issuer, ''), nullif(p_display, ''));
  end if;

  return true;                          -- nouvellement appris
end;
$function$
;

-- private.facturation_learned_docs_delete(text)
CREATE OR REPLACE FUNCTION private.facturation_learned_docs_delete(p_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_learned_docs where hash = p_hash;
end;
$function$
;

-- private.facturation_learned_docs_forget(text)
CREATE OR REPLACE FUNCTION private.facturation_learned_docs_forget(p_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d record;
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  -- `for update` : verrouille la ligne-journal. Deux appels CONCURRENTS (double-clic) ne
  -- peuvent pas rejouer la soustraction deux fois — le 2e attend, retrouve la ligne supprimée
  -- (not found) et sort sans re-décrémenter des compteurs partagés.
  select hash, issuer, codes, deltas into d
  from public.facturation_learned_docs where hash = p_hash
  for update;
  if not found then
    return;
  end if;

  -- 1. Nuages de mots : rejeu des deltas en soustraction (miroir de _wordpool_unlearn).
  if to_regclass('public.facturation_wordpool') is not null then
    update public.facturation_wordpool w
       set count = greatest(0, w.count - kv.value::int),
           updated_at = now()
    from unnest(d.codes) as c(code),
         jsonb_each_text(d.deltas) as kv(key, value)
    where w.code = c.code and w.token = kv.key;
    delete from public.facturation_wordpool where count <= 0;
  end if;

  -- 2. Co-occurrence émetteur→codes : -1 par code (miroir de _issuer_codes_unlearn).
  if d.issuer is not null and to_regclass('public.facturation_issuer_codes') is not null then
    update public.facturation_issuer_codes ic
       set count = greatest(0, ic.count - 1),
           updated_at = now()
    from unnest(d.codes) as c(code)
    where ic.issuer = d.issuer and ic.code = c.code;
    delete from public.facturation_issuer_codes where count <= 0;
  end if;

  -- 3. Dictionnaire émetteur : -1 (miroir de _issuer_unlearn).
  if d.issuer is not null and to_regclass('public.facturation_issuers') is not null then
    update public.facturation_issuers set count = greatest(0, count - 1), updated_at = now()
     where name = d.issuer;
    delete from public.facturation_issuers where name = d.issuer and count <= 0;
  end if;

  -- 4. Retirer l'entrée du journal.
  delete from public.facturation_learned_docs where hash = p_hash;
end;
$function$
;

-- private.facturation_learned_docs_record(text,text,text[],jsonb,text,jsonb)
CREATE OR REPLACE FUNCTION private.facturation_learned_docs_record(p_hash text, p_issuer text, p_codes text[], p_deltas jsonb, p_method text, p_comptes jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_hash, '')) < 16 then
    return; -- garde : un hash SHA-256 fait 64 hex ; en deçà, entrée ignorée
  end if;

  insert into public.facturation_learned_docs (hash, issuer, codes, deltas, method, comptes)
  values (
    p_hash,
    nullif(p_issuer, ''),
    coalesce(p_codes, '{}'),
    coalesce(p_deltas, '{}'::jsonb),
    coalesce(nullif(p_method, ''), 'native'),
    coalesce(p_comptes, '{}'::jsonb)
  )
  on conflict (hash) do nothing; -- doublon : on garde le premier, jamais de double journal
end;
$function$
;

-- private.facturation_ref_comptes_delete(text)
CREATE OR REPLACE FUNCTION private.facturation_ref_comptes_delete(p_compte text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_ref_comptes_reimport(jsonb)
CREATE OR REPLACE FUNCTION private.facturation_ref_comptes_reimport(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_ref_comptes_upsert(text,text)
CREATE OR REPLACE FUNCTION private.facturation_ref_comptes_upsert(p_compte text, p_libelle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_ref_delete(text,text)
CREATE OR REPLACE FUNCTION private.facturation_ref_delete(p_code text, p_compte text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  remaining int;
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_ref_reimport_replace(jsonb)
CREATE OR REPLACE FUNCTION private.facturation_ref_reimport_replace(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  removed int;
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;
  if current_setting('facturation.confirm_reimport', true) is distinct from 'OUI_REMPLACER' then
    raise exception
      'Reimport REMPLACANT bloque (destructif). Pour confirmer, execute d''abord dans CETTE session : set facturation.confirm_reimport = ''OUI_REMPLACER'';';
  end if;

  -- Upsert d'abord (réutilise la garde + l'insert additif ci-dessus).
  perform private.facturation_ref_reimport(p_rows);

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
$function$
;

-- private.facturation_ref_reimport(jsonb)
CREATE OR REPLACE FUNCTION private.facturation_ref_reimport(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_ref_upsert(text,text,text,text,text,integer,boolean)
CREATE OR REPLACE FUNCTION private.facturation_ref_upsert(p_code text, p_compte text, p_section text, p_libelle text, p_description text, p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
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
$function$
;

-- private.facturation_wordpool_forget_code(text)
CREATE OR REPLACE FUNCTION private.facturation_wordpool_forget_code(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where code = p_code;
end;
$function$
;

-- private.facturation_wordpool_learn(text[],jsonb)
CREATE OR REPLACE FUNCTION private.facturation_wordpool_learn(p_codes text[], p_deltas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  insert into public.facturation_wordpool (code, token, count)
  select c.code, d.key, d.value::int
  from unnest(p_codes) as c(code),
       jsonb_each_text(p_deltas) as d(key, value)
  on conflict (code, token)
  do update set count = facturation_wordpool.count + excluded.count,
                updated_at = now();
end;
$function$
;

-- private.facturation_wordpool_prune(integer,integer)
CREATE OR REPLACE FUNCTION private.facturation_wordpool_prune(p_min_count integer DEFAULT 2, p_top_k integer DEFAULT 300)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where count < p_min_count;

  delete from public.facturation_wordpool w
  using (
    select code, token,
           row_number() over (partition by code order by count desc) as rn
    from public.facturation_wordpool
  ) r
  where w.code = r.code and w.token = r.token and r.rn > p_top_k;
end;
$function$
;

-- private.facturation_wordpool_unlearn(text[],jsonb)
CREATE OR REPLACE FUNCTION private.facturation_wordpool_unlearn(p_codes text[], p_deltas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_wordpool w
     set count = greatest(0, w.count - d.value::int),
         updated_at = now()
  from unnest(p_codes) as c(code),
       jsonb_each_text(p_deltas) as d(key, value)
  where w.code = c.code and w.token = d.key;

  delete from public.facturation_wordpool where count <= 0;
end;
$function$
;

-- VÉRIFICATION (lecture seule) — attendu 0 garde « <> » restante, 28 « is distinct from ».
select 'gardes <> restantes' as controle, count(*)::text as valeur
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') and p.prokind = 'f'
  and (case when p.prokind = 'f' then pg_get_functiondef(p.oid) end) ~ 'get_page_level\([^)]*\)\s*<>'
union all
select 'gardes is distinct from', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.prokind = 'f'
  and (case when p.prokind = 'f' then pg_get_functiondef(p.oid) end) ~ 'get_page_level\(''facturation''\) is distinct from ''gestion''';
