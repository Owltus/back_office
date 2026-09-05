-- =============================================================================
-- private_rpc_relais — 34 RPC privilégiées en schéma private + relais publics
--
-- Application : `supabase db query --linked -f supabase/private_rpc_relais.sql`
-- EN UNE FOIS (une transaction). Fichier GÉNÉRÉ depuis le catalogue de prod
-- (pg_get_functiondef, pg_get_function_arguments, 2026-09-05) puis relu.
-- Rejeu : les `alter … set schema` échouent si déjà appliqué ; rejouer les
-- sections (2) et (3) après `drop function public.<relais>` si besoin.
--
-- INNOCUITÉ : aucune table, aucune donnée, aucune policy. Chaque fonction est
-- déplacée (OID, privilèges et dépendances conservés), son corps régénéré À
-- L'IDENTIQUE (mêmes attributs security definer / volatilité / search_path ;
-- seuls les appels internes vers d'autres fonctions déplacées deviennent
-- `private.`), et un relais SECURITY INVOKER de même nom, même signature
-- (noms, types, valeurs par défaut) et même type de retour est créé dans
-- public pour l'application, qui ne change pas d'une ligne.
--
-- POURQUOI (plan security-advisor-zero-2026-09-05, étape 3) : ces 34 fonctions
-- DOIVENT garder leurs privilèges : elles écrivent des tables volontairement
-- fermées à l'écriture directe (facturation_*, user_page_permissions,
-- audit_log sans policy, auth.users) ou croisent des pages (rapro lit PDJ et
-- RepJour sans en avoir les droits). Les convertir en invoker exigerait
-- d'ouvrir ces tables : un affaiblissement. Elles quittent l'API (schéma non
-- exposé), leur garde interne reste, et seul un relais sans privilège est
-- appelable. Le lint 0029 n'a plus rien à signaler dans public.
--
-- Liste : admin_update_password, set_user_grade, set_page_permission,
-- remove_page_permission, daily_reports_occ, rapro_occupancy, et 28
-- facturation_* (dont facturation_issuer_codes_forget en 2 surcharges).
-- =============================================================================

-- (1) Déplacement (OID, ACL et dépendances conservés).
alter function public.admin_update_password(uuid,text) set schema private;
alter function public.daily_reports_occ(date) set schema private;
alter function public.facturation_budget_line_delete(text) set schema private;
alter function public.facturation_budget_line_upsert(text,text,text,text,text[],integer,boolean) set schema private;
alter function public.facturation_issuer_codes_forget(text) set schema private;
alter function public.facturation_issuer_codes_forget(text,text) set schema private;
alter function public.facturation_issuer_codes_learn(text,text[]) set schema private;
alter function public.facturation_issuer_codes_unlearn(text,text[]) set schema private;
alter function public.facturation_issuer_delete(text) set schema private;
alter function public.facturation_issuer_denylist_add(text,text) set schema private;
alter function public.facturation_issuer_denylist_remove(text,text) set schema private;
alter function public.facturation_issuer_learn(text,text) set schema private;
alter function public.facturation_issuer_merge(text,text,text) set schema private;
alter function public.facturation_issuer_rename(text,text,text) set schema private;
alter function public.facturation_issuer_unlearn(text) set schema private;
alter function public.facturation_learn_document(text,text,text,text[],jsonb,jsonb,text) set schema private;
alter function public.facturation_learned_docs_delete(text) set schema private;
alter function public.facturation_learned_docs_forget(text) set schema private;
alter function public.facturation_learned_docs_record(text,text,text[],jsonb,text,jsonb) set schema private;
alter function public.facturation_ref_comptes_delete(text) set schema private;
alter function public.facturation_ref_comptes_reimport(jsonb) set schema private;
alter function public.facturation_ref_comptes_upsert(text,text) set schema private;
alter function public.facturation_ref_delete(text,text) set schema private;
alter function public.facturation_ref_reimport(jsonb) set schema private;
alter function public.facturation_ref_reimport_replace(jsonb) set schema private;
alter function public.facturation_ref_upsert(text,text,text,text,text,integer,boolean) set schema private;
alter function public.facturation_wordpool_forget_code(text) set schema private;
alter function public.facturation_wordpool_learn(text[],jsonb) set schema private;
alter function public.facturation_wordpool_prune(integer,integer) set schema private;
alter function public.facturation_wordpool_unlearn(text[],jsonb) set schema private;
alter function public.rapro_occupancy(date) set schema private;
alter function public.remove_page_permission(uuid,text) set schema private;
alter function public.set_page_permission(uuid,text,text) set schema private;
alter function public.set_user_grade(uuid,text) set schema private;

-- (2) Corps privés régénérés : appels internes entre RPC déplacées en private.
CREATE OR REPLACE FUNCTION private.admin_update_password(target_user_id uuid, new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'Accès refusé : rôle admin requis';
  end if;
  if target_user_id <> auth.uid()
     and (select role from public.profiles where id = target_user_id) = 'admin' then
    raise exception 'Cible administrateur : réinitialisation interdite (passer par le dashboard)';
  end if;
  if length(new_password) < 12 then
    raise exception 'Le mot de passe doit faire au moins 12 caractères';
  end if;
  if new_password !~ '[A-Z]' then
    raise exception 'Le mot de passe doit contenir au moins une majuscule';
  end if;
  if new_password !~ '[a-z]' then
    raise exception 'Le mot de passe doit contenir au moins une minuscule';
  end if;
  if new_password !~ '[0-9]' then
    raise exception 'Le mot de passe doit contenir au moins un chiffre';
  end if;
  if new_password !~ '[^a-zA-Z0-9]' then
    raise exception 'Le mot de passe doit contenir au moins un caractère spécial';
  end if;
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    'auth.users', target_user_id::text, 'admin_password_reset',
    jsonb_build_object('target_role', (select role from public.profiles where id = target_user_id)),
    auth.uid(), now()
  );
end;
$function$
;
revoke execute on function private.admin_update_password(uuid,text) from public, anon;
grant execute on function private.admin_update_password(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION private.daily_reports_occ(p_date date)
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
revoke execute on function private.daily_reports_occ(date) from public, anon;
grant execute on function private.daily_reports_occ(date) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_budget_line_delete(p_code text)
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
revoke execute on function private.facturation_budget_line_delete(text) from public, anon;
grant execute on function private.facturation_budget_line_delete(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_budget_line_upsert(p_code text, p_label text, p_category text, p_hint text, p_tags text[], p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
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
revoke execute on function private.facturation_budget_line_upsert(text,text,text,text,text[],integer,boolean) from public, anon;
grant execute on function private.facturation_budget_line_upsert(text,text,text,text,text[],integer,boolean) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_forget(p_issuer text)
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
revoke execute on function private.facturation_issuer_codes_forget(text) from public, anon;
grant execute on function private.facturation_issuer_codes_forget(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_forget(p_issuer text, p_code text)
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
revoke execute on function private.facturation_issuer_codes_forget(text,text) from public, anon;
grant execute on function private.facturation_issuer_codes_forget(text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_learn(p_issuer text, p_codes text[])
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
revoke execute on function private.facturation_issuer_codes_learn(text,text[]) from public, anon;
grant execute on function private.facturation_issuer_codes_learn(text,text[]) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_codes_unlearn(p_issuer text, p_codes text[])
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
revoke execute on function private.facturation_issuer_codes_unlearn(text,text[]) from public, anon;
grant execute on function private.facturation_issuer_codes_unlearn(text,text[]) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_delete(p_name text)
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
revoke execute on function private.facturation_issuer_delete(text) from public, anon;
grant execute on function private.facturation_issuer_delete(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_denylist_add(p_issuer text, p_code text)
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
revoke execute on function private.facturation_issuer_denylist_add(text,text) from public, anon;
grant execute on function private.facturation_issuer_denylist_add(text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_denylist_remove(p_issuer text, p_code text)
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
revoke execute on function private.facturation_issuer_denylist_remove(text,text) from public, anon;
grant execute on function private.facturation_issuer_denylist_remove(text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_learn(p_name text, p_display text)
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
revoke execute on function private.facturation_issuer_learn(text,text) from public, anon;
grant execute on function private.facturation_issuer_learn(text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_merge(p_from_name text, p_to_name text, p_display text)
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
revoke execute on function private.facturation_issuer_merge(text,text,text) from public, anon;
grant execute on function private.facturation_issuer_merge(text,text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_rename(p_old_name text, p_new_name text, p_display text)
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
revoke execute on function private.facturation_issuer_rename(text,text,text) from public, anon;
grant execute on function private.facturation_issuer_rename(text,text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_issuer_unlearn(p_name text)
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
revoke execute on function private.facturation_issuer_unlearn(text) from public, anon;
grant execute on function private.facturation_issuer_unlearn(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_learn_document(p_hash text, p_issuer text, p_display text, p_codes text[], p_deltas jsonb, p_comptes jsonb, p_method text)
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
revoke execute on function private.facturation_learn_document(text,text,text,text[],jsonb,jsonb,text) from public, anon;
grant execute on function private.facturation_learn_document(text,text,text,text[],jsonb,jsonb,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_learned_docs_delete(p_hash text)
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
revoke execute on function private.facturation_learned_docs_delete(text) from public, anon;
grant execute on function private.facturation_learned_docs_delete(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_learned_docs_forget(p_hash text)
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
revoke execute on function private.facturation_learned_docs_forget(text) from public, anon;
grant execute on function private.facturation_learned_docs_forget(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_learned_docs_record(p_hash text, p_issuer text, p_codes text[], p_deltas jsonb, p_method text, p_comptes jsonb DEFAULT '{}'::jsonb)
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
revoke execute on function private.facturation_learned_docs_record(text,text,text[],jsonb,text,jsonb) from public, anon;
grant execute on function private.facturation_learned_docs_record(text,text,text[],jsonb,text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_ref_comptes_delete(p_compte text)
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
revoke execute on function private.facturation_ref_comptes_delete(text) from public, anon;
grant execute on function private.facturation_ref_comptes_delete(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_ref_comptes_reimport(p_rows jsonb)
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
revoke execute on function private.facturation_ref_comptes_reimport(jsonb) from public, anon;
grant execute on function private.facturation_ref_comptes_reimport(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_ref_comptes_upsert(p_compte text, p_libelle text)
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
revoke execute on function private.facturation_ref_comptes_upsert(text,text) from public, anon;
grant execute on function private.facturation_ref_comptes_upsert(text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_ref_delete(p_code text, p_compte text)
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
revoke execute on function private.facturation_ref_delete(text,text) from public, anon;
grant execute on function private.facturation_ref_delete(text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_ref_reimport(p_rows jsonb)
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
revoke execute on function private.facturation_ref_reimport(jsonb) from public, anon;
grant execute on function private.facturation_ref_reimport(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_ref_reimport_replace(p_rows jsonb)
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
revoke execute on function private.facturation_ref_reimport_replace(jsonb) from public, anon;
grant execute on function private.facturation_ref_reimport_replace(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_ref_upsert(p_code text, p_compte text, p_section text, p_libelle text, p_description text, p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
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
revoke execute on function private.facturation_ref_upsert(text,text,text,text,text,integer,boolean) from public, anon;
grant execute on function private.facturation_ref_upsert(text,text,text,text,text,integer,boolean) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_wordpool_forget_code(p_code text)
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
revoke execute on function private.facturation_wordpool_forget_code(text) from public, anon;
grant execute on function private.facturation_wordpool_forget_code(text) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_wordpool_learn(p_codes text[], p_deltas jsonb)
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
revoke execute on function private.facturation_wordpool_learn(text[],jsonb) from public, anon;
grant execute on function private.facturation_wordpool_learn(text[],jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_wordpool_prune(p_min_count integer DEFAULT 2, p_top_k integer DEFAULT 300)
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
revoke execute on function private.facturation_wordpool_prune(integer,integer) from public, anon;
grant execute on function private.facturation_wordpool_prune(integer,integer) to authenticated;

CREATE OR REPLACE FUNCTION private.facturation_wordpool_unlearn(p_codes text[], p_deltas jsonb)
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
revoke execute on function private.facturation_wordpool_unlearn(text[],jsonb) from public, anon;
grant execute on function private.facturation_wordpool_unlearn(text[],jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.rapro_occupancy(p_date date)
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
revoke execute on function private.rapro_occupancy(date) from public, anon;
grant execute on function private.rapro_occupancy(date) to authenticated;

CREATE OR REPLACE FUNCTION private.remove_page_permission(p_user uuid, p_page text)
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
revoke execute on function private.remove_page_permission(uuid,text) from public, anon;
grant execute on function private.remove_page_permission(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION private.set_page_permission(p_user uuid, p_page text, p_level text)
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
revoke execute on function private.set_page_permission(uuid,text,text) from public, anon;
grant execute on function private.set_page_permission(uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.set_user_grade(p_user uuid, p_grade text)
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
revoke execute on function private.set_user_grade(uuid,text) from public, anon;
grant execute on function private.set_user_grade(uuid,text) to authenticated;

-- (3) Relais publics : même nom, même signature, même retour, SECURITY INVOKER.
create function public.admin_update_password(target_user_id uuid, new_password text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.admin_update_password(target_user_id, new_password) $$;
revoke execute on function public.admin_update_password(uuid,text) from public, anon;
grant execute on function public.admin_update_password(uuid,text) to authenticated;

create function public.daily_reports_occ(p_date date)
  returns integer
  language sql stable security invoker
  set search_path = public
as $$ select private.daily_reports_occ(p_date) $$;
revoke execute on function public.daily_reports_occ(date) from public, anon;
grant execute on function public.daily_reports_occ(date) to authenticated;

create function public.facturation_budget_line_delete(p_code text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_budget_line_delete(p_code) $$;
revoke execute on function public.facturation_budget_line_delete(text) from public, anon;
grant execute on function public.facturation_budget_line_delete(text) to authenticated;

create function public.facturation_budget_line_upsert(p_code text, p_label text, p_category text, p_hint text, p_tags text[], p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_budget_line_upsert(p_code, p_label, p_category, p_hint, p_tags, p_sort, p_create) $$;
revoke execute on function public.facturation_budget_line_upsert(text,text,text,text,text[],integer,boolean) from public, anon;
grant execute on function public.facturation_budget_line_upsert(text,text,text,text,text[],integer,boolean) to authenticated;

create function public.facturation_issuer_codes_forget(p_issuer text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_codes_forget(p_issuer) $$;
revoke execute on function public.facturation_issuer_codes_forget(text) from public, anon;
grant execute on function public.facturation_issuer_codes_forget(text) to authenticated;

create function public.facturation_issuer_codes_forget(p_issuer text, p_code text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_codes_forget(p_issuer, p_code) $$;
revoke execute on function public.facturation_issuer_codes_forget(text,text) from public, anon;
grant execute on function public.facturation_issuer_codes_forget(text,text) to authenticated;

create function public.facturation_issuer_codes_learn(p_issuer text, p_codes text[])
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_codes_learn(p_issuer, p_codes) $$;
revoke execute on function public.facturation_issuer_codes_learn(text,text[]) from public, anon;
grant execute on function public.facturation_issuer_codes_learn(text,text[]) to authenticated;

create function public.facturation_issuer_codes_unlearn(p_issuer text, p_codes text[])
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_codes_unlearn(p_issuer, p_codes) $$;
revoke execute on function public.facturation_issuer_codes_unlearn(text,text[]) from public, anon;
grant execute on function public.facturation_issuer_codes_unlearn(text,text[]) to authenticated;

create function public.facturation_issuer_delete(p_name text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_delete(p_name) $$;
revoke execute on function public.facturation_issuer_delete(text) from public, anon;
grant execute on function public.facturation_issuer_delete(text) to authenticated;

create function public.facturation_issuer_denylist_add(p_issuer text, p_code text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_denylist_add(p_issuer, p_code) $$;
revoke execute on function public.facturation_issuer_denylist_add(text,text) from public, anon;
grant execute on function public.facturation_issuer_denylist_add(text,text) to authenticated;

create function public.facturation_issuer_denylist_remove(p_issuer text, p_code text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_denylist_remove(p_issuer, p_code) $$;
revoke execute on function public.facturation_issuer_denylist_remove(text,text) from public, anon;
grant execute on function public.facturation_issuer_denylist_remove(text,text) to authenticated;

create function public.facturation_issuer_learn(p_name text, p_display text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_learn(p_name, p_display) $$;
revoke execute on function public.facturation_issuer_learn(text,text) from public, anon;
grant execute on function public.facturation_issuer_learn(text,text) to authenticated;

create function public.facturation_issuer_merge(p_from_name text, p_to_name text, p_display text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_merge(p_from_name, p_to_name, p_display) $$;
revoke execute on function public.facturation_issuer_merge(text,text,text) from public, anon;
grant execute on function public.facturation_issuer_merge(text,text,text) to authenticated;

create function public.facturation_issuer_rename(p_old_name text, p_new_name text, p_display text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_rename(p_old_name, p_new_name, p_display) $$;
revoke execute on function public.facturation_issuer_rename(text,text,text) from public, anon;
grant execute on function public.facturation_issuer_rename(text,text,text) to authenticated;

create function public.facturation_issuer_unlearn(p_name text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_issuer_unlearn(p_name) $$;
revoke execute on function public.facturation_issuer_unlearn(text) from public, anon;
grant execute on function public.facturation_issuer_unlearn(text) to authenticated;

create function public.facturation_learn_document(p_hash text, p_issuer text, p_display text, p_codes text[], p_deltas jsonb, p_comptes jsonb, p_method text)
  returns boolean
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_learn_document(p_hash, p_issuer, p_display, p_codes, p_deltas, p_comptes, p_method) $$;
revoke execute on function public.facturation_learn_document(text,text,text,text[],jsonb,jsonb,text) from public, anon;
grant execute on function public.facturation_learn_document(text,text,text,text[],jsonb,jsonb,text) to authenticated;

create function public.facturation_learned_docs_delete(p_hash text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_learned_docs_delete(p_hash) $$;
revoke execute on function public.facturation_learned_docs_delete(text) from public, anon;
grant execute on function public.facturation_learned_docs_delete(text) to authenticated;

create function public.facturation_learned_docs_forget(p_hash text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_learned_docs_forget(p_hash) $$;
revoke execute on function public.facturation_learned_docs_forget(text) from public, anon;
grant execute on function public.facturation_learned_docs_forget(text) to authenticated;

create function public.facturation_learned_docs_record(p_hash text, p_issuer text, p_codes text[], p_deltas jsonb, p_method text, p_comptes jsonb DEFAULT '{}'::jsonb)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_learned_docs_record(p_hash, p_issuer, p_codes, p_deltas, p_method, p_comptes) $$;
revoke execute on function public.facturation_learned_docs_record(text,text,text[],jsonb,text,jsonb) from public, anon;
grant execute on function public.facturation_learned_docs_record(text,text,text[],jsonb,text,jsonb) to authenticated;

create function public.facturation_ref_comptes_delete(p_compte text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_ref_comptes_delete(p_compte) $$;
revoke execute on function public.facturation_ref_comptes_delete(text) from public, anon;
grant execute on function public.facturation_ref_comptes_delete(text) to authenticated;

create function public.facturation_ref_comptes_reimport(p_rows jsonb)
  returns integer
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_ref_comptes_reimport(p_rows) $$;
revoke execute on function public.facturation_ref_comptes_reimport(jsonb) from public, anon;
grant execute on function public.facturation_ref_comptes_reimport(jsonb) to authenticated;

create function public.facturation_ref_comptes_upsert(p_compte text, p_libelle text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_ref_comptes_upsert(p_compte, p_libelle) $$;
revoke execute on function public.facturation_ref_comptes_upsert(text,text) from public, anon;
grant execute on function public.facturation_ref_comptes_upsert(text,text) to authenticated;

create function public.facturation_ref_delete(p_code text, p_compte text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_ref_delete(p_code, p_compte) $$;
revoke execute on function public.facturation_ref_delete(text,text) from public, anon;
grant execute on function public.facturation_ref_delete(text,text) to authenticated;

create function public.facturation_ref_reimport(p_rows jsonb)
  returns integer
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_ref_reimport(p_rows) $$;
revoke execute on function public.facturation_ref_reimport(jsonb) from public, anon;
grant execute on function public.facturation_ref_reimport(jsonb) to authenticated;

create function public.facturation_ref_reimport_replace(p_rows jsonb)
  returns integer
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_ref_reimport_replace(p_rows) $$;
revoke execute on function public.facturation_ref_reimport_replace(jsonb) from public, anon;
grant execute on function public.facturation_ref_reimport_replace(jsonb) to authenticated;

create function public.facturation_ref_upsert(p_code text, p_compte text, p_section text, p_libelle text, p_description text, p_sort integer DEFAULT NULL::integer, p_create boolean DEFAULT false)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_ref_upsert(p_code, p_compte, p_section, p_libelle, p_description, p_sort, p_create) $$;
revoke execute on function public.facturation_ref_upsert(text,text,text,text,text,integer,boolean) from public, anon;
grant execute on function public.facturation_ref_upsert(text,text,text,text,text,integer,boolean) to authenticated;

create function public.facturation_wordpool_forget_code(p_code text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_wordpool_forget_code(p_code) $$;
revoke execute on function public.facturation_wordpool_forget_code(text) from public, anon;
grant execute on function public.facturation_wordpool_forget_code(text) to authenticated;

create function public.facturation_wordpool_learn(p_codes text[], p_deltas jsonb)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_wordpool_learn(p_codes, p_deltas) $$;
revoke execute on function public.facturation_wordpool_learn(text[],jsonb) from public, anon;
grant execute on function public.facturation_wordpool_learn(text[],jsonb) to authenticated;

create function public.facturation_wordpool_prune(p_min_count integer DEFAULT 2, p_top_k integer DEFAULT 300)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_wordpool_prune(p_min_count, p_top_k) $$;
revoke execute on function public.facturation_wordpool_prune(integer,integer) from public, anon;
grant execute on function public.facturation_wordpool_prune(integer,integer) to authenticated;

create function public.facturation_wordpool_unlearn(p_codes text[], p_deltas jsonb)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.facturation_wordpool_unlearn(p_codes, p_deltas) $$;
revoke execute on function public.facturation_wordpool_unlearn(text[],jsonb) from public, anon;
grant execute on function public.facturation_wordpool_unlearn(text[],jsonb) to authenticated;

create function public.rapro_occupancy(p_date date)
  returns TABLE(room integer, adr numeric, manual_kind text)
  language sql stable security invoker
  set search_path = public
as $$ select * from private.rapro_occupancy(p_date) $$;
revoke execute on function public.rapro_occupancy(date) from public, anon;
grant execute on function public.rapro_occupancy(date) to authenticated;

create function public.remove_page_permission(p_user uuid, p_page text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.remove_page_permission(p_user, p_page) $$;
revoke execute on function public.remove_page_permission(uuid,text) from public, anon;
grant execute on function public.remove_page_permission(uuid,text) to authenticated;

create function public.set_page_permission(p_user uuid, p_page text, p_level text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.set_page_permission(p_user, p_page, p_level) $$;
revoke execute on function public.set_page_permission(uuid,text,text) from public, anon;
grant execute on function public.set_page_permission(uuid,text,text) to authenticated;

create function public.set_user_grade(p_user uuid, p_grade text)
  returns void
  language sql volatile security invoker
  set search_path = public
as $$ select private.set_user_grade(p_user, p_grade) $$;
revoke execute on function public.set_user_grade(uuid,text) from public, anon;
grant execute on function public.set_user_grade(uuid,text) to authenticated;

-- =============================================================================
-- VÉRIFICATION (lecture seule) — attendu : 0 security definer non-trigger
-- dans public, 34 relais invoker dans public, 34 + 6 fonctions dans private,
-- 0 fonction privée appelant un relais public, signatures identiques.
-- =============================================================================
select 'definer non-trigger dans public' as controle, count(*)::text as valeur
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'pg_catalog.trigger'::regtype
union all
select 'relais invoker dans public', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
  and exists (select 1 from pg_proc q join pg_namespace m on m.oid = q.pronamespace
              where m.nspname = 'private' and q.proname = p.proname
                and pg_get_function_identity_arguments(q.oid) = pg_get_function_identity_arguments(p.oid))
union all
select 'fonctions dans private', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'
union all
select 'fonctions privees appelant un relais public', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.prokind = 'f'
  -- noms de FONCTIONS suivis de « ( » : les tables public.facturation_* ne comptent pas
  and (case when p.prokind = 'f' then pg_get_functiondef(p.oid) end)
      ~ ('public\.(' || (select string_agg(q.proname, '|') from pg_proc q join pg_namespace m on m.oid = q.pronamespace where m.nspname = 'private') || ')\(');
