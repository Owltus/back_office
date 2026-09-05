-- =============================================================================
-- private_schema_aides — schéma privé + fonctions d'aide des règles de sécurité
--
-- Application : `supabase db query --linked -f supabase/private_schema_aides.sql`
-- EN UNE FOIS (une transaction). Fichier GÉNÉRÉ depuis le catalogue de prod
-- (pg_get_functiondef, 2026-09-05) puis relu. Rejouable : `create schema if
-- not exists`, `alter … set schema` échoue proprement si déjà fait (voir la
-- note de rejeu en fin de fichier).
--
-- INNOCUITÉ : aucune table, aucune donnée, aucune policy supprimée ou recréée
-- (les policies référencent les fonctions par OID : `alter function … set
-- schema` les laisse intactes et fonctionnelles). Les 39 fonctions de public
-- régénérées le sont À L'IDENTIQUE (mêmes attributs security definer /
-- volatilité / search_path), seuls les appels `public.<aide>(` deviennent
-- `private.<aide>(`.
--
-- POURQUOI (plan security-advisor-zero-2026-09-05, étape 1) : les fonctions
-- qui DÉCIDENT des droits (get_page_level, is_admin, get_user_role,
-- page_level_rank, repjour_manual_forecast_allowed) ne sont appelées par
-- aucun code applicatif, seulement par 91 policies, 2 triggers et 39
-- fonctions. Elles doivent rester `security definer` (récursion RLS sinon).
-- La bonne pratique Supabase pour ce cas : un schéma NON exposé à PostgREST.
-- Elles quittent l'API, et le lint 0029 cesse de les signaler.
--
-- PRÉREQUIS dashboard : `private` ne doit JAMAIS figurer dans Settings → API
-- → Exposed schemas.
-- =============================================================================

-- (1) Schéma privé : usage réservé aux rôles applicatifs connectés et au
--     service ; jamais anon ni PUBLIC ; aucun privilège par défaut.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- (2) Déplacement des cinq aides (OID conservé : policies et dépendances intactes).
alter function public.get_page_level(text) set schema private;
alter function public.get_user_role() set schema private;
alter function public.is_admin() set schema private;
alter function public.page_level_rank(text) set schema private;
alter function public.repjour_manual_forecast_allowed(integer,integer) set schema private;

-- (3) Corps des aides régénérés dans private (références internes en private.).
CREATE OR REPLACE FUNCTION private.get_page_level(p_page text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when private.is_admin() then 'gestion'
    else (select level from public.user_page_permissions
          where user_id = auth.uid() and page = p_page)
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$function$
;

CREATE OR REPLACE FUNCTION private.page_level_rank(p_level text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_level
    when 'lecture' then 1
    when 'ecriture' then 2
    when 'gestion' then 3
    else 0
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.repjour_manual_forecast_allowed(p_year integer, p_month integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with paris as (
    select (now() at time zone 'Europe/Paris') as ts
  ), cycle as (
    select ts, ((ts - interval '2 hours')::date - 1) as import_day from paris
  )
  select (extract(hour from ts) < 2 or extract(hour from ts) >= 3)
     and p_year  = extract(year  from import_day)::int
     and p_month = extract(month from import_day)::int
     and not exists (
       select 1 from public.daily_reports d
       where d.date = cycle.import_day and d.auto_sent_at is not null
     )
  from cycle;
$function$
;

alter function private.page_level_rank(text) set search_path = public;
revoke execute on function private.get_page_level(text) from public, anon;
grant execute on function private.get_page_level(text) to authenticated;
revoke execute on function private.get_user_role() from public, anon;
grant execute on function private.get_user_role() to authenticated;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
revoke execute on function private.page_level_rank(text) from public, anon;
grant execute on function private.page_level_rank(text) to authenticated;
revoke execute on function private.repjour_manual_forecast_allowed(integer,integer) from public, anon;
grant execute on function private.repjour_manual_forecast_allowed(integer,integer) to authenticated;

-- (4) 39 fonctions et triggers de public dont le CORPS référence une aide :
--     régénérés à l'identique avec les appels en private.<aide>( (search_path figé oblige).
-- daily_reports_occ(date)
CREATE OR REPLACE FUNCTION public.daily_reports_occ(p_date date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select rj_nuitees
  from public.daily_reports
  where date = p_date
    and (select private.page_level_rank(private.get_page_level('rapro'))) >= 1
  limit 1;
$function$
;

-- dismiss_send_reminder(date)
CREATE OR REPLACE FUNCTION public.dismiss_send_reminder(p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Garde : niveau >= ecriture (rang 2) sur la page repjour. get_page_level renvoie
  -- 'gestion' pour les admins → éditeur + gestionnaire + admin passent ; les comptes
  -- sans la page (niveau NULL → rang 0) sont refusés.
  if private.page_level_rank(private.get_page_level('repjour')) < 2 then
    raise exception 'Acces refuse : niveau ecriture requis sur la page repjour.'
      using errcode = '42501';
  end if;

  -- Idempotent : ne masque que le rapport encore NON envoyé et NON déjà masqué.
  update public.daily_reports
     set send_reminder_dismissed_at = now()
   where date = p_date
     and auto_sent_at is null
     and send_reminder_dismissed_at is null;
end;
$function$
;

-- facturation_budget_line_delete(text)
CREATE OR REPLACE FUNCTION public.facturation_budget_line_delete(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_budget_line_upsert(text,text,text,text,text[],integer,boolean)
CREATE OR REPLACE FUNCTION public.facturation_budget_line_upsert(p_code text, p_label text, p_category text, p_hint text, p_tags text[], p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_codes_forget(text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_codes_forget(p_issuer text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_codes where issuer = p_issuer;
end;
$function$
;

-- facturation_issuer_codes_forget(text,text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_codes_forget(p_issuer text, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  if to_regclass('public.facturation_issuer_codes') is not null then
    delete from public.facturation_issuer_codes
     where issuer = p_issuer and code = p_code;
  end if;
end;
$function$
;

-- facturation_issuer_codes_learn(text,text[])
CREATE OR REPLACE FUNCTION public.facturation_issuer_codes_learn(p_issuer text, p_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_codes_unlearn(text,text[])
CREATE OR REPLACE FUNCTION public.facturation_issuer_codes_unlearn(p_issuer text, p_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_delete(text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_delete(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_denylist_add(text,text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_denylist_add(p_issuer text, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_denylist_remove(text,text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_denylist_remove(p_issuer text, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_denylist
   where issuer = p_issuer and code = p_code;
end;
$function$
;

-- facturation_issuer_learn(text,text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_learn(p_name text, p_display text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_merge(text,text,text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_merge(p_from_name text, p_to_name text, p_display text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_rename(text,text,text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_rename(p_old_name text, p_new_name text, p_display text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_issuer_unlearn(text)
CREATE OR REPLACE FUNCTION public.facturation_issuer_unlearn(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers
     set count = count - 1, updated_at = now()
   where name = p_name;

  delete from public.facturation_issuers where name = p_name and count <= 0;
end;
$function$
;

-- facturation_learn_document(text,text,text,text[],jsonb,jsonb,text)
CREATE OR REPLACE FUNCTION public.facturation_learn_document(p_hash text, p_issuer text, p_display text, p_codes text[], p_deltas jsonb, p_comptes jsonb, p_method text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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
  perform public.facturation_wordpool_learn(
    coalesce(p_codes, '{}'), coalesce(p_deltas, '{}'::jsonb)
  );
  if nullif(p_issuer, '') is not null then
    perform public.facturation_issuer_codes_learn(nullif(p_issuer, ''), coalesce(p_codes, '{}'));
    perform public.facturation_issuer_learn(nullif(p_issuer, ''), nullif(p_display, ''));
  end if;

  return true;                          -- nouvellement appris
end;
$function$
;

-- facturation_learned_docs_delete(text)
CREATE OR REPLACE FUNCTION public.facturation_learned_docs_delete(p_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_learned_docs where hash = p_hash;
end;
$function$
;

-- facturation_learned_docs_forget(text)
CREATE OR REPLACE FUNCTION public.facturation_learned_docs_forget(p_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d record;
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_learned_docs_record(text,text,text[],jsonb,text,jsonb)
CREATE OR REPLACE FUNCTION public.facturation_learned_docs_record(p_hash text, p_issuer text, p_codes text[], p_deltas jsonb, p_method text, p_comptes jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_ref_comptes_delete(text)
CREATE OR REPLACE FUNCTION public.facturation_ref_comptes_delete(p_compte text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_ref_comptes_reimport(jsonb)
CREATE OR REPLACE FUNCTION public.facturation_ref_comptes_reimport(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_ref_comptes_upsert(text,text)
CREATE OR REPLACE FUNCTION public.facturation_ref_comptes_upsert(p_compte text, p_libelle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_ref_delete(text,text)
CREATE OR REPLACE FUNCTION public.facturation_ref_delete(p_code text, p_compte text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  remaining int;
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_ref_reimport(jsonb)
CREATE OR REPLACE FUNCTION public.facturation_ref_reimport(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_ref_reimport_replace(jsonb)
CREATE OR REPLACE FUNCTION public.facturation_ref_reimport_replace(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  removed int;
begin
  if private.get_page_level('facturation') <> 'gestion' then
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
$function$
;

-- facturation_ref_upsert(text,text,text,text,text,integer,boolean)
CREATE OR REPLACE FUNCTION public.facturation_ref_upsert(p_code text, p_compte text, p_section text, p_libelle text, p_description text, p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_wordpool_forget_code(text)
CREATE OR REPLACE FUNCTION public.facturation_wordpool_forget_code(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where code = p_code;
end;
$function$
;

-- facturation_wordpool_learn(text[],jsonb)
CREATE OR REPLACE FUNCTION public.facturation_wordpool_learn(p_codes text[], p_deltas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_wordpool_prune(integer,integer)
CREATE OR REPLACE FUNCTION public.facturation_wordpool_prune(p_min_count integer DEFAULT 2, p_top_k integer DEFAULT 300)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- facturation_wordpool_unlearn(text[],jsonb)
CREATE OR REPLACE FUNCTION public.facturation_wordpool_unlearn(p_codes text[], p_deltas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.get_page_level('facturation') <> 'gestion' then
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

-- literie_record_movement(smallint,text,text,smallint)
CREATE OR REPLACE FUNCTION public.literie_record_movement(p_room smallint, p_item text, p_direction text, p_quantity smallint DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if private.page_level_rank(private.get_page_level('literie')) < 2 then
    raise exception 'not authorized';
  end if;
  if p_item not in ('oreiller', 'couette') then
    raise exception 'invalid item: %', p_item;
  end if;
  if p_direction not in ('mise_en_place', 'retour') then
    raise exception 'invalid direction: %', p_direction;
  end if;

  insert into public.literie_stock_movements (room, item, direction, quantity, created_by)
  values (p_room, p_item, p_direction, p_quantity, auth.uid());

  update public.literie_stock set
    synthetic_pillows = synthetic_pillows
      + case when p_item = 'oreiller' and p_direction = 'retour' then p_quantity
             when p_item = 'oreiller' and p_direction = 'mise_en_place' then -p_quantity
             else 0 end,
    synthetic_duvets = synthetic_duvets
      + case when p_item = 'couette' and p_direction = 'retour' then p_quantity
             when p_item = 'couette' and p_direction = 'mise_en_place' then -p_quantity
             else 0 end,
    updated_at = now()
  where id = 1;
end;
$function$
;

-- literie_toggle_bedding(smallint,boolean)
CREATE OR REPLACE FUNCTION public.literie_toggle_bedding(p_room smallint, p_synthetic boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_direction text := case when p_synthetic then 'mise_en_place' else 'retour' end;
begin
  if private.page_level_rank(private.get_page_level('literie')) < 2 then
    raise exception 'not authorized';
  end if;

  update public.hotel_rooms set literie_synthetique = p_synthetic where room = p_room;
  if not found then
    raise exception 'unknown room: %', p_room;
  end if;

  perform public.literie_record_movement(p_room, 'oreiller', v_direction);
  perform public.literie_record_movement(p_room, 'couette', v_direction);
end;
$function$
;

-- parking_no_past_rewrite() (trigger)
CREATE OR REPLACE FUNCTION public.parking_no_past_rewrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Contexte non-utilisateur (maintenance, service_role) : aucun garde-fou.
  if auth.uid() is null then
    return new;
  end if;
  -- La gestion (et l'admin, qui a get_page_level = 'gestion') peut tout.
  if private.get_page_level('parking') = 'gestion' then
    return new;
  end if;
  -- Interdire de reculer le début plus loin dans le passé verrouillé.
  if new.start_date < old.start_date and new.start_date < (current_date - 7) then
    raise exception 'parking: recul du debut dans le passe verrouille (reserve a la gestion)';
  end if;
  return new;
end;
$function$
;

-- prevent_self_role_change() (trigger)
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if not private.is_admin() then new.role := 'utilisateur'; end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not private.is_admin() then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$function$
;

-- rapro_occupancy(date)
CREATE OR REPLACE FUNCTION public.rapro_occupancy(p_date date)
 RETURNS TABLE(room integer, adr numeric, manual_kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.room::int, b.adr, b.manual_kind
  from public.pdj_breakfasts b
  where b.service_date = p_date
    and (select private.page_level_rank(private.get_page_level('rapro'))) >= 1
$function$
;

-- remove_page_permission(uuid,text)
CREATE OR REPLACE FUNCTION public.remove_page_permission(p_user uuid, p_page text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  delete from public.user_page_permissions where user_id = p_user and page = p_page;
end;
$function$
;

-- set_page_permission(uuid,text,text)
CREATE OR REPLACE FUNCTION public.set_page_permission(p_user uuid, p_page text, p_level text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_level not in ('lecture', 'ecriture', 'gestion') then
    raise exception 'invalid level: %', p_level;
  end if;
  insert into public.user_page_permissions (user_id, page, level, updated_by)
  values (p_user, p_page, p_level, auth.uid())
  on conflict (user_id, page) do update
    set level = excluded.level, updated_at = now(), updated_by = auth.uid();
end;
$function$
;

-- set_parking_tarif(numeric,numeric,date)
CREATE OR REPLACE FUNCTION public.set_parking_tarif(p_price_ttc numeric, p_vat_rate numeric, p_effective_from date)
 RETURNS parking_tarifs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.parking_tarifs;
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_price_ttc <= 0 then
    raise exception 'invalid price_ttc: %', p_price_ttc;
  end if;
  if p_vat_rate < 0 or p_vat_rate >= 100 then
    raise exception 'invalid vat_rate: %', p_vat_rate;
  end if;

  insert into public.parking_tarifs (price_ttc, vat_rate, effective_from)
  values (p_price_ttc, p_vat_rate, p_effective_from)
  returning * into v_row;

  return v_row;
end;
$function$
;

-- set_user_grade(uuid,text)
CREATE OR REPLACE FUNCTION public.set_user_grade(p_user uuid, p_grade text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_grade not in ('admin', 'utilisateur') then
    raise exception 'invalid grade: %', p_grade;
  end if;
  if p_grade <> 'admin'
     and exists (select 1 from public.profiles where id = p_user and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'dernier admin: rétrogradation refusée (verrouillage total)';
  end if;
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    'profiles', p_user::text, 'set_user_grade',
    jsonb_build_object(
      'old_role', (select role from public.profiles where id = p_user),
      'new_grade', p_grade
    ),
    auth.uid(), now()
  );
  update public.profiles set role = p_grade where id = p_user;
end;
$function$
;

-- =============================================================================
-- VÉRIFICATION (lecture seule) — attendu : 0 aide dans public, 5 dans private,
-- 0 fonction de public dont le corps référence encore `public.<aide>(`,
-- anon sans usage sur private.
-- =============================================================================
select 'aides dans public' as controle, count(*)::text as valeur
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_page_level','is_admin','get_user_role','page_level_rank','repjour_manual_forecast_allowed')
union all
select 'aides dans private', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('get_page_level','is_admin','get_user_role','page_level_rank','repjour_manual_forecast_allowed')
union all
select 'fonctions public referencant encore public.<aide>(', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ~ 'public\.(get_page_level|is_admin|get_user_role|page_level_rank|repjour_manual_forecast_allowed)\('
union all
select 'policies referencant private.', count(*)::text
from pg_policies where schemaname = 'public'
  and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'private\.(get_page_level|is_admin|get_user_role|page_level_rank|repjour_manual_forecast_allowed)\('
union all
select 'anon usage sur private', has_schema_privilege('anon', 'private', 'usage')::text
union all
select 'authenticated usage sur private', has_schema_privilege('authenticated', 'private', 'usage')::text;

-- NOTE DE REJEU : après application, `alter function public.<aide> set schema
-- private` échoue (fonction déjà déplacée). Pour rejouer uniquement les corps,
-- exécuter le fichier à partir de la section (3).
