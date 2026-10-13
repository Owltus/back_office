-- =====================================================================
-- BASELINE — schémas public et private de la PRODUCTION, 2026-10-13
-- =====================================================================
-- Source : `supabase db dump --linked --schema public,private` (CLI 2.120.0),
-- SCHÉMA SEUL, aucune ligne de données (contrôlé : 0 COPY, 0 INSERT).
-- Plan environnement-dev-docker-2026-10-12, étape 3.
--
-- Rien n'en a été retiré : le dump est reproduit tel quel ci-dessous.
-- Objets hors de ces deux schémas (bucket, policies de storage.objects,
-- publication Realtime, réglages de rôles, extensions) :
-- 20261013000001_hors_public.sql.
--
-- ⚠ RÈGLE À PARTIR DE CE FICHIER : la vérité du schéma est
-- `supabase/migrations/`. Les ~150 fichiers à plat de `supabase/*.sql` sont
-- de l'HISTORIQUE, jamais rejoués. Tout changement = une nouvelle migration,
-- essayée en local (`supabase db reset`), livrée par `livrer.bat`.
--
-- En prod, cette migration n'est pas rejouée : elle y est marquée
-- « appliquée » par `migration repair` (étape 9).
-- =====================================================================

-- Ajouté au dump : extension requise par la contrainte d'exclusion
-- `parking_reservations_no_overlap` (gist sur un smallint). Présente en prod
-- (btree_gist 1.7, schéma extensions) mais absente de la stack locale, et
-- `db dump` ne sort pas les extensions. Sans effet en prod (non rejoué).
create extension if not exists "btree_gist" with schema "extensions";

-- Ajouté au dump : privilèges PAR DÉFAUT ramenés à l'état de la prod AVANT de
-- créer le moindre objet. `db dump` n'écrit que des GRANT, en supposant des
-- privilèges par défaut vides au départ ; or la stack locale accorde TOUT à
-- anon, authenticated et service_role sur public (et EXECUTE à PUBLIC partout).
-- Sans ce bloc, chaque fonction et table de la baseline naissait exécutable /
-- lisible par anon (trouvé par verif_advisor 0028 et verif_audit en local).
-- Les GRANT par objet du dump, puis ses ALTER DEFAULT PRIVILEGES finaux,
-- redonnent exactement les droits de la prod. Prod : état identique
-- (default_privileges_fonctions_2026-09-28.sql), bloc sans effet là-bas.
alter default privileges for role "postgres" in schema "public"
  revoke all on tables from "anon", "authenticated", "service_role";
alter default privileges for role "postgres" in schema "public"
  revoke all on sequences from "anon", "authenticated", "service_role";
alter default privileges for role "postgres" in schema "public"
  revoke all on functions from "anon", "authenticated", "service_role";
alter default privileges for role "postgres"
  revoke execute on functions from public;







SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."admin_update_password"("target_user_id" "uuid", "new_password" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  -- 2026-09-28 : `is_admin()` (coalesce → false) et non plus `<> 'admin'`,
  -- qui laissait passer un appelant SANS profil (NULL <> 'admin' = NULL).
  if not private.is_admin() then
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
$$;


ALTER FUNCTION "private"."admin_update_password"("target_user_id" "uuid", "new_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."caisse_cloturee_figee"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  trace constant text[] := array[
    'id', 'status', 'validated_at', 'validated_by', 'countersigned_by',
    'created_by', 'created_at', 'updated_at'
  ];
begin
  if auth.uid() is null then
    return new;
  end if;
  if old.status = 'validated' and new.status = 'validated'
     and (to_jsonb(new) - trace) is distinct from (to_jsonb(old) - trace) then
    raise exception 'Caisse clôturée : réouvrez-la pour la modifier.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."caisse_cloturee_figee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_chapter_read_ok"("p_chapter_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select private.classeur_lecture_ok(ch.classeur_id)
       from public.classeur_chapters ch where ch.id = p_chapter_id),
    false);
$$;


ALTER FUNCTION "private"."classeur_chapter_read_ok"("p_chapter_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_chapter_write_ok"("p_chapter_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select private.classeur_write_ok(ch.classeur_id)
       from public.classeur_chapters ch
      where ch.id = p_chapter_id),
    false);
$$;


ALTER FUNCTION "private"."classeur_chapter_write_ok"("p_chapter_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_document_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_classeur bigint;
  v_uid      uuid := auth.uid();
  v_auteur   text := '';
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.description is not distinct from old.description
     and new.content is not distinct from old.content then
    return null;
  end if;

  select ch.classeur_id into v_classeur
    from public.classeur_chapters ch where ch.id = new.chapter_id;
  if v_classeur is null then
    return null;
  end if;

  if v_uid is not null then
    select coalesce(
             nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
             nullif(btrim(p.display_name), ''),
             '')
      into v_auteur
      from public.profiles p where p.id = v_uid;
  end if;

  -- État d'avant le suivi : conservé une fois, au premier enregistrement.
  if tg_op = 'UPDATE' and not exists (
       select 1 from public.classeur_document_versions v where v.document_id = new.id) then
    insert into public.classeur_document_versions
      (document_id, classeur_id, title, description, content, origine, auteur, created_by, created_at,
       version, raison)
    values
      (old.id, v_classeur, old.title, old.description, old.content, 'etat_initial', '', null, old.updated_at,
       old.version_majeure::text || '.' || old.version_mineure::text, '');
  end if;

  insert into public.classeur_document_versions
    (document_id, classeur_id, title, description, content, origine, auteur, created_by,
     version, raison)
  values
    (new.id, v_classeur, new.title, new.description, new.content,
     case tg_op when 'INSERT' then 'creation' else 'enregistrement' end,
     coalesce(v_auteur, ''), v_uid,
     new.version_majeure::text || '.' || new.version_mineure::text,
     coalesce(new.version_raison, ''));

  -- Borne : 50 versions par document, les plus récentes.
  delete from public.classeur_document_versions v
   where v.document_id = new.id
     and v.id not in (
       select w.id from public.classeur_document_versions w
        where w.document_id = new.id
        order by w.created_at desc, w.id desc
        limit 50);

  return null;
end;
$$;


ALTER FUNCTION "private"."classeur_document_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_garde"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- Contexte système (CLI, service) : aucune garde.
  if auth.uid() is null or private.classeur_gestion_ok() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- « Privé » à la création : réservé à la gestion.
    new.acces_tous := 'lecture';
    -- Ni créé supprimé, ni placé où l'on veut dans la liste PARTAGÉE
    -- (réordonner = gestion) : toujours en fin de liste.
    new.deleted_at := null;
    new.sort_order := coalesce(
      (select max(c.sort_order) from public.classeur_classeurs c), 0) + 1;
    return new;
  end if;
  if new.acces_tous is distinct from old.acces_tous then
    raise exception 'Seule la gestion modifie l''accès d''un classeur.' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'Seule la gestion supprime un classeur.' using errcode = '42501';
  end if;
  if new.sort_order is distinct from old.sort_order then
    raise exception 'Seule la gestion réordonne la liste des classeurs.' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."classeur_garde"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_gestion_ok"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.get_page_level('classeur') is not distinct from 'gestion'; $$;


ALTER FUNCTION "private"."classeur_gestion_ok"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_lecture_ligne"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.classeur_niveau_de(p_classeur_id, p_created_by, p_acces_tous)
               in ('lecture', 'ecriture', 'gestion'); $$;


ALTER FUNCTION "private"."classeur_lecture_ligne"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_lecture_ok"("p_classeur_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.classeur_niveau(p_classeur_id) in ('lecture', 'ecriture', 'gestion'); $$;


ALTER FUNCTION "private"."classeur_lecture_ok"("p_classeur_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_niveau"("p_classeur_id" bigint) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when private.get_page_level('classeur') is not distinct from 'gestion' then 'gestion'
    else coalesce(
      (select private.classeur_niveau_de(c.id, c.created_by, c.acces_tous)
         from public.classeur_classeurs c where c.id = p_classeur_id),
      'aucun')
  end;
$$;


ALTER FUNCTION "private"."classeur_niveau"("p_classeur_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_niveau_de"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_page   text := private.get_page_level('classeur');
  v_uid    uuid := auth.uid();
  v_droit  text;
begin
  if v_page is null then
    return 'aucun';
  end if;
  if v_page = 'gestion' then
    return 'gestion';
  end if;
  v_droit := coalesce(
    (select a.niveau from public.classeur_acces a
      where a.classeur_id = p_classeur_id and a.user_id = v_uid),
    case when p_created_by = v_uid then 'ecriture' end,
    p_acces_tous);
  if v_droit is null or v_droit = 'aucun' then
    return 'aucun';
  end if;
  -- Plafond : le droit de page borne le droit sur le classeur.
  if v_page = 'lecture' then
    return 'lecture';
  end if;
  if v_page = 'ecriture' then
    return v_droit;
  end if;
  return 'aucun';
end;
$$;


ALTER FUNCTION "private"."classeur_niveau_de"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_personnes"() RETURNS TABLE("id" "uuid", "prenom" "text", "nom" "text", "nom_affiche" "text", "niveau_page" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not private.classeur_gestion_ok() then
    raise exception 'Réservé à la gestion de la page Classeur.' using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(p.first_name, ''), coalesce(p.last_name, ''),
           coalesce(p.display_name, ''),
           case when p.role = 'admin' then 'gestion' else u.level end
      from public.profiles p
      left join public.user_page_permissions u
        on u.user_id = p.id and u.page = 'classeur'
     where p.role = 'admin' or u.level is not null
     order by coalesce(nullif(p.last_name, ''), p.display_name), p.first_name;
end;
$$;


ALTER FUNCTION "private"."classeur_personnes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_version_monotone"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if (new.version_majeure, new.version_mineure)
     < (old.version_majeure, old.version_mineure) then
    new.version_majeure := old.version_majeure;
    new.version_mineure := old.version_mineure;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."classeur_version_monotone"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_versions_suivent"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_table_name = 'classeur_documents' then
    if new.chapter_id is distinct from old.chapter_id then
      update public.classeur_document_versions v
         set classeur_id = ch.classeur_id
        from public.classeur_chapters ch
       where ch.id = new.chapter_id
         and v.document_id = new.id
         and v.classeur_id is distinct from ch.classeur_id;
    end if;
  elsif new.classeur_id is distinct from old.classeur_id then
    update public.classeur_document_versions v
       set classeur_id = new.classeur_id
      from public.classeur_documents d
     where d.chapter_id = new.id
       and v.document_id = d.id
       and v.classeur_id is distinct from new.classeur_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "private"."classeur_versions_suivent"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."classeur_write_ok"("p_classeur_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.classeur_niveau(p_classeur_id) in ('ecriture', 'gestion'); $$;


ALTER FUNCTION "private"."classeur_write_ok"("p_classeur_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."daily_reports_occ"("p_date" "date") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select rj_nuitees
  from public.daily_reports
  where date = p_date
    and (select private.page_level_rank(private.get_page_level('rapro'))) >= 1
  limit 1;
$$;


ALTER FUNCTION "private"."daily_reports_occ"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_budget_line_delete"("p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_budget_line_delete"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer DEFAULT NULL::integer, "p_create" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_codes where issuer = p_issuer;
end;
$$;


ALTER FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  if to_regclass('public.facturation_issuer_codes') is not null then
    delete from public.facturation_issuer_codes
     where issuer = p_issuer and code = p_code;
  end if;
end;
$$;


ALTER FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_delete"("p_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_issuer_delete"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_denylist
   where issuer = p_issuer and code = p_code;
end;
$$;


ALTER FUNCTION "private"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_learn"("p_name" "text", "p_display" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_issuer_learn"("p_name" "text", "p_display" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_issuer_unlearn"("p_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers
     set count = count - 1, updated_at = now()
   where name = p_name;

  delete from public.facturation_issuers where name = p_name and count <= 0;
end;
$$;


ALTER FUNCTION "private"."facturation_issuer_unlearn"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_learned_docs_delete"("p_hash" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_learned_docs where hash = p_hash;
end;
$$;


ALTER FUNCTION "private"."facturation_learned_docs_delete"("p_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_learned_docs_forget"("p_hash" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_learned_docs_forget"("p_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_ref_comptes_delete"("p_compte" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_ref_comptes_delete"("p_compte" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_ref_comptes_reimport"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_ref_comptes_reimport"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_ref_delete"("p_code" "text", "p_compte" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_ref_delete"("p_code" "text", "p_compte" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_ref_reimport"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_ref_reimport"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_ref_reimport_replace"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_ref_reimport_replace"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer DEFAULT NULL::integer, "p_create" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_wordpool_forget_code"("p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if private.get_page_level('facturation') is distinct from 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where code = p_code;
end;
$$;


ALTER FUNCTION "private"."facturation_wordpool_forget_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_wordpool_prune"("p_min_count" integer DEFAULT 2, "p_top_k" integer DEFAULT 300) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_page_level"("p_page" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when private.is_admin() then 'gestion'
    else (select level from public.user_page_permissions
          where user_id = auth.uid() and page = p_page)
  end;
$$;


ALTER FUNCTION "private"."get_page_level"("p_page" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_user_email"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select email from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "private"."get_user_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "private"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."keep_author"("new_val" "uuid", "old_val" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select case when new_val is null and auth.uid() is null then null else old_val end
$$;


ALTER FUNCTION "private"."keep_author"("new_val" "uuid", "old_val" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, performed_by)
  VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', to_jsonb(OLD), auth.uid());
  RETURN OLD;
END;
$$;


ALTER FUNCTION "private"."log_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_row_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  rid text;
begin
  if tg_table_name = 'user_page_permissions' then
    rid := coalesce(new.user_id, old.user_id)::text || ':' || coalesce(new.page, old.page);
  else
    rid := coalesce(new.id, old.id)::text;
  end if;
  insert into public.audit_log (table_name, record_id, action, old_data, performed_by, performed_at)
  values (
    tg_table_name,
    rid,
    tg_op,
    case tg_op
      when 'INSERT' then to_jsonb(new)
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else to_jsonb(old)
    end,
    auth.uid(),
    now()
  );
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "private"."log_row_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."page_level_rank"("p_level" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case p_level
    when 'lecture' then 1
    when 'ecriture' then 2
    when 'gestion' then 3
    else 0
  end;
$$;


ALTER FUNCTION "private"."page_level_rank"("p_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."rapro_jour_cloture_fige"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  jours date[];
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    jours := array[new.report_date];
  elsif tg_op = 'DELETE' then
    jours := array[old.report_date];
  else
    -- UPDATE : seules les colonnes de données comptent (l'auteur peut être
    -- remis à null par la suppression d'un compte).
    if (new.report_date, new.room, new.status, new.carried_manual, new.materialized)
       is not distinct from
       (old.report_date, old.room, old.status, old.carried_manual, old.materialized) then
      return new;
    end if;
    jours := array[old.report_date, new.report_date];
  end if;

  if exists (
    select 1
    from public.rapro_sheets s
    where s.report_date = any (jours)
      and s.status = 'validated'
  ) then
    raise exception 'Rapprochement clôturé : réouvrez le jour pour le modifier.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."rapro_jour_cloture_fige"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."rapro_occupancy"("p_date" "date") RETURNS TABLE("room" integer, "adr" numeric, "manual_kind" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.room::int, b.adr, b.manual_kind
  from public.pdj_breakfasts b
  where b.service_date = p_date
    and (select private.page_level_rank(private.get_page_level('rapro'))) >= 1
$$;


ALTER FUNCTION "private"."rapro_occupancy"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."remove_page_permission"("p_user" "uuid", "p_page" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  delete from public.user_page_permissions where user_id = p_user and page = p_page;
end;
$$;


ALTER FUNCTION "private"."remove_page_permission"("p_user" "uuid", "p_page" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."repjour_manual_forecast_allowed"("p_year" integer, "p_month" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."repjour_manual_forecast_allowed"("p_year" integer, "p_month" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "private"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_user_grade"("p_user" "uuid", "p_grade" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  -- 2026-09-28 (set_user_grade_garde_null_2026-09-28.sql) : NULL-sûr ;
  -- `NULL not in (…)` sautait cette garde ET celle du dernier admin.
  if p_grade is null or p_grade not in ('admin', 'utilisateur') then
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
$$;


ALTER FUNCTION "private"."set_user_grade"("p_user" "uuid", "p_grade" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_password"("target_user_id" "uuid", "new_password" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.admin_update_password(target_user_id, new_password) $$;


ALTER FUNCTION "public"."admin_update_password"("target_user_id" "uuid", "new_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiche_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."affiche_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiche_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_at := now();
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."affiche_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."baby_cot_assignments_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."baby_cot_assignments_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."caisse_cautions_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.refunded_by := null;
    new.refunded_at := null;
  elsif tg_op = 'UPDATE' then
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.status = 'refunded' and old.status = 'active' then
      new.refunded_by := auth.uid();
      new.refunded_at := now();
    elsif new.status = 'active' and old.status = 'refunded' then
      -- Retour à 'active' (annulation d'un remboursement saisi par erreur) :
      -- on efface proprement la trace du remboursement précédent.
      new.refunded_by := null;
      new.refunded_at := null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."caisse_cautions_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."caisse_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."caisse_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."caisse_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.countersigned_by := null;                     -- jamais posée à la création
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else -- UPDATE
    new.created_by := private.keep_author(new.created_by, old.created_by);
    new.countersigned_by := private.keep_author(new.countersigned_by, old.countersigned_by); -- non réécrivable par le client
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := private.keep_author(new.validated_by, old.validated_by);
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."caisse_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classeur_merge_history_taille"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.taille := pg_column_size(new.snapshot);
  return new;
end;
$$;


ALTER FUNCTION "public"."classeur_merge_history_taille"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classeur_personnes"() RETURNS TABLE("id" "uuid", "prenom" "text", "nom" "text", "nom_affiche" "text", "niveau_page" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select * from private.classeur_personnes(); $$;


ALTER FUNCTION "public"."classeur_personnes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classeur_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- 2026-09-25 (classeur_stamp_updated_at_2026-09-25.sql) : un `updated_at`
  -- FOURNI par le client est respecté (fusion JSON : horodatage du fichier,
  -- règle « dernier écrit gagne ») ; sinon now(), comme avant.
  -- 2026-09-28 (classeur_securite_2026-09-28.sql) : jamais dans le futur
  -- (au-delà de 5 min de dérive d'horloge, ramené à now()).
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.updated_at is null then
      new.updated_at := now();
    end if;
    if new.created_at > now() + interval '5 minutes' then
      new.created_at := now();
    end if;
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.updated_at is not distinct from old.updated_at then
      new.updated_at := now();
    end if;
  end if;
  if new.updated_at > now() + interval '5 minutes' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."classeur_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."daily_reports_occ"("p_date" "date") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$ select private.daily_reports_occ(p_date) $$;


ALTER FUNCTION "public"."daily_reports_occ"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."daily_reports_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Utilisateur de l'app : l'auteur est TOUJOURS la session courante.
  -- Contexte système (Edge import-report, service_role) : valeur laissée telle quelle.
  if auth.uid() is not null then
    new.imported_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."daily_reports_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dismiss_send_reminder"("p_date" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Garde : niveau >= ecriture (rang 2) sur la page repjour. Doublon lisible de
  -- la policy UPDATE de daily_reports (qui refuserait de toute façon, en
  -- silence : 0 ligne mise à jour).
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
$$;


ALTER FUNCTION "public"."dismiss_send_reminder"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."easter_eggs_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."easter_eggs_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_budget_line_delete"("p_code" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_budget_line_delete(p_code) $$;


ALTER FUNCTION "public"."facturation_budget_line_delete"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer DEFAULT NULL::integer, "p_create" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_budget_line_upsert(p_code, p_label, p_category, p_hint, p_tags, p_sort, p_create) $$;


ALTER FUNCTION "public"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_budget_lines_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."facturation_budget_lines_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_codes_forget(p_issuer) $$;


ALTER FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_codes_forget(p_issuer, p_code) $$;


ALTER FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_codes_learn(p_issuer, p_codes) $$;


ALTER FUNCTION "public"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_codes_unlearn(p_issuer, p_codes) $$;


ALTER FUNCTION "public"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_delete"("p_name" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_delete(p_name) $$;


ALTER FUNCTION "public"."facturation_issuer_delete"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_denylist_add(p_issuer, p_code) $$;


ALTER FUNCTION "public"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_denylist_remove(p_issuer, p_code) $$;


ALTER FUNCTION "public"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_learn"("p_name" "text", "p_display" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_learn(p_name, p_display) $$;


ALTER FUNCTION "public"."facturation_issuer_learn"("p_name" "text", "p_display" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_merge(p_from_name, p_to_name, p_display) $$;


ALTER FUNCTION "public"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_rename(p_old_name, p_new_name, p_display) $$;


ALTER FUNCTION "public"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_issuer_unlearn"("p_name" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_issuer_unlearn(p_name) $$;


ALTER FUNCTION "public"."facturation_issuer_unlearn"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_learn_document(p_hash, p_issuer, p_display, p_codes, p_deltas, p_comptes, p_method) $$;


ALTER FUNCTION "public"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_learned_docs_delete"("p_hash" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_learned_docs_delete(p_hash) $$;


ALTER FUNCTION "public"."facturation_learned_docs_delete"("p_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_learned_docs_forget"("p_hash" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_learned_docs_forget(p_hash) $$;


ALTER FUNCTION "public"."facturation_learned_docs_forget"("p_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_learned_docs_record(p_hash, p_issuer, p_codes, p_deltas, p_method, p_comptes) $$;


ALTER FUNCTION "public"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_comptes_delete"("p_compte" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_ref_comptes_delete(p_compte) $$;


ALTER FUNCTION "public"."facturation_ref_comptes_delete"("p_compte" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_comptes_reimport"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_ref_comptes_reimport(p_rows) $$;


ALTER FUNCTION "public"."facturation_ref_comptes_reimport"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_comptes_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."facturation_ref_comptes_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_ref_comptes_upsert(p_compte, p_libelle) $$;


ALTER FUNCTION "public"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_delete"("p_code" "text", "p_compte" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_ref_delete(p_code, p_compte) $$;


ALTER FUNCTION "public"."facturation_ref_delete"("p_code" "text", "p_compte" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_imputations_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."facturation_ref_imputations_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_reimport"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_ref_reimport(p_rows) $$;


ALTER FUNCTION "public"."facturation_ref_reimport"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_reimport_replace"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_ref_reimport_replace(p_rows) $$;


ALTER FUNCTION "public"."facturation_ref_reimport_replace"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer DEFAULT NULL::integer, "p_create" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_ref_upsert(p_code, p_compte, p_section, p_libelle, p_description, p_sort, p_create) $$;


ALTER FUNCTION "public"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_wordpool_forget_code"("p_code" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_wordpool_forget_code(p_code) $$;


ALTER FUNCTION "public"."facturation_wordpool_forget_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_wordpool_learn(p_codes, p_deltas) $$;


ALTER FUNCTION "public"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_wordpool_prune"("p_min_count" integer DEFAULT 2, "p_top_k" integer DEFAULT 300) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_wordpool_prune(p_min_count, p_top_k) $$;


ALTER FUNCTION "public"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.facturation_wordpool_unlearn(p_codes, p_deltas) $$;


ALTER FUNCTION "public"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_access"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'permissions', coalesce(
      (select jsonb_agg(jsonb_build_object('page', u.page, 'level', u.level) order by u.page)
       from public.user_page_permissions u where u.user_id = auth.uid()),
      '[]'::jsonb)
  )
$$;


ALTER FUNCTION "public"."get_my_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hotel_rooms_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;


ALTER FUNCTION "public"."hotel_rooms_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."literie_sheets_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := private.keep_author(new.validated_by, old.validated_by);
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."literie_sheets_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parking_no_past_rewrite"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."parking_no_past_rewrite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parking_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."parking_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pdj_addon_production_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."pdj_addon_production_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pdj_clamp_breakfasts_included"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  -- Ligne manuelle (day-use / no-show) : valeur voulue par la saisie → on n'y touche pas.
  if new.manual_kind is not null then
    return new;
  end if;

  -- Ligne d'import : la règle fait foi, on recalcule depuis addons / rate_plan / adults.
  new.breakfasts_included := case
    when upper(coalesce(new.addons, '')) like '%PDJ%' then
      least(
        coalesce(
          (regexp_match(upper(coalesce(new.rate_plan, '')), '([0-9]+)[[:space:]]*PAX'))[1]::int,
          new.adults
        ),
        coalesce(new.adults, 0) + coalesce(new.children, 0),
        2
      )
    else 0
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."pdj_clamp_breakfasts_included"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pdj_externals_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."pdj_externals_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pdj_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."pdj_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pms_daily_metrics_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  new.imported_by := auth.uid();   -- l'appelant réel, à chaque écriture
  return new;
end;
$$;


ALTER FUNCTION "public"."pms_daily_metrics_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_self_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."prevent_self_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapro_occupancy"("p_date" "date") RETURNS TABLE("room" integer, "adr" numeric, "manual_kind" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$ select * from private.rapro_occupancy(p_date) $$;


ALTER FUNCTION "public"."rapro_occupancy"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapro_rooms_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := private.keep_author(new.created_by, old.created_by);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."rapro_rooms_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapro_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."rapro_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rapro_sheets_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else -- UPDATE
    new.created_by := private.keep_author(new.created_by, old.created_by);
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := private.keep_author(new.validated_by, old.validated_by);
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."rapro_sheets_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_page_permission"("p_user" "uuid", "p_page" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.remove_page_permission(p_user, p_page) $$;


ALTER FUNCTION "public"."remove_page_permission"("p_user" "uuid", "p_page" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."repjour_analytique_annuelle"("p_annee" integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with
  /* Dernier rapport importé de chaque mois. Le TypeScript gardait le PREMIER
     vu d'un tri `day_of_month desc` : rendu explicite. */
  derniers as (
    select distinct on (d.month) d.*
    from daily_reports d
    where d.year = p_annee
    order by d.month, d.day_of_month desc
  ),

  /* Nombre de jours porteurs + surcapacité côté RÉEL. */
  comptes as (
    select d.month,
           count(*)::int as jours,
           bool_or(d.rj_nuitees > 80) as depassement
    from daily_reports d
    where d.year = p_annee
    group by d.month
  ),

  /* Totaux + surcapacité côté PRÉVISION. */
  prevision as (
    /* Sommes rendues BRUTES (`int` et `numeric`), jamais en `double
       precision` : c'est ce qui les fait traverser `jsonb` sans perte. */
    select f.month,
           sum(f.occ)::int as total_occ_brut,
           sum(f.rev_ttc) as total_rev_brut,
           count(*)::int as jours,
           bool_or(f.occ > 80) as depassement
    from forecast_days f
    where f.year = p_annee
    group by f.month
  ),

  mois as (
    select
      m.mois,
      l.day_of_month, l.days_in_month,
      l.rmtd_nuitees, l.rmtd_room_revenue,
      l.pm_nuitees, l.pm_to, l.pm_pm, l.pm_revpar, l.pm_room_revenue,
      coalesce(c.jours, 0) as jours_rapport,
      p.total_occ_brut, p.total_rev_brut, coalesce(p.jours, 0) as jours_prevision,
      (coalesce(c.depassement, false) or coalesce(p.depassement, false))
        as depassement,
      /* `days_in_month` de la base, repli calendrier — comme le TypeScript.
         Vérifié : zéro ligne où les deux divergent. */
      coalesce(
        l.days_in_month,
        extract(day from (
          make_date(p_annee, m.mois, 1) + interval '1 month - 1 day'
        ))::int
      )::int as jours_du_mois,
      (l.id is not null and coalesce(c.jours, 0) > 0) as a_rapport
    from generate_series(1, 12) as m(mois)
    left join derniers  l on l.month = m.mois
    left join comptes   c on c.month = m.mois
    left join prevision p on p.month = m.mois
  )

  select jsonb_build_object(

    -- fetchBudgetYears() — années distinctes, CROISSANT. Repli client inchangé.
    'annees', coalesce((
      select jsonb_agg(distinct b.year order by b.year) from budget b
    ), '[]'::jsonb),

    -- fetchYearBudget(annee) — tous les mois, triés.
    'budgets', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.month)
      from budget b where b.year = p_annee
    ), '[]'::jsonb),

    /* fetchYearAnalytics(annee) — TOUJOURS 12 lignes.
     *
     * ⚠ On rend les valeurs BRUTES, pas les indicateurs calculés. Le calcul de
     * `to`, `pm` et `revpar` reste en TypeScript, et c'est délibéré :
     *
     *   1. EXACTITUDE AU BIT PRÈS. `jsonb` n'a pas de type flottant — il range
     *      les nombres en `numeric`. Un `double precision` calculé ici perdrait
     *      ses derniers bits à la sérialisation. Mesuré le 2026-09-23 sur une
     *      première version qui calculait en SQL : 31 écarts sur 108 champs,
     *      tous de l'ordre de 1e-13 (ex. `pm` 112,2842944785276 contre
     *      112,284294478528). Invisibles à l'écran, mais ils interdisaient de
     *      prouver l'équivalence — et une preuve à « presque zéro écart » n'est
     *      pas une preuve.
     *   2. UNE SEULE SOURCE DE VÉRITÉ. Les formules restent à un seul endroit.
     *      `TOTAL_ROOMS` ne se retrouve pas figé dans deux langages.
     *
     * La RPC décide donc de la SOURCE (c'est de la sélection de données, sa
     * raison d'être) et livre les entrées ; le TypeScript garde l'arithmétique.
     */
    'mois', (
      select jsonb_agg(
        case
          -- 1. Rapports présents, mois COMPLET -> réalisé (RMTD).
          when x.a_rapport and x.day_of_month = x.days_in_month then
            jsonb_build_object(
              'month', x.mois, 'source', 'realise',
              'nuitees', x.rmtd_nuitees,
              'revenue', x.rmtd_room_revenue,
              'joursDuMois', x.jours_du_mois::int,
              'daysWithData', x.jours_rapport,
              'hasOvercapacity', x.depassement
            )
          -- 2. Rapports présents, mois INCOMPLET -> projeté (PM, TEL QUEL).
          --    Ces quatre valeurs sont REPRISES sans aucun recalcul.
          when x.a_rapport then
            jsonb_build_object(
              'month', x.mois, 'source', 'projete',
              'nuitees', x.pm_nuitees,
              'revenue', x.pm_room_revenue,
              'pmTo', x.pm_to, 'pmPm', x.pm_pm, 'pmRevpar', x.pm_revpar,
              'joursDuMois', x.jours_du_mois::int,
              'daysWithData', x.jours_rapport,
              'hasOvercapacity', x.depassement
            )
          -- 3. Aucun rapport mais des prévisions.
          when x.jours_prevision > 0 then
            jsonb_build_object(
              'month', x.mois, 'source', 'forecast',
              'nuitees', x.total_occ_brut,
              'revenue', x.total_rev_brut,
              'joursDuMois', x.jours_du_mois::int,
              'daysWithData', x.jours_prevision,
              'hasOvercapacity', x.depassement
            )
          -- 4. Vide. SEULE branche qui force `hasOvercapacity` à false.
          else
            jsonb_build_object(
              'month', x.mois, 'source', 'vide',
              'nuitees', 0, 'revenue', 0,
              'joursDuMois', x.jours_du_mois::int,
              'daysWithData', 0,
              'hasOvercapacity', false
            )
        end
        order by x.mois
      )
      from mois x
    )
  )
$$;


ALTER FUNCTION "public"."repjour_analytique_annuelle"("p_annee" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."repjour_analytique_annuelle"("p_annee" integer) IS 'Analytique annuelle RepJour en un seul aller-retour : années disponibles, douze mois agrégés, budgets. Remplace quatre lectures et supprime une cascade. security invoker : les RLS s''appliquent à l''appelant.';



CREATE OR REPLACE FUNCTION "public"."repjour_analytique_mensuelle"("p_annee" integer, "p_mois" integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with bornes as (
    select
      make_date(p_annee, p_mois, 1) as premier,
      (make_date(p_annee, p_mois, 1) + interval '1 month - 1 day')::date as dernier
  )
  select jsonb_build_object(

    /* fetchUnifiedDays({annee, mois}) — TOUS les jours du mois, `report` et
       `forecast` à null quand absents. C'est ce qui interdit la division par
       zéro sur `rows.length` côté composant. */
    'jours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date',     to_char(j.jour, 'YYYY-MM-DD'),
          'month',    p_mois,
          'year',     p_annee,
          'report',   (select to_jsonb(d) from daily_reports d
                        where d.date = j.jour),
          'forecast', (select to_jsonb(f) from forecast_days f
                        where f.date = j.jour)
        )
        order by j.jour
      )
      from bornes b,
           generate_series(b.premier, b.dernier, interval '1 day') as j(jour)
    ), '[]'::jsonb),

    -- fetchBudget(annee, mois) — null si le mois n'a pas de budget.
    'budget', (
      select to_jsonb(b) from budget b
      where b.year = p_annee and b.month = p_mois
    ),

    /* Remplace fetchAvailableDates(), qui rapatriait jusqu'à 5 000 dates pour
       n'en exploiter QU'UNE : la plus ancienne, qui borne le chevron
       « précédent ». `null` si la table est vide — le composant distingue ce
       cas de « en vol ». */
    'premiereDate', (select to_char(min(d.date), 'YYYY-MM-DD') from daily_reports d)
  )
$$;


ALTER FUNCTION "public"."repjour_analytique_mensuelle"("p_annee" integer, "p_mois" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."repjour_analytique_mensuelle"("p_annee" integer, "p_mois" integer) IS 'Analytique mensuelle RepJour en un seul aller-retour : tous les jours du mois (rapport + prévision), budget, première date connue. Remplace quatre lectures. security invoker : les RLS s''appliquent à l''appelant.';



CREATE OR REPLACE FUNCTION "public"."repjour_dashboard"("p_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with reperes as (
    select
      extract(year  from p_date)::int as an,
      extract(month from p_date)::int as mois
  )
  select jsonb_build_object(

    -- fetchReportByDate(date)
    'rapport', (
      select to_jsonb(d) from daily_reports d where d.date = p_date
    ),

    -- fetchBudget(year, month)
    'budget', (
      select to_jsonb(b) from budget b, reperes r
      where b.year = r.an and b.month = r.mois
    ),

    -- fetchForecastMonthTotal(year, month) — null si AUCUNE prévision du mois.
    'forecastTotal', (
      select case when count(*) = 0 then null else jsonb_build_object(
        'occ', coalesce(sum(f.occ), 0),
        'revTTC', coalesce(sum(f.rev_ttc), 0)
      ) end
      from forecast_days f, reperes r
      where f.year = r.an and f.month = r.mois
    ),

    -- fetchForecastFreshness(year, month) — les NULL sont ignorés.
    'forecastFraicheur', (
      select max(f.imported_at)
      from forecast_days f, reperes r
      where f.year = r.an and f.month = r.mois and f.imported_at is not null
    ),

    -- fetchLatestReportOfMonth(year, month)
    'dernierDuMois', (
      select to_jsonb(d) from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois
      order by d.day_of_month desc limit 1
    ),

    -- fetchPreviousReportInMonth(date, year, month) — borné au MÊME mois.
    'rapportPrecedent', (
      select to_jsonb(d) from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois and d.date < p_date
      order by d.date desc limit 1
    ),

    -- fetchMonthReports(year, month)
    'rapportsDuMois', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day_of_month)
      from daily_reports d, reperes r
      where d.year = r.an and d.month = r.mois
    ), '[]'::jsonb),

    -- fetchAvailableDates() — plafond explicite, cf. AVAILABLE_DATES_MAX.
    'datesDisponibles', coalesce((
      select jsonb_agg(x.date order by x.date desc)
      from (
        select d.date from daily_reports d
        order by d.date desc limit 5000
      ) x
    ), '[]'::jsonb)
  )
  from reperes;
$$;


ALTER FUNCTION "public"."repjour_dashboard"("p_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."repjour_dashboard"("p_date" "date") IS 'Tableau de bord RepJour d''un jour donné, en un seul aller-retour. Remplace huit lectures (13,8 ms mesurés, 17 ko). security invoker : les RLS de daily_reports / budget / forecast_days s''appliquent à l''appelant.';



CREATE OR REPLACE FUNCTION "public"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.set_page_permission(p_user, p_page, p_level) $$;


ALTER FUNCTION "public"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_grade"("p_user" "uuid", "p_grade" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select private.set_user_grade(p_user, p_grade) $$;


ALTER FUNCTION "public"."set_user_grade"("p_user" "uuid", "p_grade" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."affiche_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "icon" "text" DEFAULT 'alert'::"text" NOT NULL,
    "color" "text" DEFAULT 'okko'::"text" NOT NULL,
    "title_fr" "text" DEFAULT ''::"text" NOT NULL,
    "message_fr" "text" DEFAULT ''::"text" NOT NULL,
    "title_en" "text" DEFAULT ''::"text" NOT NULL,
    "message_en" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "date_start" "text" DEFAULT ''::"text" NOT NULL,
    "date_end" "text" DEFAULT ''::"text" NOT NULL,
    "time_start" "text" DEFAULT ''::"text" NOT NULL,
    "time_end" "text" DEFAULT ''::"text" NOT NULL,
    "is_auto_size_mode" boolean DEFAULT true NOT NULL,
    "font_size_icon" integer DEFAULT 140 NOT NULL,
    "font_size_title" integer DEFAULT 56 NOT NULL,
    "font_size_message" integer DEFAULT 26 NOT NULL,
    "font_size_info" integer DEFAULT 18 NOT NULL,
    "gap" integer DEFAULT 25 NOT NULL,
    CONSTRAINT "affiche_templates_color_check" CHECK (("color" = ANY (ARRAY['bw'::"text", 'okko'::"text", 'red'::"text", 'blue'::"text", 'yellow'::"text"]))),
    CONSTRAINT "affiche_templates_icon_check" CHECK (("icon" = ANY (ARRAY['none'::"text", 'alert'::"text", 'droplet'::"text", 'zap'::"text", 'key'::"text", 'fire_alarm'::"text", 'power_outage'::"text", 'wet_paint'::"text", 'toilet_out'::"text", 'phone_out'::"text", 'coffee'::"text", 'iron'::"text", 'kettle'::"text", 'no_smoking'::"text", 'door_closed'::"text", 'fire_extinguisher'::"text", 'flame'::"text", 'flood'::"text", 'elevator'::"text", 'cleaning'::"text", 'tv'::"text", 'table'::"text", 'dumbbell'::"text", 'stairs'::"text", 'parking'::"text", 'bus'::"text", 'bike'::"text", 'briefcase'::"text", 'calendar'::"text", 'wine'::"text", 'glass_water'::"text", 'shower'::"text", 'tea'::"text", 'martini'::"text", 'fork_knife'::"text", 'cup_saucer'::"text", 'bottle'::"text", 'salad'::"text", 'concierge_bell'::"text"])))
);


ALTER TABLE "public"."affiche_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" integer NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['admin_password_reset'::"text", 'DELETE'::"text", 'INSERT'::"text", 'set_user_grade'::"text", 'UPDATE'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."baby_cot_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cot_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "baby_cot_assignments_check" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."baby_cot_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."baby_cots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."baby_cots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget" (
    "id" integer NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "nuitees" integer NOT NULL,
    "taux_occupation" numeric(5,2) NOT NULL,
    "prix_moyen" numeric(10,2) NOT NULL,
    "revpar" numeric(10,2) NOT NULL,
    "room_revenue" numeric(12,2) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "budget_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);


ALTER TABLE "public"."budget" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."budget_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."budget_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."budget_id_seq" OWNED BY "public"."budget"."id";



CREATE TABLE IF NOT EXISTS "public"."caisse_cautions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room" smallint NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "taken_date" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "refunded_date" "date",
    "refunded_by" "uuid",
    "refunded_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "caisse_cautions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "caisse_cautions_check" CHECK (((("status" = 'refunded'::"text") AND ("refunded_date" IS NOT NULL) AND ("refunded_by" IS NOT NULL) AND ("refunded_at" IS NOT NULL)) OR (("status" = 'active'::"text") AND ("refunded_date" IS NULL) AND ("refunded_by" IS NULL) AND ("refunded_at" IS NULL)))),
    CONSTRAINT "caisse_cautions_check1" CHECK ((("refunded_date" IS NULL) OR ("refunded_date" >= "taken_date"))),
    CONSTRAINT "caisse_cautions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."caisse_cautions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."caisse_sheets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "shift" "text" NOT NULL,
    "operator_initials" "text" DEFAULT ''::"text" NOT NULL,
    "snt_cash" numeric(10,2) DEFAULT 0 NOT NULL,
    "snt_cb" numeric(10,2) DEFAULT 0 NOT NULL,
    "snt_cvac" numeric(10,2) DEFAULT 0 NOT NULL,
    "snt_cbweb" numeric(10,2) DEFAULT 0 NOT NULL,
    "ls_cash" numeric(10,2) DEFAULT 0 NOT NULL,
    "ls_cb" numeric(10,2) DEFAULT 0 NOT NULL,
    "ls_cvac" numeric(10,2) DEFAULT 0 NOT NULL,
    "caisse_cash" numeric(10,2) DEFAULT 0 NOT NULL,
    "caisse_cb" numeric(10,2) DEFAULT 0 NOT NULL,
    "caisse_cvac" numeric(10,2) DEFAULT 0 NOT NULL,
    "caisse_adyen" numeric(10,2) DEFAULT 0 NOT NULL,
    "cnt_500" smallint DEFAULT 0 NOT NULL,
    "cnt_200" smallint DEFAULT 0 NOT NULL,
    "cnt_100" smallint DEFAULT 0 NOT NULL,
    "cnt_50" smallint DEFAULT 0 NOT NULL,
    "cnt_20" smallint DEFAULT 0 NOT NULL,
    "cnt_10" smallint DEFAULT 0 NOT NULL,
    "cnt_5" smallint DEFAULT 0 NOT NULL,
    "cnt_2" smallint DEFAULT 0 NOT NULL,
    "cnt_1" smallint DEFAULT 0 NOT NULL,
    "cnt_050" smallint DEFAULT 0 NOT NULL,
    "cnt_020" smallint DEFAULT 0 NOT NULL,
    "cnt_010" smallint DEFAULT 0 NOT NULL,
    "cnt_005" smallint DEFAULT 0 NOT NULL,
    "cnt_002" smallint DEFAULT 0 NOT NULL,
    "cnt_001" smallint DEFAULT 0 NOT NULL,
    "fund_origin" numeric(10,2) DEFAULT 150 NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "validated_at" timestamp with time zone,
    "validated_by" "uuid",
    "countersigned_by" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "caisse_sheets_shift_check" CHECK (("shift" = ANY (ARRAY['matin'::"text", 'soir'::"text", 'nuit'::"text"]))),
    CONSTRAINT "caisse_sheets_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'validated'::"text"])))
);


ALTER TABLE "public"."caisse_sheets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classeur_acces" (
    "id" bigint NOT NULL,
    "classeur_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "niveau" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "classeur_acces_niveau_check" CHECK (("niveau" = ANY (ARRAY['aucun'::"text", 'lecture'::"text", 'ecriture'::"text"])))
);


ALTER TABLE "public"."classeur_acces" OWNER TO "postgres";


ALTER TABLE "public"."classeur_acces" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_acces_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_chapters" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classeur_id" bigint NOT NULL,
    "label" "text" NOT NULL,
    "icon" "text" DEFAULT 'FileText'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."classeur_chapters" OWNER TO "postgres";


ALTER TABLE "public"."classeur_chapters" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_chapters_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_classeurs" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'Mon classeur'::"text" NOT NULL,
    "icon" "text" DEFAULT 'BookOpen'::"text" NOT NULL,
    "etablissement" "text" DEFAULT ''::"text" NOT NULL,
    "etablissement_complement" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "acces_tous" "text" DEFAULT 'lecture'::"text" NOT NULL,
    CONSTRAINT "classeur_classeurs_acces_tous_check" CHECK (("acces_tous" = ANY (ARRAY['aucun'::"text", 'lecture'::"text", 'ecriture'::"text"])))
);


ALTER TABLE "public"."classeur_classeurs" OWNER TO "postgres";


ALTER TABLE "public"."classeur_classeurs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_classeurs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_document_versions" (
    "id" bigint NOT NULL,
    "document_id" bigint NOT NULL,
    "classeur_id" bigint NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "origine" "text" DEFAULT 'enregistrement'::"text" NOT NULL,
    "auteur" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" "text" DEFAULT ''::"text" NOT NULL,
    "raison" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "classeur_document_versions_origine_check" CHECK (("origine" = ANY (ARRAY['creation'::"text", 'enregistrement'::"text", 'etat_initial'::"text"]))),
    CONSTRAINT "classeur_document_versions_version_check" CHECK ((("char_length"("version") <= 20) AND ("char_length"("raison") <= 300)))
);


ALTER TABLE "public"."classeur_document_versions" OWNER TO "postgres";


ALTER TABLE "public"."classeur_document_versions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_document_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_documents" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chapter_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "version_majeure" integer DEFAULT 1 NOT NULL,
    "version_mineure" integer DEFAULT 0 NOT NULL,
    "version_raison" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "classeur_documents_version_check" CHECK (((("version_majeure" >= 1) AND ("version_majeure" <= 9999)) AND (("version_mineure" >= 0) AND ("version_mineure" <= 9999)) AND ("char_length"("version_raison") <= 300)))
);


ALTER TABLE "public"."classeur_documents" OWNER TO "postgres";


ALTER TABLE "public"."classeur_documents" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_images" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classeur_id" bigint NOT NULL,
    "chemin" "text" NOT NULL,
    "nom" "text" DEFAULT ''::"text" NOT NULL,
    "taille" integer DEFAULT 0 NOT NULL,
    "largeur" integer DEFAULT 0 NOT NULL,
    "hauteur" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "original_chemin" "text",
    "original_largeur" integer,
    "original_hauteur" integer,
    "original_taille" integer,
    CONSTRAINT "classeur_images_chemin_check" CHECK (("chemin" ~ '^[0-9]{1,12}/[0-9a-f-]{36}\.webp$'::"text")),
    CONSTRAINT "classeur_images_chemin_du_classeur" CHECK (("split_part"("chemin", '/'::"text", 1) = ("classeur_id")::"text")),
    CONSTRAINT "classeur_images_hauteur_check" CHECK (("hauteur" >= 0)),
    CONSTRAINT "classeur_images_largeur_check" CHECK (("largeur" >= 0)),
    CONSTRAINT "classeur_images_original_chemin_check" CHECK ((("original_chemin" IS NULL) OR (("original_chemin" ~ '^[0-9]{1,12}/[0-9a-f-]{36}\.original\.webp$'::"text") AND ("split_part"("original_chemin", '/'::"text", 1) = ("classeur_id")::"text")))),
    CONSTRAINT "classeur_images_original_dims_check" CHECK (((("original_largeur" IS NULL) OR ("original_largeur" >= 0)) AND (("original_hauteur" IS NULL) OR ("original_hauteur" >= 0)) AND (("original_taille" IS NULL) OR ("original_taille" >= 0)))),
    CONSTRAINT "classeur_images_taille_check" CHECK (("taille" >= 0))
);


ALTER TABLE "public"."classeur_images" OWNER TO "postgres";


ALTER TABLE "public"."classeur_images" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_images_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_intercalaires" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chapter_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."classeur_intercalaires" OWNER TO "postgres";


ALTER TABLE "public"."classeur_intercalaires" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_intercalaires_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_merge_history" (
    "id" bigint NOT NULL,
    "classeur_id" bigint NOT NULL,
    "merged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_name" "text" DEFAULT ''::"text" NOT NULL,
    "inserted" integer DEFAULT 0 NOT NULL,
    "updated" integer DEFAULT 0 NOT NULL,
    "unchanged" integer DEFAULT 0 NOT NULL,
    "skipped" integer DEFAULT 0 NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "kind" "text" DEFAULT 'fusion'::"text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "taille" integer,
    CONSTRAINT "classeur_merge_history_kind_check" CHECK (("kind" = ANY (ARRAY['auto'::"text", 'manuel'::"text", 'fusion'::"text", 'securite'::"text"])))
);


ALTER TABLE "public"."classeur_merge_history" OWNER TO "postgres";


COMMENT ON COLUMN "public"."classeur_merge_history"."kind" IS 'auto = point mineur pris avant une session de modifications ; manuel = point majeur nommé ; fusion = avant un import JSON ; securite = avant une restauration';



COMMENT ON COLUMN "public"."classeur_merge_history"."taille" IS 'pg_column_size(snapshot) en octets, posé par trigger à l''insertion';



ALTER TABLE "public"."classeur_merge_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_merge_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_periodicites" (
    "id" bigint NOT NULL,
    "label" "text" NOT NULL,
    "nombre" integer DEFAULT 8 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."classeur_periodicites" OWNER TO "postgres";


ALTER TABLE "public"."classeur_periodicites" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_periodicites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_signature_sheets" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chapter_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "nombre" integer DEFAULT 14 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "classeur_signature_sheets_nombre_check" CHECK ((("nombre" >= 1) AND ("nombre" <= 60)))
);


ALTER TABLE "public"."classeur_signature_sheets" OWNER TO "postgres";


ALTER TABLE "public"."classeur_signature_sheets" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_signature_sheets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."classeur_tracking_sheets" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chapter_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "periodicite_id" bigint NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."classeur_tracking_sheets" OWNER TO "postgres";


ALTER TABLE "public"."classeur_tracking_sheets" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."classeur_tracking_sheets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."daily_reports" (
    "id" integer NOT NULL,
    "date" "date" NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "day_of_month" integer NOT NULL,
    "days_in_month" integer NOT NULL,
    "rj_nuitees" integer NOT NULL,
    "rj_to" numeric(5,2) NOT NULL,
    "rj_pm" numeric(10,2) NOT NULL,
    "rj_revpar" numeric(10,2) NOT NULL,
    "rj_room_revenue" numeric(12,2) NOT NULL,
    "rmtd_nuitees" integer NOT NULL,
    "rmtd_to" numeric(5,2) NOT NULL,
    "rmtd_pm" numeric(10,2) NOT NULL,
    "rmtd_revpar" numeric(10,2) NOT NULL,
    "rmtd_room_revenue" numeric(12,2) NOT NULL,
    "pm_nuitees" integer NOT NULL,
    "pm_to" numeric(5,2) NOT NULL,
    "pm_pm" numeric(10,2) NOT NULL,
    "pm_revpar" numeric(10,2) NOT NULL,
    "pm_room_revenue" numeric(12,2) NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "imported_by" "uuid",
    "alerts" "jsonb" DEFAULT '[]'::"jsonb",
    "auto_sent_at" timestamp with time zone,
    "send_reminder_dismissed_at" timestamp with time zone
);


ALTER TABLE "public"."daily_reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."daily_reports"."auto_sent_at" IS 'Horodatage de l''envoi AUTOMATIQUE du rapport par e-mail (Resend). NULL = pas encore envoyé automatiquement. Posé atomiquement par l''Edge Function import-report pour garantir un envoi auto unique par date. L''envoi manuel (admin) ne le consulte pas.';



CREATE SEQUENCE IF NOT EXISTS "public"."daily_reports_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_reports_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_reports_id_seq" OWNED BY "public"."daily_reports"."id";



CREATE TABLE IF NOT EXISTS "public"."easter_eggs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "keyword" "text" NOT NULL,
    "effect_id" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."easter_eggs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_budget_lines" (
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "category" "text" NOT NULL,
    "hint" "text" DEFAULT ''::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facturation_budget_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_issuer_codes" (
    "issuer" "text" NOT NULL,
    "code" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "facturation_issuer_codes_count_check" CHECK (("count" >= 0))
);


ALTER TABLE "public"."facturation_issuer_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_issuer_denylist" (
    "issuer" "text" NOT NULL,
    "code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facturation_issuer_denylist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_learned_docs" (
    "hash" "text" NOT NULL,
    "issuer" "text",
    "codes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "deltas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "method" "text" DEFAULT 'native'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comptes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."facturation_learned_docs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."facturation_issuer_memory" WITH ("security_invoker"='true') AS
 SELECT "d"."issuer",
    "c"."code" AS "code_analytique",
    COALESCE(("d"."comptes" ->> "c"."code"), ''::"text") AS "compte",
    ("count"(*))::integer AS "n"
   FROM "public"."facturation_learned_docs" "d",
    LATERAL "unnest"("d"."codes") "c"("code")
  WHERE ("d"."issuer" IS NOT NULL)
  GROUP BY "d"."issuer", "c"."code", COALESCE(("d"."comptes" ->> "c"."code"), ''::"text");


ALTER VIEW "public"."facturation_issuer_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_issuers" (
    "name" "text" NOT NULL,
    "display" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facturation_issuers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_ref_comptes" (
    "compte" "text" NOT NULL,
    "libelle" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facturation_ref_comptes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_ref_imputations" (
    "code_analytique" "text" NOT NULL,
    "compte" "text" NOT NULL,
    "section" "text" DEFAULT ''::"text" NOT NULL,
    "libelle" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facturation_ref_imputations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturation_wordpool" (
    "code" "text" NOT NULL,
    "token" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "facturation_wordpool_count_nonneg" CHECK (("count" >= 0))
);


ALTER TABLE "public"."facturation_wordpool" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forecast_days" (
    "id" integer NOT NULL,
    "date" "date" NOT NULL,
    "month" integer NOT NULL,
    "year" integer NOT NULL,
    "occ" integer NOT NULL,
    "rev_ht" numeric(12,2) NOT NULL,
    "rev_ttc" numeric(12,2) NOT NULL,
    "adr_ttc" numeric(10,2) NOT NULL,
    "occ_percent" numeric(5,2) NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forecast_days" OWNER TO "postgres";


COMMENT ON COLUMN "public"."forecast_days"."imported_at" IS 'Horodatage du dernier import réussi de cette ligne (posé par import-report). Sert à juger la fraîcheur du Forecast pour l''envoi auto RepJour (cycle 02h).';



CREATE SEQUENCE IF NOT EXISTS "public"."forecast_days_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."forecast_days_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."forecast_days_id_seq" OWNED BY "public"."forecast_days"."id";



CREATE TABLE IF NOT EXISTS "public"."hotel_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "name" "text" DEFAULT 'OKKO Hotels Nantes Château'::"text" NOT NULL,
    "code" "text" DEFAULT '4401'::"text" NOT NULL,
    "total_rooms" integer DEFAULT 80 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hotel_config_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."hotel_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hotel_rooms" (
    "room" smallint NOT NULL,
    "literie_synthetique" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."hotel_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."literie_sheets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "validated_at" timestamp with time zone,
    "validated_by" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "literie_sheets_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'validated'::"text"])))
);


ALTER TABLE "public"."literie_sheets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."literie_stock" (
    "id" smallint DEFAULT 1 NOT NULL,
    "synthetic_pillows" integer DEFAULT 0 NOT NULL,
    "synthetic_duvets" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "literie_stock_id_check" CHECK (("id" = 1)),
    CONSTRAINT "literie_stock_synthetic_duvets_check" CHECK (("synthetic_duvets" >= 0)),
    CONSTRAINT "literie_stock_synthetic_pillows_check" CHECK (("synthetic_pillows" >= 0))
);


ALTER TABLE "public"."literie_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."literie_stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room" smallint NOT NULL,
    "item" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "quantity" smallint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "literie_stock_movements_direction_check" CHECK (("direction" = ANY (ARRAY['mise_en_place'::"text", 'retour'::"text"]))),
    CONSTRAINT "literie_stock_movements_item_check" CHECK (("item" = ANY (ARRAY['oreiller'::"text", 'couette'::"text"]))),
    CONSTRAINT "literie_stock_movements_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."literie_stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parking_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spot" smallint NOT NULL,
    "client" "text" DEFAULT ''::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "nights" smallint DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'reserve'::"text" NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parking_reservations_nights_check" CHECK (("nights" >= 1)),
    CONSTRAINT "parking_reservations_spot_check" CHECK ((("spot" >= 1) AND ("spot" <= 14))),
    CONSTRAINT "parking_reservations_status_check" CHECK (("status" = ANY (ARRAY['reserve'::"text", 'paye'::"text", 'checkout'::"text", 'employe'::"text", 'gratuite'::"text"])))
);


ALTER TABLE "public"."parking_reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parking_tarifs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_ttc" numeric(10,2) NOT NULL,
    "vat_rate" numeric(5,2) NOT NULL,
    "effective_from" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parking_tarifs_price_ttc_check" CHECK (("price_ttc" > (0)::numeric)),
    CONSTRAINT "parking_tarifs_vat_rate_check" CHECK ((("vat_rate" >= (0)::numeric) AND ("vat_rate" < (100)::numeric)))
);


ALTER TABLE "public"."parking_tarifs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."parking_arrivals_agg" WITH ("security_invoker"='true') AS
 SELECT ("r"."start_date")::"text" AS "start_date",
    ("count"(*))::integer AS "reservations",
    (COALESCE("sum"("r"."nights"), (0)::bigint))::integer AS "nights",
    (COALESCE("sum"("r"."nights") FILTER (WHERE ("r"."spot" < 13)), (0)::bigint))::integer AS "client_nights",
    ("count"(*) FILTER (WHERE ("r"."status" = 'paye'::"text")))::integer AS "paid",
    ("count"(*) FILTER (WHERE ("r"."status" = 'reserve'::"text")))::integer AS "reserved",
    ("count"(*) FILTER (WHERE ("r"."status" = 'checkout'::"text")))::integer AS "unpaid",
    ("count"(*) FILTER (WHERE ("r"."status" = 'gratuite'::"text")))::integer AS "free",
    (COALESCE("sum"("r"."nights") FILTER (WHERE ("r"."status" = 'gratuite'::"text")), (0)::bigint))::integer AS "free_nights",
    (COALESCE("sum"(((("r"."nights")::numeric * "t"."price_ttc") / ((1)::numeric + ("t"."vat_rate" / 100.0)))) FILTER (WHERE ("r"."status" = ANY (ARRAY['reserve'::"text", 'paye'::"text", 'checkout'::"text"]))), (0)::numeric))::numeric(12,2) AS "ca_ht",
    (COALESCE("sum"((("r"."nights")::numeric * "t"."price_ttc")) FILTER (WHERE ("r"."status" = ANY (ARRAY['reserve'::"text", 'paye'::"text", 'checkout'::"text"]))), (0)::numeric))::numeric(12,2) AS "ca_ttc"
   FROM ("public"."parking_reservations" "r"
     LEFT JOIN LATERAL ( SELECT "parking_tarifs"."price_ttc",
            "parking_tarifs"."vat_rate"
           FROM "public"."parking_tarifs"
          WHERE ("parking_tarifs"."effective_from" <= "r"."start_date")
          ORDER BY "parking_tarifs"."effective_from" DESC
         LIMIT 1) "t" ON (true))
  WHERE ("r"."status" <> 'employe'::"text")
  GROUP BY "r"."start_date";


ALTER VIEW "public"."parking_arrivals_agg" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."parking_daily_occupation" WITH ("security_invoker"='true') AS
 WITH "expanded" AS (
         SELECT "parking_reservations"."spot",
            "parking_reservations"."status",
            ("generate_series"(("parking_reservations"."start_date")::timestamp with time zone, (("parking_reservations"."start_date" + ("parking_reservations"."nights" - 1)))::timestamp with time zone, '1 day'::interval))::"date" AS "day"
           FROM "public"."parking_reservations"
          WHERE (("parking_reservations"."nights" >= 1) AND ("parking_reservations"."status" <> 'employe'::"text"))
        ), "occ" AS (
         SELECT "expanded"."day",
            ("count"(DISTINCT "expanded"."spot"))::integer AS "occupied",
            ("count"(DISTINCT "expanded"."spot") FILTER (WHERE ("expanded"."spot" < 13)))::integer AS "occupied_client",
            ("count"(DISTINCT "expanded"."spot") FILTER (WHERE ("expanded"."status" = 'gratuite'::"text")))::integer AS "occupied_free"
           FROM "expanded"
          GROUP BY "expanded"."day"
        ), "arr" AS (
         SELECT "parking_reservations"."start_date" AS "day",
            ("count"(*))::integer AS "arrivals"
           FROM "public"."parking_reservations"
          WHERE ("parking_reservations"."status" <> 'employe'::"text")
          GROUP BY "parking_reservations"."start_date"
        ), "dep" AS (
         SELECT ("parking_reservations"."start_date" + ("parking_reservations"."nights")::integer) AS "day",
            ("count"(*))::integer AS "departures"
           FROM "public"."parking_reservations"
          WHERE ("parking_reservations"."status" <> 'employe'::"text")
          GROUP BY ("parking_reservations"."start_date" + ("parking_reservations"."nights")::integer)
        ), "spine" AS (
         SELECT "occ_1"."day"
           FROM "occ" "occ_1"
        UNION
         SELECT "arr_1"."day"
           FROM "arr" "arr_1"
        UNION
         SELECT "dep_1"."day"
           FROM "dep" "dep_1"
        )
 SELECT ("s"."day")::"text" AS "date",
    COALESCE("occ"."occupied", 0) AS "occupied",
    COALESCE("occ"."occupied_client", 0) AS "occupied_client",
    COALESCE("arr"."arrivals", 0) AS "arrivals",
    COALESCE("dep"."departures", 0) AS "departures",
    COALESCE("occ"."occupied_free", 0) AS "occupied_free"
   FROM ((("spine" "s"
     LEFT JOIN "occ" ON (("occ"."day" = "s"."day")))
     LEFT JOIN "arr" ON (("arr"."day" = "s"."day")))
     LEFT JOIN "dep" ON (("dep"."day" = "s"."day")));


ALTER VIEW "public"."parking_daily_occupation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pdj_addon_production" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_date" "date" NOT NULL,
    "code" "text" NOT NULL,
    "total_count" integer DEFAULT 0 NOT NULL,
    "revenue_ttc" numeric(12,2) DEFAULT 0 NOT NULL,
    "source_file" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pdj_addon_production" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pdj_breakfasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_date" "date" NOT NULL,
    "room" smallint NOT NULL,
    "guest_name" "text",
    "status" "text" DEFAULT ''::"text" NOT NULL,
    "vip" boolean DEFAULT false NOT NULL,
    "adults" smallint DEFAULT 0 NOT NULL,
    "children" smallint DEFAULT 0 NOT NULL,
    "guests" smallint DEFAULT 0 NOT NULL,
    "no_of_nights" smallint,
    "room_type" "text",
    "rate_plan" "text",
    "channel" "text",
    "company" "text",
    "guarantee" "text",
    "payment_type" "text",
    "addons" "text",
    "adr" numeric(8,2),
    "arrival_date" "date",
    "departure_date" "date",
    "stay_count" smallint DEFAULT 0 NOT NULL,
    "breakfasts_included" smallint DEFAULT 0 NOT NULL,
    "breakfasts_served" smallint DEFAULT 0 NOT NULL,
    "served" boolean DEFAULT false NOT NULL,
    "source_file" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purged_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "manual_kind" "text",
    "breakfasts_offert" smallint DEFAULT 0 NOT NULL,
    CONSTRAINT "pdj_breakfasts_breakfasts_offert_check" CHECK (("breakfasts_offert" >= 0)),
    CONSTRAINT "pdj_breakfasts_manual_kind_check" CHECK ((("manual_kind" IS NULL) OR ("manual_kind" = ANY (ARRAY['inclus'::"text", 'extra'::"text", 'offert'::"text"]))))
);


ALTER TABLE "public"."pdj_breakfasts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pdj_daily_agg" WITH ("security_invoker"='true') AS
 WITH "chambres" AS NOT MATERIALIZED (
         SELECT "t"."service_date",
            "t"."code",
            ("count"(*))::integer AS "rooms",
            (COALESCE("sum"("t"."guests"), (0)::bigint))::integer AS "guests",
            (COALESCE("sum"("t"."breakfasts_included"), (0)::bigint))::integer AS "included",
            (COALESCE("sum"("t"."breakfasts_served"), (0)::bigint))::integer AS "served",
            (COALESCE("sum"(GREATEST(("t"."breakfasts_served" - "t"."breakfasts_included"), 0)), (0)::bigint))::integer AS "extra",
            (COALESCE("sum"(GREATEST(("t"."breakfasts_included" - "t"."breakfasts_served"), 0)), (0)::bigint))::integer AS "no_show",
            (COALESCE("sum"(
                CASE
                    WHEN "t"."staff" THEN ("t"."breakfasts_served")::integer
                    WHEN ("t"."manual_kind" = 'offert'::"text") THEN ("t"."breakfasts_served")::integer
                    ELSE LEAST(("t"."breakfasts_offert")::integer, GREATEST(("t"."breakfasts_served" - "t"."breakfasts_included"), 0))
                END), (0)::bigint))::integer AS "offert"
           FROM ( SELECT "pdj_breakfasts"."service_date",
                    "pdj_breakfasts"."guests",
                        CASE
                            WHEN ("upper"(COALESCE("pdj_breakfasts"."rate_plan", ''::"text")) ~~ '%STAFF%'::"text") THEN 0
                            ELSE ("pdj_breakfasts"."breakfasts_included")::integer
                        END AS "breakfasts_included",
                    "pdj_breakfasts"."breakfasts_served",
                    "pdj_breakfasts"."breakfasts_offert",
                    "pdj_breakfasts"."manual_kind",
                    ("upper"(COALESCE("pdj_breakfasts"."rate_plan", ''::"text")) ~~ '%STAFF%'::"text") AS "staff",
                        CASE
                            WHEN ("upper"(COALESCE("pdj_breakfasts"."rate_plan", ''::"text")) ~~ '%STAFF%'::"text") THEN NULL::"text"
                            WHEN ("upper"(COALESCE("pdj_breakfasts"."addons", ''::"text")) ~~ '%PDJGROUP%'::"text") THEN 'PDJGROUP10'::"text"
                            WHEN ("upper"(COALESCE("pdj_breakfasts"."addons", ''::"text")) ~~ '%PDJBB%'::"text") THEN 'PDJBB'::"text"
                            WHEN ("upper"(COALESCE("pdj_breakfasts"."addons", ''::"text")) ~~ '%PDJ%'::"text") THEN 'PDJ'::"text"
                            WHEN ("pdj_breakfasts"."manual_kind" = 'inclus'::"text") THEN 'PDJ'::"text"
                            ELSE NULL::"text"
                        END AS "code"
                   FROM "public"."pdj_breakfasts") "t"
          GROUP BY "t"."service_date", "t"."code"
        ), "recette" AS NOT MATERIALIZED (
         SELECT "pdj_addon_production"."service_date",
            "pdj_addon_production"."code",
            "pdj_addon_production"."revenue_ttc"
           FROM "public"."pdj_addon_production"
        )
 SELECT "c"."service_date",
    "c"."code",
    "c"."rooms",
    "c"."guests",
    "c"."included",
    "c"."served",
    "c"."extra",
    "c"."no_show",
    "c"."offert",
    "r"."revenue_ttc"
   FROM ("chambres" "c"
     LEFT JOIN "recette" "r" ON ((("r"."service_date" = "c"."service_date") AND ("r"."code" = "c"."code"))))
UNION ALL
 SELECT "r"."service_date",
    "r"."code",
    0 AS "rooms",
    0 AS "guests",
    0 AS "included",
    0 AS "served",
    0 AS "extra",
    0 AS "no_show",
    0 AS "offert",
    "r"."revenue_ttc"
   FROM "recette" "r"
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."pdj_breakfasts" "b"
          WHERE (("b"."service_date" = "r"."service_date") AND (NOT (
                CASE
                    WHEN ("upper"(COALESCE("b"."rate_plan", ''::"text")) ~~ '%STAFF%'::"text") THEN NULL::"text"
                    WHEN ("upper"(COALESCE("b"."addons", ''::"text")) ~~ '%PDJGROUP%'::"text") THEN 'PDJGROUP10'::"text"
                    WHEN ("upper"(COALESCE("b"."addons", ''::"text")) ~~ '%PDJBB%'::"text") THEN 'PDJBB'::"text"
                    WHEN ("upper"(COALESCE("b"."addons", ''::"text")) ~~ '%PDJ%'::"text") THEN 'PDJ'::"text"
                    WHEN ("b"."manual_kind" = 'inclus'::"text") THEN 'PDJ'::"text"
                    ELSE NULL::"text"
                END IS DISTINCT FROM "r"."code"))))));


ALTER VIEW "public"."pdj_daily_agg" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pdj_externals" (
    "service_date" "date" NOT NULL,
    "count" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pdj_externals_count_check" CHECK (("count" >= 0))
);


ALTER TABLE "public"."pdj_externals" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pdj_service_dates" WITH ("security_invoker"='true') AS
 WITH RECURSIVE "dates_sautees" AS (
         SELECT "min"("pdj_breakfasts"."service_date") AS "service_date"
           FROM "public"."pdj_breakfasts"
        UNION ALL
         SELECT ( SELECT "min"("b"."service_date") AS "min"
                   FROM "public"."pdj_breakfasts" "b"
                  WHERE ("b"."service_date" > "d"."service_date")) AS "min"
           FROM "dates_sautees" "d"
          WHERE ("d"."service_date" IS NOT NULL)
        )
 SELECT "service_date"
   FROM "dates_sautees"
  WHERE ("service_date" IS NOT NULL);


ALTER VIEW "public"."pdj_service_dates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pms_daily_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "line_no" integer NOT NULL,
    "section" "text" NOT NULL,
    "today" numeric,
    "mtd" numeric,
    "last_year_mtd" numeric,
    "mtd_variance" numeric,
    "ytd" numeric,
    "last_year_ytd" numeric,
    "ytd_variance" numeric,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pms_daily_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text" DEFAULT ''::"text" NOT NULL,
    "last_name" "text" DEFAULT ''::"text" NOT NULL,
    "page_order" "text"[],
    CONSTRAINT "profiles_page_order_check" CHECK ((("page_order" IS NULL) OR (("page_order" <@ ARRAY['repjour'::"text", 'pdj'::"text", 'parking'::"text", 'rapro'::"text", 'caisse'::"text", 'affichage'::"text", 'facturation'::"text", 'literie'::"text", 'classeur'::"text"]) AND (COALESCE("array_length"("page_order", 1), 0) <= 9)))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['utilisateur'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."page_order" IS 'Ordre choisi des pages de navigation ; la tête est la page d''accueil. NULL = aucune préférence (ordre du registre client). Peut être partiel ou périmé : le client réconcilie avec les droits à la lecture.';



CREATE TABLE IF NOT EXISTS "public"."rapro_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "room" smallint NOT NULL,
    "status" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "carried_manual" boolean DEFAULT false NOT NULL,
    "materialized" boolean DEFAULT false NOT NULL,
    CONSTRAINT "rapro_rooms_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['nettoyee'::"text", 'non_nettoyee'::"text", 'refus'::"text", 'rattrapage'::"text", 'non_vendue'::"text"]))))
);


ALTER TABLE "public"."rapro_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rapro_sheets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "comment" "text" DEFAULT ''::"text" NOT NULL,
    "validated_at" timestamp with time zone,
    "validated_by" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "late_arrivals" integer DEFAULT 0 NOT NULL,
    "corrections" integer DEFAULT 0 NOT NULL,
    "operator_name" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "rapro_sheets_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'validated'::"text"])))
);


ALTER TABLE "public"."rapro_sheets" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rapro_daily_agg" WITH ("security_invoker"='true') AS
 SELECT ("r"."report_date")::"text" AS "report_date",
    ("count"(*) FILTER (WHERE ("r"."status" = 'nettoyee'::"text")))::integer AS "nettoyee",
    ("count"(*) FILTER (WHERE ("r"."status" = 'rattrapage'::"text")))::integer AS "rattrapage",
    ("count"(*) FILTER (WHERE ("r"."status" = 'non_nettoyee'::"text")))::integer AS "bloquee",
    ("count"(*) FILTER (WHERE ("r"."status" = 'refus'::"text")))::integer AS "refus"
   FROM ("public"."rapro_rooms" "r"
     JOIN "public"."rapro_sheets" "s" ON ((("s"."report_date" = "r"."report_date") AND ("s"."status" = 'validated'::"text"))))
  WHERE ("r"."status" = ANY (ARRAY['nettoyee'::"text", 'rattrapage'::"text", 'non_nettoyee'::"text", 'refus'::"text"]))
  GROUP BY "r"."report_date";


ALTER VIEW "public"."rapro_daily_agg" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repjour_auto_send_log" (
    "id" bigint NOT NULL,
    "cycle_date" "date" NOT NULL,
    "trigger_report" "text" NOT NULL,
    "attempt" integer NOT NULL,
    "waited_seconds" integer DEFAULT 0 NOT NULL,
    "sent" boolean DEFAULT false NOT NULL,
    "retryable" boolean DEFAULT false NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "repjour_auto_send_log_attempt_check" CHECK (("attempt" >= 1)),
    CONSTRAINT "repjour_auto_send_log_trigger_report_check" CHECK (("trigger_report" = ANY (ARRAY['comparison'::"text", 'forecast'::"text", 'veille planifiée'::"text"]))),
    CONSTRAINT "repjour_auto_send_log_waited_check" CHECK (("waited_seconds" >= 0))
);


ALTER TABLE "public"."repjour_auto_send_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."repjour_auto_send_log" IS 'Journal des tentatives d''envoi automatique du rapport journalier. Écrit par la fonction import-report (service_role) ; lu en gestion repjour. Créé après la nuit du 2026-09-12, où aucune trace n''existait.';



CREATE SEQUENCE IF NOT EXISTS "public"."repjour_auto_send_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."repjour_auto_send_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."repjour_auto_send_log_id_seq" OWNED BY "public"."repjour_auto_send_log"."id";



CREATE TABLE IF NOT EXISTS "public"."report_send_throttle" (
    "user_id" "uuid" NOT NULL,
    "last_sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recent_sends" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."report_send_throttle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."server_report_recipients" (
    "id" bigint NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" DEFAULT 'to'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "server_report_recipients_email_format" CHECK (("email" ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$'::"text")),
    CONSTRAINT "server_report_recipients_type_check" CHECK (("type" = ANY (ARRAY['to'::"text", 'cc'::"text"])))
);


ALTER TABLE "public"."server_report_recipients" OWNER TO "postgres";


ALTER TABLE "public"."server_report_recipients" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."server_report_recipients_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_page_permissions" (
    "user_id" "uuid" NOT NULL,
    "page" "text" NOT NULL,
    "level" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "user_page_permissions_level_check" CHECK (("level" = ANY (ARRAY['lecture'::"text", 'ecriture'::"text", 'gestion'::"text"]))),
    CONSTRAINT "user_page_permissions_page_check" CHECK (("page" = ANY (ARRAY['repjour'::"text", 'pdj'::"text", 'parking'::"text", 'rapro'::"text", 'caisse'::"text", 'affichage'::"text", 'facturation'::"text", 'literie'::"text", 'classeur'::"text"])))
);


ALTER TABLE "public"."user_page_permissions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."budget" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."budget_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_reports_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."forecast_days" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."forecast_days_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."repjour_auto_send_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."repjour_auto_send_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."affiche_templates"
    ADD CONSTRAINT "affiche_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baby_cot_assignments"
    ADD CONSTRAINT "baby_cot_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."baby_cots"
    ADD CONSTRAINT "baby_cots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget"
    ADD CONSTRAINT "budget_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget"
    ADD CONSTRAINT "budget_year_month_key" UNIQUE ("year", "month");



ALTER TABLE ONLY "public"."caisse_cautions"
    ADD CONSTRAINT "caisse_cautions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caisse_sheets"
    ADD CONSTRAINT "caisse_sheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."caisse_sheets"
    ADD CONSTRAINT "caisse_sheets_report_date_shift_key" UNIQUE ("report_date", "shift");



ALTER TABLE ONLY "public"."classeur_acces"
    ADD CONSTRAINT "classeur_acces_classeur_id_user_id_key" UNIQUE ("classeur_id", "user_id");



ALTER TABLE ONLY "public"."classeur_acces"
    ADD CONSTRAINT "classeur_acces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_chapters"
    ADD CONSTRAINT "classeur_chapters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_chapters"
    ADD CONSTRAINT "classeur_chapters_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."classeur_classeurs"
    ADD CONSTRAINT "classeur_classeurs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_classeurs"
    ADD CONSTRAINT "classeur_classeurs_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."classeur_document_versions"
    ADD CONSTRAINT "classeur_document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_documents"
    ADD CONSTRAINT "classeur_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_documents"
    ADD CONSTRAINT "classeur_documents_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."classeur_images"
    ADD CONSTRAINT "classeur_images_chemin_key" UNIQUE ("chemin");



ALTER TABLE ONLY "public"."classeur_images"
    ADD CONSTRAINT "classeur_images_original_chemin_key" UNIQUE ("original_chemin");



ALTER TABLE ONLY "public"."classeur_images"
    ADD CONSTRAINT "classeur_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_images"
    ADD CONSTRAINT "classeur_images_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."classeur_intercalaires"
    ADD CONSTRAINT "classeur_intercalaires_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_intercalaires"
    ADD CONSTRAINT "classeur_intercalaires_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."classeur_merge_history"
    ADD CONSTRAINT "classeur_merge_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_periodicites"
    ADD CONSTRAINT "classeur_periodicites_label_key" UNIQUE ("label");



ALTER TABLE ONLY "public"."classeur_periodicites"
    ADD CONSTRAINT "classeur_periodicites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_signature_sheets"
    ADD CONSTRAINT "classeur_signature_sheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_signature_sheets"
    ADD CONSTRAINT "classeur_signature_sheets_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."classeur_tracking_sheets"
    ADD CONSTRAINT "classeur_tracking_sheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classeur_tracking_sheets"
    ADD CONSTRAINT "classeur_tracking_sheets_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."easter_eggs"
    ADD CONSTRAINT "easter_eggs_keyword_key" UNIQUE ("keyword");



ALTER TABLE ONLY "public"."easter_eggs"
    ADD CONSTRAINT "easter_eggs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facturation_budget_lines"
    ADD CONSTRAINT "facturation_budget_lines_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."facturation_issuer_codes"
    ADD CONSTRAINT "facturation_issuer_codes_pkey" PRIMARY KEY ("issuer", "code");



ALTER TABLE ONLY "public"."facturation_issuer_denylist"
    ADD CONSTRAINT "facturation_issuer_denylist_pkey" PRIMARY KEY ("issuer", "code");



ALTER TABLE ONLY "public"."facturation_issuers"
    ADD CONSTRAINT "facturation_issuers_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."facturation_learned_docs"
    ADD CONSTRAINT "facturation_learned_docs_pkey" PRIMARY KEY ("hash");



ALTER TABLE ONLY "public"."facturation_ref_comptes"
    ADD CONSTRAINT "facturation_ref_comptes_pkey" PRIMARY KEY ("compte");



ALTER TABLE ONLY "public"."facturation_ref_imputations"
    ADD CONSTRAINT "facturation_ref_imputations_pkey" PRIMARY KEY ("code_analytique", "compte");



ALTER TABLE ONLY "public"."facturation_wordpool"
    ADD CONSTRAINT "facturation_wordpool_pkey" PRIMARY KEY ("code", "token");



ALTER TABLE ONLY "public"."forecast_days"
    ADD CONSTRAINT "forecast_days_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."forecast_days"
    ADD CONSTRAINT "forecast_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotel_config"
    ADD CONSTRAINT "hotel_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotel_rooms"
    ADD CONSTRAINT "hotel_rooms_pkey" PRIMARY KEY ("room");



ALTER TABLE ONLY "public"."literie_sheets"
    ADD CONSTRAINT "literie_sheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."literie_sheets"
    ADD CONSTRAINT "literie_sheets_report_date_key" UNIQUE ("report_date");



ALTER TABLE ONLY "public"."literie_stock_movements"
    ADD CONSTRAINT "literie_stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."literie_stock"
    ADD CONSTRAINT "literie_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parking_reservations"
    ADD CONSTRAINT "parking_reservations_no_overlap" EXCLUDE USING "gist" ("spot" WITH =, "daterange"("start_date", ("start_date" + ("nights")::integer), '[)'::"text") WITH &&);



ALTER TABLE ONLY "public"."parking_reservations"
    ADD CONSTRAINT "parking_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parking_tarifs"
    ADD CONSTRAINT "parking_tarifs_effective_from_key" UNIQUE ("effective_from");



ALTER TABLE ONLY "public"."parking_tarifs"
    ADD CONSTRAINT "parking_tarifs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdj_addon_production"
    ADD CONSTRAINT "pdj_addon_production_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdj_addon_production"
    ADD CONSTRAINT "pdj_addon_production_service_date_code_key" UNIQUE ("service_date", "code");



ALTER TABLE ONLY "public"."pdj_breakfasts"
    ADD CONSTRAINT "pdj_breakfasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdj_breakfasts"
    ADD CONSTRAINT "pdj_breakfasts_service_date_room_key" UNIQUE ("service_date", "room");



ALTER TABLE ONLY "public"."pdj_externals"
    ADD CONSTRAINT "pdj_externals_pkey" PRIMARY KEY ("service_date");



ALTER TABLE ONLY "public"."pms_daily_metrics"
    ADD CONSTRAINT "pms_daily_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pms_daily_metrics"
    ADD CONSTRAINT "pms_daily_metrics_report_date_line_no_key" UNIQUE ("report_date", "line_no");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rapro_rooms"
    ADD CONSTRAINT "rapro_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rapro_rooms"
    ADD CONSTRAINT "rapro_rooms_report_date_room_key" UNIQUE ("report_date", "room");



ALTER TABLE ONLY "public"."rapro_sheets"
    ADD CONSTRAINT "rapro_sheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rapro_sheets"
    ADD CONSTRAINT "rapro_sheets_report_date_key" UNIQUE ("report_date");



ALTER TABLE ONLY "public"."repjour_auto_send_log"
    ADD CONSTRAINT "repjour_auto_send_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_send_throttle"
    ADD CONSTRAINT "report_send_throttle_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."server_report_recipients"
    ADD CONSTRAINT "server_report_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_pkey" PRIMARY KEY ("user_id", "page");



CREATE INDEX "affiche_templates_created_by_idx" ON "public"."affiche_templates" USING "btree" ("created_by");



CREATE INDEX "affiche_templates_sort_idx" ON "public"."affiche_templates" USING "btree" ("sort_order", "name");



CREATE INDEX "baby_cot_assignments_cot_idx" ON "public"."baby_cot_assignments" USING "btree" ("cot_id", "start_date");



CREATE INDEX "caisse_cautions_status_idx" ON "public"."caisse_cautions" USING "btree" ("status");



CREATE INDEX "caisse_cautions_taken_date_idx" ON "public"."caisse_cautions" USING "btree" ("taken_date");



CREATE INDEX "caisse_sheets_report_date_idx" ON "public"."caisse_sheets" USING "btree" ("report_date" DESC);



CREATE INDEX "classeur_acces_user_idx" ON "public"."classeur_acces" USING "btree" ("user_id");



CREATE INDEX "classeur_chapters_classeur_idx" ON "public"."classeur_chapters" USING "btree" ("classeur_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "classeur_document_versions_doc_idx" ON "public"."classeur_document_versions" USING "btree" ("document_id", "created_at" DESC, "id" DESC);



CREATE INDEX "classeur_documents_chapter_idx" ON "public"."classeur_documents" USING "btree" ("chapter_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "classeur_images_classeur_idx" ON "public"."classeur_images" USING "btree" ("classeur_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "classeur_intercalaires_chapter_idx" ON "public"."classeur_intercalaires" USING "btree" ("chapter_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "classeur_merge_history_classeur_idx" ON "public"."classeur_merge_history" USING "btree" ("classeur_id", "merged_at" DESC);



CREATE INDEX "classeur_merge_history_kind_idx" ON "public"."classeur_merge_history" USING "btree" ("classeur_id", "kind", "merged_at" DESC);



CREATE INDEX "classeur_signature_sheets_chapter_idx" ON "public"."classeur_signature_sheets" USING "btree" ("chapter_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "classeur_tracking_sheets_chapter_idx" ON "public"."classeur_tracking_sheets" USING "btree" ("chapter_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "facturation_issuer_codes_issuer_idx" ON "public"."facturation_issuer_codes" USING "btree" ("issuer");



CREATE INDEX "facturation_issuer_denylist_issuer_idx" ON "public"."facturation_issuer_denylist" USING "btree" ("issuer");



CREATE INDEX "facturation_learned_docs_issuer_idx" ON "public"."facturation_learned_docs" USING "btree" ("issuer");



CREATE INDEX "facturation_ref_imp_compte_idx" ON "public"."facturation_ref_imputations" USING "btree" ("compte");



CREATE INDEX "facturation_wordpool_code_idx" ON "public"."facturation_wordpool" USING "btree" ("code");



CREATE INDEX "idx_audit_log_table" ON "public"."audit_log" USING "btree" ("table_name", "performed_at");



CREATE INDEX "idx_daily_reports_month" ON "public"."daily_reports" USING "btree" ("year", "month");



CREATE INDEX "idx_forecast_days_month" ON "public"."forecast_days" USING "btree" ("year", "month");



CREATE INDEX "literie_stock_movements_room_idx" ON "public"."literie_stock_movements" USING "btree" ("room", "created_at" DESC);



CREATE INDEX "parking_reservations_spot_date_idx" ON "public"."parking_reservations" USING "btree" ("spot", "start_date");



CREATE INDEX "pdj_addon_production_service_date_idx" ON "public"."pdj_addon_production" USING "btree" ("service_date");



CREATE INDEX "pdj_breakfasts_guest_name_pending_idx" ON "public"."pdj_breakfasts" USING "btree" ("service_date") WHERE ("guest_name" IS NOT NULL);



CREATE INDEX "pdj_breakfasts_service_date_idx" ON "public"."pdj_breakfasts" USING "btree" ("service_date");



CREATE INDEX "pms_daily_metrics_date_section" ON "public"."pms_daily_metrics" USING "btree" ("report_date", "section");



CREATE INDEX "repjour_auto_send_log_cycle_idx" ON "public"."repjour_auto_send_log" USING "btree" ("cycle_date" DESC, "created_at" DESC);



CREATE OR REPLACE TRIGGER "affiche_templates_stamp" BEFORE INSERT OR UPDATE ON "public"."affiche_templates" FOR EACH ROW EXECUTE FUNCTION "public"."affiche_stamp"();



CREATE OR REPLACE TRIGGER "audit_classeur_acces" AFTER INSERT OR DELETE OR UPDATE ON "public"."classeur_acces" FOR EACH ROW EXECUTE FUNCTION "private"."log_row_change"();



CREATE OR REPLACE TRIGGER "audit_classeur_acces_tous" AFTER UPDATE OF "acces_tous" ON "public"."classeur_classeurs" FOR EACH ROW WHEN (("old"."acces_tous" IS DISTINCT FROM "new"."acces_tous")) EXECUTE FUNCTION "private"."log_row_change"();



CREATE OR REPLACE TRIGGER "audit_daily_reports_delete" BEFORE DELETE ON "public"."daily_reports" FOR EACH ROW EXECUTE FUNCTION "private"."log_delete"();



CREATE OR REPLACE TRIGGER "audit_forecast_days_delete" BEFORE DELETE ON "public"."forecast_days" FOR EACH ROW EXECUTE FUNCTION "private"."log_delete"();



CREATE OR REPLACE TRIGGER "audit_profiles" AFTER INSERT OR DELETE OR UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."log_row_change"();



CREATE OR REPLACE TRIGGER "audit_user_page_permissions" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_page_permissions" FOR EACH ROW EXECUTE FUNCTION "private"."log_row_change"();



CREATE OR REPLACE TRIGGER "baby_cot_assignments_stamp" BEFORE INSERT OR UPDATE ON "public"."baby_cot_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."baby_cot_assignments_stamp"();



CREATE OR REPLACE TRIGGER "caisse_cautions_stamp" BEFORE INSERT OR UPDATE ON "public"."caisse_cautions" FOR EACH ROW EXECUTE FUNCTION "public"."caisse_cautions_stamp"();



CREATE OR REPLACE TRIGGER "caisse_cloturee_figee" BEFORE UPDATE ON "public"."caisse_sheets" FOR EACH ROW EXECUTE FUNCTION "private"."caisse_cloturee_figee"();



CREATE OR REPLACE TRIGGER "caisse_sheets_stamp" BEFORE INSERT OR UPDATE ON "public"."caisse_sheets" FOR EACH ROW EXECUTE FUNCTION "public"."caisse_stamp"();



CREATE OR REPLACE TRIGGER "classeur_document_version" AFTER INSERT OR UPDATE OF "title", "description", "content" ON "public"."classeur_documents" FOR EACH ROW EXECUTE FUNCTION "private"."classeur_document_version"();



CREATE OR REPLACE TRIGGER "classeur_garde" BEFORE INSERT OR UPDATE ON "public"."classeur_classeurs" FOR EACH ROW EXECUTE FUNCTION "private"."classeur_garde"();



CREATE OR REPLACE TRIGGER "classeur_merge_history_taille" BEFORE INSERT ON "public"."classeur_merge_history" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_merge_history_taille"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_acces" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_chapters" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_classeurs" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_documents" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_images" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_intercalaires" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_merge_history" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_signature_sheets" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_stamp" BEFORE INSERT OR UPDATE ON "public"."classeur_tracking_sheets" FOR EACH ROW EXECUTE FUNCTION "public"."classeur_stamp"();



CREATE OR REPLACE TRIGGER "classeur_version_monotone" BEFORE UPDATE OF "version_majeure", "version_mineure" ON "public"."classeur_documents" FOR EACH ROW EXECUTE FUNCTION "private"."classeur_version_monotone"();



CREATE OR REPLACE TRIGGER "classeur_versions_suivent" AFTER UPDATE OF "classeur_id" ON "public"."classeur_chapters" FOR EACH ROW EXECUTE FUNCTION "private"."classeur_versions_suivent"();



CREATE OR REPLACE TRIGGER "classeur_versions_suivent" AFTER UPDATE OF "chapter_id" ON "public"."classeur_documents" FOR EACH ROW EXECUTE FUNCTION "private"."classeur_versions_suivent"();



CREATE OR REPLACE TRIGGER "daily_reports_stamp" BEFORE INSERT OR UPDATE ON "public"."daily_reports" FOR EACH ROW EXECUTE FUNCTION "public"."daily_reports_stamp"();



CREATE OR REPLACE TRIGGER "easter_eggs_set_updated_at" BEFORE UPDATE ON "public"."easter_eggs" FOR EACH ROW EXECUTE FUNCTION "public"."easter_eggs_set_updated_at"();



CREATE OR REPLACE TRIGGER "facturation_budget_lines_touch" BEFORE UPDATE ON "public"."facturation_budget_lines" FOR EACH ROW EXECUTE FUNCTION "public"."facturation_budget_lines_touch"();



CREATE OR REPLACE TRIGGER "facturation_ref_comptes_touch" BEFORE UPDATE ON "public"."facturation_ref_comptes" FOR EACH ROW EXECUTE FUNCTION "public"."facturation_ref_comptes_touch"();



CREATE OR REPLACE TRIGGER "facturation_ref_imputations_touch" BEFORE UPDATE ON "public"."facturation_ref_imputations" FOR EACH ROW EXECUTE FUNCTION "public"."facturation_ref_imputations_touch"();



CREATE OR REPLACE TRIGGER "hotel_rooms_stamp" BEFORE INSERT OR UPDATE ON "public"."hotel_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."hotel_rooms_stamp"();



CREATE OR REPLACE TRIGGER "literie_sheets_stamp" BEFORE INSERT OR UPDATE ON "public"."literie_sheets" FOR EACH ROW EXECUTE FUNCTION "public"."literie_sheets_stamp"();



CREATE OR REPLACE TRIGGER "parking_no_past_rewrite" BEFORE UPDATE ON "public"."parking_reservations" FOR EACH ROW EXECUTE FUNCTION "public"."parking_no_past_rewrite"();



CREATE OR REPLACE TRIGGER "parking_reservations_set_updated_at" BEFORE UPDATE ON "public"."parking_reservations" FOR EACH ROW EXECUTE FUNCTION "public"."parking_set_updated_at"();



CREATE OR REPLACE TRIGGER "pdj_addon_production_stamp" BEFORE INSERT OR UPDATE ON "public"."pdj_addon_production" FOR EACH ROW EXECUTE FUNCTION "public"."pdj_addon_production_stamp"();



CREATE OR REPLACE TRIGGER "pdj_breakfasts_clamp_included" BEFORE INSERT OR UPDATE ON "public"."pdj_breakfasts" FOR EACH ROW EXECUTE FUNCTION "public"."pdj_clamp_breakfasts_included"();



CREATE OR REPLACE TRIGGER "pdj_breakfasts_set_updated_at" BEFORE UPDATE ON "public"."pdj_breakfasts" FOR EACH ROW EXECUTE FUNCTION "public"."pdj_set_updated_at"();



CREATE OR REPLACE TRIGGER "pdj_externals_set_updated_at" BEFORE UPDATE ON "public"."pdj_externals" FOR EACH ROW EXECUTE FUNCTION "public"."pdj_externals_stamp"();



CREATE OR REPLACE TRIGGER "pms_daily_metrics_stamp" BEFORE INSERT OR UPDATE ON "public"."pms_daily_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."pms_daily_metrics_stamp"();



CREATE OR REPLACE TRIGGER "protect_role_escalation" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_self_role_change"();



CREATE OR REPLACE TRIGGER "rapro_jour_cloture_fige" BEFORE INSERT OR DELETE OR UPDATE ON "public"."rapro_rooms" FOR EACH ROW EXECUTE FUNCTION "private"."rapro_jour_cloture_fige"();



CREATE OR REPLACE TRIGGER "rapro_rooms_stamp" BEFORE INSERT OR UPDATE ON "public"."rapro_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."rapro_rooms_stamp"();



CREATE OR REPLACE TRIGGER "rapro_sheets_stamp" BEFORE INSERT OR UPDATE ON "public"."rapro_sheets" FOR EACH ROW EXECUTE FUNCTION "public"."rapro_sheets_stamp"();



ALTER TABLE ONLY "public"."affiche_templates"
    ADD CONSTRAINT "affiche_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."baby_cot_assignments"
    ADD CONSTRAINT "baby_cot_assignments_cot_id_fkey" FOREIGN KEY ("cot_id") REFERENCES "public"."baby_cots"("id");



ALTER TABLE ONLY "public"."baby_cot_assignments"
    ADD CONSTRAINT "baby_cot_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caisse_cautions"
    ADD CONSTRAINT "caisse_cautions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caisse_cautions"
    ADD CONSTRAINT "caisse_cautions_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caisse_sheets"
    ADD CONSTRAINT "caisse_sheets_countersigned_by_fkey" FOREIGN KEY ("countersigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caisse_sheets"
    ADD CONSTRAINT "caisse_sheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."caisse_sheets"
    ADD CONSTRAINT "caisse_sheets_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_acces"
    ADD CONSTRAINT "classeur_acces_classeur_id_fkey" FOREIGN KEY ("classeur_id") REFERENCES "public"."classeur_classeurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_acces"
    ADD CONSTRAINT "classeur_acces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_acces"
    ADD CONSTRAINT "classeur_acces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_chapters"
    ADD CONSTRAINT "classeur_chapters_classeur_id_fkey" FOREIGN KEY ("classeur_id") REFERENCES "public"."classeur_classeurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_chapters"
    ADD CONSTRAINT "classeur_chapters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_classeurs"
    ADD CONSTRAINT "classeur_classeurs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_document_versions"
    ADD CONSTRAINT "classeur_document_versions_classeur_id_fkey" FOREIGN KEY ("classeur_id") REFERENCES "public"."classeur_classeurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_document_versions"
    ADD CONSTRAINT "classeur_document_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_document_versions"
    ADD CONSTRAINT "classeur_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."classeur_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_documents"
    ADD CONSTRAINT "classeur_documents_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."classeur_chapters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_documents"
    ADD CONSTRAINT "classeur_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_images"
    ADD CONSTRAINT "classeur_images_classeur_id_fkey" FOREIGN KEY ("classeur_id") REFERENCES "public"."classeur_classeurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_images"
    ADD CONSTRAINT "classeur_images_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_intercalaires"
    ADD CONSTRAINT "classeur_intercalaires_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."classeur_chapters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_intercalaires"
    ADD CONSTRAINT "classeur_intercalaires_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_merge_history"
    ADD CONSTRAINT "classeur_merge_history_classeur_id_fkey" FOREIGN KEY ("classeur_id") REFERENCES "public"."classeur_classeurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_merge_history"
    ADD CONSTRAINT "classeur_merge_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_signature_sheets"
    ADD CONSTRAINT "classeur_signature_sheets_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."classeur_chapters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_signature_sheets"
    ADD CONSTRAINT "classeur_signature_sheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_tracking_sheets"
    ADD CONSTRAINT "classeur_tracking_sheets_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."classeur_chapters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classeur_tracking_sheets"
    ADD CONSTRAINT "classeur_tracking_sheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classeur_tracking_sheets"
    ADD CONSTRAINT "classeur_tracking_sheets_periodicite_id_fkey" FOREIGN KEY ("periodicite_id") REFERENCES "public"."classeur_periodicites"("id");



ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hotel_rooms"
    ADD CONSTRAINT "hotel_rooms_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."literie_sheets"
    ADD CONSTRAINT "literie_sheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."literie_sheets"
    ADD CONSTRAINT "literie_sheets_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."literie_stock_movements"
    ADD CONSTRAINT "literie_stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."literie_stock_movements"
    ADD CONSTRAINT "literie_stock_movements_room_fkey" FOREIGN KEY ("room") REFERENCES "public"."hotel_rooms"("room");



ALTER TABLE ONLY "public"."pms_daily_metrics"
    ADD CONSTRAINT "pms_daily_metrics_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rapro_rooms"
    ADD CONSTRAINT "rapro_rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rapro_sheets"
    ADD CONSTRAINT "rapro_sheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rapro_sheets"
    ADD CONSTRAINT "rapro_sheets_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."report_send_throttle"
    ADD CONSTRAINT "report_send_throttle_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin manages profiles" ON "public"."profiles" TO "authenticated" USING ((( SELECT "private"."get_user_role"() AS "get_user_role") = 'admin'::"text"));



CREATE POLICY "Admin reads all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "private"."get_user_role"() AS "get_user_role") = 'admin'::"text"));



CREATE POLICY "Admin reads audit log" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((( SELECT "private"."get_user_role"() AS "get_user_role") = 'admin'::"text"));



CREATE POLICY "Admin updates config" ON "public"."hotel_config" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."get_user_role"() AS "get_user_role") = 'admin'::"text"));



CREATE POLICY "All read config" ON "public"."hotel_config" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "Users read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND ("role" = ( SELECT "private"."get_user_role"() AS "get_user_role")) AND ("email" = ( SELECT "private"."get_user_email"() AS "get_user_email"))));



CREATE POLICY "affiche delete (page:affichage)" ON "public"."affiche_templates" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('affichage'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('affichage'::"text")) AS "page_level_rank") >= 2) AND ("created_by" = "auth"."uid"()))));



CREATE POLICY "affiche read (page:affichage)" ON "public"."affiche_templates" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('affichage'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "affiche update (page:affichage)" ON "public"."affiche_templates" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('affichage'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('affichage'::"text")) AS "page_level_rank") >= 2) AND ("created_by" = "auth"."uid"())))) WITH CHECK (((( SELECT "private"."get_page_level"('affichage'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('affichage'::"text")) AS "page_level_rank") >= 2) AND ("created_by" = "auth"."uid"()))));



CREATE POLICY "affiche write (page:affichage)" ON "public"."affiche_templates" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('affichage'::"text")) AS "page_level_rank") >= 2));



ALTER TABLE "public"."affiche_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."baby_cot_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "baby_cot_assignments delete (page:literie)" ON "public"."baby_cot_assignments" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2) AND ("end_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "baby_cot_assignments read (page:literie)" ON "public"."baby_cot_assignments" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "baby_cot_assignments update (page:literie)" ON "public"."baby_cot_assignments" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2) AND ("end_date" >= (CURRENT_DATE - 2))))) WITH CHECK (((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2) AND ("end_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "baby_cot_assignments write (page:literie)" ON "public"."baby_cot_assignments" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2) AND ("start_date" >= (CURRENT_DATE - 2)))));



ALTER TABLE "public"."baby_cots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "baby_cots read (page:literie)" ON "public"."baby_cots" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "baby_cots write (page:literie)" ON "public"."baby_cots" TO "authenticated" USING ((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text")) WITH CHECK ((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text"));



ALTER TABLE "public"."budget" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget delete (page:repjour gestion)" ON "public"."budget" FOR DELETE TO "authenticated" USING ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "budget read (page:repjour)" ON "public"."budget" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "budget update (page:repjour gestion)" ON "public"."budget" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text")) WITH CHECK ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "budget write (page:repjour gestion)" ON "public"."budget" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "budget_lines read (page:facturation)" ON "public"."facturation_budget_lines" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "caisse cautions delete (page:caisse)" ON "public"."caisse_cautions" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('caisse'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 2) AND ("taken_date" = CURRENT_DATE))));



CREATE POLICY "caisse cautions read (page:caisse)" ON "public"."caisse_cautions" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "caisse cautions update (page:caisse)" ON "public"."caisse_cautions" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('caisse'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 2) AND ("taken_date" >= (CURRENT_DATE - 30))))) WITH CHECK (((( SELECT "private"."get_page_level"('caisse'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 2) AND ("taken_date" >= (CURRENT_DATE - 30)))));



CREATE POLICY "caisse cautions write (page:caisse)" ON "public"."caisse_cautions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 2));



CREATE POLICY "caisse delete (page:caisse gestion)" ON "public"."caisse_sheets" FOR DELETE TO "authenticated" USING ((( SELECT "private"."get_page_level"('caisse'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "caisse read (page:caisse)" ON "public"."caisse_sheets" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "caisse update (page:caisse + verrou)" ON "public"."caisse_sheets" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('caisse'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 1))))) WITH CHECK (((( SELECT "private"."get_page_level"('caisse'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 1)))));



CREATE POLICY "caisse write (page:caisse)" ON "public"."caisse_sheets" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('caisse'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('caisse'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 1)))));



ALTER TABLE "public"."caisse_cautions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."caisse_sheets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classeur_acces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_acces delete (gestion)" ON "public"."classeur_acces" FOR DELETE TO "authenticated" USING (( SELECT "private"."classeur_gestion_ok"() AS "classeur_gestion_ok"));



CREATE POLICY "classeur_acces insert (gestion)" ON "public"."classeur_acces" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_gestion_ok"() AS "classeur_gestion_ok"));



CREATE POLICY "classeur_acces read" ON "public"."classeur_acces" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."classeur_gestion_ok"() AS "classeur_gestion_ok")));



CREATE POLICY "classeur_acces update (gestion)" ON "public"."classeur_acces" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_gestion_ok"() AS "classeur_gestion_ok")) WITH CHECK (( SELECT "private"."classeur_gestion_ok"() AS "classeur_gestion_ok"));



ALTER TABLE "public"."classeur_chapters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_chapters insert (page:classeur)" ON "public"."classeur_chapters" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_write_ok"("classeur_chapters"."classeur_id") AS "classeur_write_ok"));



CREATE POLICY "classeur_chapters read (page:classeur)" ON "public"."classeur_chapters" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_lecture_ok"("classeur_chapters"."classeur_id") AS "classeur_lecture_ok"));



CREATE POLICY "classeur_chapters update (page:classeur)" ON "public"."classeur_chapters" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_write_ok"("classeur_chapters"."classeur_id") AS "classeur_write_ok")) WITH CHECK (( SELECT "private"."classeur_write_ok"("classeur_chapters"."classeur_id") AS "classeur_write_ok"));



ALTER TABLE "public"."classeur_classeurs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_classeurs delete (page:classeur)" ON "public"."classeur_classeurs" FOR DELETE TO "authenticated" USING ((( SELECT "private"."get_page_level"('classeur'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "classeur_classeurs insert (page:classeur)" ON "public"."classeur_classeurs" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('classeur'::"text")) AS "page_level_rank") >= 2));



CREATE POLICY "classeur_classeurs read (page:classeur)" ON "public"."classeur_classeurs" FOR SELECT TO "authenticated" USING ("private"."classeur_lecture_ligne"("id", "created_by", "acces_tous"));



CREATE POLICY "classeur_classeurs update (page:classeur)" ON "public"."classeur_classeurs" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_write_ok"("classeur_classeurs"."id") AS "classeur_write_ok")) WITH CHECK (( SELECT "private"."classeur_write_ok"("classeur_classeurs"."id") AS "classeur_write_ok"));



ALTER TABLE "public"."classeur_document_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_document_versions read (page:classeur)" ON "public"."classeur_document_versions" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_lecture_ok"("classeur_document_versions"."classeur_id") AS "classeur_lecture_ok"));



ALTER TABLE "public"."classeur_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_documents insert (page:classeur)" ON "public"."classeur_documents" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_documents"."chapter_id") AS "classeur_chapter_write_ok"));



CREATE POLICY "classeur_documents read (page:classeur)" ON "public"."classeur_documents" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_chapter_read_ok"("classeur_documents"."chapter_id") AS "classeur_chapter_read_ok"));



CREATE POLICY "classeur_documents update (page:classeur)" ON "public"."classeur_documents" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_chapter_write_ok"("classeur_documents"."chapter_id") AS "classeur_chapter_write_ok")) WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_documents"."chapter_id") AS "classeur_chapter_write_ok"));



ALTER TABLE "public"."classeur_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_images insert (page:classeur)" ON "public"."classeur_images" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_write_ok"("classeur_images"."classeur_id") AS "classeur_write_ok"));



CREATE POLICY "classeur_images read (page:classeur)" ON "public"."classeur_images" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_lecture_ok"("classeur_images"."classeur_id") AS "classeur_lecture_ok"));



CREATE POLICY "classeur_images update (page:classeur)" ON "public"."classeur_images" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_write_ok"("classeur_images"."classeur_id") AS "classeur_write_ok")) WITH CHECK (( SELECT "private"."classeur_write_ok"("classeur_images"."classeur_id") AS "classeur_write_ok"));



ALTER TABLE "public"."classeur_intercalaires" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_intercalaires insert (page:classeur)" ON "public"."classeur_intercalaires" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_intercalaires"."chapter_id") AS "classeur_chapter_write_ok"));



CREATE POLICY "classeur_intercalaires read (page:classeur)" ON "public"."classeur_intercalaires" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_chapter_read_ok"("classeur_intercalaires"."chapter_id") AS "classeur_chapter_read_ok"));



CREATE POLICY "classeur_intercalaires update (page:classeur)" ON "public"."classeur_intercalaires" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_chapter_write_ok"("classeur_intercalaires"."chapter_id") AS "classeur_chapter_write_ok")) WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_intercalaires"."chapter_id") AS "classeur_chapter_write_ok"));



ALTER TABLE "public"."classeur_merge_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_merge_history delete (page:classeur)" ON "public"."classeur_merge_history" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('classeur'::"text") AS "get_page_level") = 'gestion'::"text") OR (("kind" = 'auto'::"text") AND ( SELECT "private"."classeur_write_ok"("classeur_merge_history"."classeur_id") AS "classeur_write_ok"))));



CREATE POLICY "classeur_merge_history insert (page:classeur)" ON "public"."classeur_merge_history" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_write_ok"("classeur_merge_history"."classeur_id") AS "classeur_write_ok"));



CREATE POLICY "classeur_merge_history read (page:classeur)" ON "public"."classeur_merge_history" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_lecture_ok"("classeur_merge_history"."classeur_id") AS "classeur_lecture_ok"));



ALTER TABLE "public"."classeur_periodicites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_periodicites read (page:classeur)" ON "public"."classeur_periodicites" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('classeur'::"text")) AS "page_level_rank") >= 1));



ALTER TABLE "public"."classeur_signature_sheets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_signature_sheets insert (page:classeur)" ON "public"."classeur_signature_sheets" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_signature_sheets"."chapter_id") AS "classeur_chapter_write_ok"));



CREATE POLICY "classeur_signature_sheets read (page:classeur)" ON "public"."classeur_signature_sheets" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_chapter_read_ok"("classeur_signature_sheets"."chapter_id") AS "classeur_chapter_read_ok"));



CREATE POLICY "classeur_signature_sheets update (page:classeur)" ON "public"."classeur_signature_sheets" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_chapter_write_ok"("classeur_signature_sheets"."chapter_id") AS "classeur_chapter_write_ok")) WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_signature_sheets"."chapter_id") AS "classeur_chapter_write_ok"));



ALTER TABLE "public"."classeur_tracking_sheets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classeur_tracking_sheets insert (page:classeur)" ON "public"."classeur_tracking_sheets" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_tracking_sheets"."chapter_id") AS "classeur_chapter_write_ok"));



CREATE POLICY "classeur_tracking_sheets read (page:classeur)" ON "public"."classeur_tracking_sheets" FOR SELECT TO "authenticated" USING (( SELECT "private"."classeur_chapter_read_ok"("classeur_tracking_sheets"."chapter_id") AS "classeur_chapter_read_ok"));



CREATE POLICY "classeur_tracking_sheets update (page:classeur)" ON "public"."classeur_tracking_sheets" FOR UPDATE TO "authenticated" USING (( SELECT "private"."classeur_chapter_write_ok"("classeur_tracking_sheets"."chapter_id") AS "classeur_chapter_write_ok")) WITH CHECK (( SELECT "private"."classeur_chapter_write_ok"("classeur_tracking_sheets"."chapter_id") AS "classeur_chapter_write_ok"));



ALTER TABLE "public"."daily_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_reports delete (page:repjour)" ON "public"."daily_reports" FOR DELETE TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2));



CREATE POLICY "daily_reports read (page:repjour)" ON "public"."daily_reports" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "daily_reports update (page:repjour)" ON "public"."daily_reports" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2)) WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2));



CREATE POLICY "daily_reports write (page:repjour)" ON "public"."daily_reports" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2));



ALTER TABLE "public"."easter_eggs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "easter_eggs delete (admin)" ON "public"."easter_eggs" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "easter_eggs insert (admin)" ON "public"."easter_eggs" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "easter_eggs read (authenticated)" ON "public"."easter_eggs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "easter_eggs update (admin)" ON "public"."easter_eggs" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."facturation_budget_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturation_issuer_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturation_issuer_denylist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturation_issuers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturation_learned_docs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturation_ref_comptes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturation_ref_imputations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturation_wordpool" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forecast_days" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forecast_days delete (page:repjour)" ON "public"."forecast_days" FOR DELETE TO "authenticated" USING ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "forecast_days read (page:repjour)" ON "public"."forecast_days" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "forecast_days update (page:repjour)" ON "public"."forecast_days" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2) AND "private"."repjour_manual_forecast_allowed"("year", "month")))) WITH CHECK (((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2) AND "private"."repjour_manual_forecast_allowed"("year", "month"))));



CREATE POLICY "forecast_days write (page:repjour)" ON "public"."forecast_days" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2) AND "private"."repjour_manual_forecast_allowed"("year", "month"))));



ALTER TABLE "public"."hotel_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotel_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hotel_rooms read (page:literie)" ON "public"."hotel_rooms" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "hotel_rooms write (page:literie)" ON "public"."hotel_rooms" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2)) WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2));



CREATE POLICY "issuer_codes read (page:facturation)" ON "public"."facturation_issuer_codes" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "issuer_denylist read (page:facturation)" ON "public"."facturation_issuer_denylist" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "issuers read (page:facturation)" ON "public"."facturation_issuers" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "learned_docs read (page:facturation)" ON "public"."facturation_learned_docs" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



ALTER TABLE "public"."literie_sheets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "literie_sheets read (page:literie)" ON "public"."literie_sheets" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "literie_sheets update (page:literie)" ON "public"."literie_sheets" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2))))) WITH CHECK (((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "literie_sheets write (page:literie)" ON "public"."literie_sheets" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('literie'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



ALTER TABLE "public"."literie_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "literie_stock read (page:literie)" ON "public"."literie_stock" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 1));



ALTER TABLE "public"."literie_stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "literie_stock_movements read (page:literie)" ON "public"."literie_stock_movements" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('literie'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "parking delete (page:parking)" ON "public"."parking_reservations" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('parking'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('parking'::"text")) AS "page_level_rank") >= 2) AND (("start_date" + ("nights")::integer) >= (CURRENT_DATE - 7)))));



CREATE POLICY "parking read (page:parking)" ON "public"."parking_reservations" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('parking'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "parking update (page:parking)" ON "public"."parking_reservations" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('parking'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('parking'::"text")) AS "page_level_rank") >= 2) AND (("start_date" + ("nights")::integer) >= (CURRENT_DATE - 7))))) WITH CHECK (((( SELECT "private"."get_page_level"('parking'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('parking'::"text")) AS "page_level_rank") >= 2) AND (("start_date" + ("nights")::integer) >= (CURRENT_DATE - 7)))));



CREATE POLICY "parking write (page:parking)" ON "public"."parking_reservations" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('parking'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('parking'::"text")) AS "page_level_rank") >= 2) AND ("start_date" >= (CURRENT_DATE - 7)))));



ALTER TABLE "public"."parking_reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parking_tarifs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parking_tarifs read (page:parking)" ON "public"."parking_tarifs" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('parking'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "pdj addon delete (page:pdj)" ON "public"."pdj_addon_production" FOR DELETE TO "authenticated" USING ((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "pdj addon read (page:pdj)" ON "public"."pdj_addon_production" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "pdj addon update (page:pdj)" ON "public"."pdj_addon_production" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3))))) WITH CHECK (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3)))));



CREATE POLICY "pdj addon write (page:pdj)" ON "public"."pdj_addon_production" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3)))));



CREATE POLICY "pdj delete (page:pdj)" ON "public"."pdj_breakfasts" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("manual_kind" IS NOT NULL) AND ("service_date" >= (CURRENT_DATE - 3)))));



CREATE POLICY "pdj externals delete (page:pdj)" ON "public"."pdj_externals" FOR DELETE TO "authenticated" USING ((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "pdj externals read (page:pdj)" ON "public"."pdj_externals" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "pdj externals update (page:pdj)" ON "public"."pdj_externals" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3))))) WITH CHECK (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3)))));



CREATE POLICY "pdj externals write (page:pdj)" ON "public"."pdj_externals" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3)))));



CREATE POLICY "pdj read (page:pdj)" ON "public"."pdj_breakfasts" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "pdj update (page:pdj)" ON "public"."pdj_breakfasts" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3))))) WITH CHECK (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3)))));



CREATE POLICY "pdj write (page:pdj)" ON "public"."pdj_breakfasts" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('pdj'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('pdj'::"text")) AS "page_level_rank") >= 2) AND ("service_date" >= (CURRENT_DATE - 3)))));



ALTER TABLE "public"."pdj_addon_production" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pdj_breakfasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pdj_externals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pms delete (page:repjour)" ON "public"."pms_daily_metrics" FOR DELETE TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2));



CREATE POLICY "pms update (page:repjour)" ON "public"."pms_daily_metrics" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2)) WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2));



CREATE POLICY "pms write (page:repjour)" ON "public"."pms_daily_metrics" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 2));



ALTER TABLE "public"."pms_daily_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pms_daily_metrics read (page:repjour)" ON "public"."pms_daily_metrics" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 1));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles insert (bornee)" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR (("id" = "auth"."uid"()) AND ("role" = 'utilisateur'::"text"))));



ALTER TABLE "public"."rapro_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rapro_rooms delete (page:rapro)" ON "public"."rapro_rooms" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "rapro_rooms read (page:rapro)" ON "public"."rapro_rooms" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "rapro_rooms update (page:rapro)" ON "public"."rapro_rooms" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2))))) WITH CHECK (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "rapro_rooms write (page:rapro)" ON "public"."rapro_rooms" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



ALTER TABLE "public"."rapro_sheets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rapro_sheets delete (page:rapro)" ON "public"."rapro_sheets" FOR DELETE TO "authenticated" USING (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "rapro_sheets read (page:rapro)" ON "public"."rapro_sheets" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "rapro_sheets update (page:rapro)" ON "public"."rapro_sheets" FOR UPDATE TO "authenticated" USING (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2))))) WITH CHECK (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "rapro_sheets write (page:rapro)" ON "public"."rapro_sheets" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "private"."get_page_level"('rapro'::"text") AS "get_page_level") = 'gestion'::"text") OR ((( SELECT "private"."page_level_rank"("private"."get_page_level"('rapro'::"text")) AS "page_level_rank") >= 2) AND ("report_date" >= (CURRENT_DATE - 2)))));



CREATE POLICY "ref_comptes read (page:facturation)" ON "public"."facturation_ref_comptes" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "ref_imputations read (page:facturation)" ON "public"."facturation_ref_imputations" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



ALTER TABLE "public"."repjour_auto_send_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "repjour_auto_send_log read (repjour:gestion)" ON "public"."repjour_auto_send_log" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 3));



ALTER TABLE "public"."report_send_throttle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."server_report_recipients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "srr delete (page:repjour gestion)" ON "public"."server_report_recipients" FOR DELETE TO "authenticated" USING ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "srr insert (page:repjour gestion)" ON "public"."server_report_recipients" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "srr read (page:repjour)" ON "public"."server_report_recipients" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('repjour'::"text")) AS "page_level_rank") >= 1));



CREATE POLICY "srr update (page:repjour gestion)" ON "public"."server_report_recipients" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text")) WITH CHECK ((( SELECT "private"."get_page_level"('repjour'::"text") AS "get_page_level") = 'gestion'::"text"));



CREATE POLICY "upp select self or admin" ON "public"."user_page_permissions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "private"."is_admin"()));



ALTER TABLE "public"."user_page_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wordpool read (page:facturation)" ON "public"."facturation_wordpool" FOR SELECT TO "authenticated" USING ((( SELECT "private"."page_level_rank"("private"."get_page_level"('facturation'::"text")) AS "page_level_rank") >= 1));



GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."admin_update_password"("target_user_id" "uuid", "new_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_update_password"("target_user_id" "uuid", "new_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."admin_update_password"("target_user_id" "uuid", "new_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."caisse_cloturee_figee"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."classeur_chapter_read_ok"("p_chapter_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_chapter_read_ok"("p_chapter_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_chapter_read_ok"("p_chapter_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_chapter_write_ok"("p_chapter_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_chapter_write_ok"("p_chapter_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_chapter_write_ok"("p_chapter_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_document_version"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."classeur_garde"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."classeur_gestion_ok"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_gestion_ok"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_gestion_ok"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_lecture_ligne"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_lecture_ligne"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_lecture_ligne"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_lecture_ok"("p_classeur_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_lecture_ok"("p_classeur_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_lecture_ok"("p_classeur_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_niveau"("p_classeur_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_niveau"("p_classeur_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_niveau"("p_classeur_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_niveau_de"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_niveau_de"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_niveau_de"("p_classeur_id" bigint, "p_created_by" "uuid", "p_acces_tous" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_personnes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_personnes"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_personnes"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."classeur_version_monotone"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."classeur_versions_suivent"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."classeur_write_ok"("p_classeur_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."classeur_write_ok"("p_classeur_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "private"."classeur_write_ok"("p_classeur_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "private"."daily_reports_occ"("p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."daily_reports_occ"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "private"."daily_reports_occ"("p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_budget_line_delete"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_budget_line_delete"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_budget_line_delete"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_delete"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_delete"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_delete"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_learn"("p_name" "text", "p_display" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_learn"("p_name" "text", "p_display" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_learn"("p_name" "text", "p_display" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_issuer_unlearn"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_issuer_unlearn"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_issuer_unlearn"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_learned_docs_delete"("p_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_learned_docs_delete"("p_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_learned_docs_delete"("p_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_learned_docs_forget"("p_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_learned_docs_forget"("p_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_learned_docs_forget"("p_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_ref_comptes_delete"("p_compte" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_ref_comptes_delete"("p_compte" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_ref_comptes_delete"("p_compte" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_ref_comptes_reimport"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_ref_comptes_reimport"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_ref_comptes_reimport"("p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_ref_delete"("p_code" "text", "p_compte" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_ref_delete"("p_code" "text", "p_compte" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_ref_delete"("p_code" "text", "p_compte" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_ref_reimport"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_ref_reimport"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_ref_reimport"("p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_ref_reimport_replace"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_ref_reimport_replace"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_ref_reimport_replace"("p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_wordpool_forget_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_wordpool_forget_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_wordpool_forget_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) TO "service_role";



REVOKE ALL ON FUNCTION "private"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "private"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "private"."get_page_level"("p_page" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_page_level"("p_page" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_page_level"("p_page" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."get_user_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_user_email"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."get_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."get_user_role"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "private"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."keep_author"("new_val" "uuid", "old_val" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."keep_author"("new_val" "uuid", "old_val" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."keep_author"("new_val" "uuid", "old_val" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."log_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."log_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."log_row_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."page_level_rank"("p_level" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."page_level_rank"("p_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."page_level_rank"("p_level" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."rapro_jour_cloture_fige"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."rapro_occupancy"("p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."rapro_occupancy"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "private"."rapro_occupancy"("p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "private"."remove_page_permission"("p_user" "uuid", "p_page" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."remove_page_permission"("p_user" "uuid", "p_page" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."remove_page_permission"("p_user" "uuid", "p_page" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."repjour_manual_forecast_allowed"("p_year" integer, "p_month" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."repjour_manual_forecast_allowed"("p_year" integer, "p_month" integer) TO "authenticated";
GRANT ALL ON FUNCTION "private"."repjour_manual_forecast_allowed"("p_year" integer, "p_month" integer) TO "service_role";



REVOKE ALL ON FUNCTION "private"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."set_user_grade"("p_user" "uuid", "p_grade" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."set_user_grade"("p_user" "uuid", "p_grade" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."set_user_grade"("p_user" "uuid", "p_grade" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_password"("target_user_id" "uuid", "new_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_password"("target_user_id" "uuid", "new_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_password"("target_user_id" "uuid", "new_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiche_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiche_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiche_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiche_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."baby_cot_assignments_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."baby_cot_assignments_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."caisse_cautions_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."caisse_cautions_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."caisse_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."caisse_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."caisse_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."caisse_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."classeur_merge_history_taille"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classeur_merge_history_taille"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."classeur_personnes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classeur_personnes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."classeur_personnes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."classeur_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classeur_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."daily_reports_occ"("p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."daily_reports_occ"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."daily_reports_occ"("p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."daily_reports_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."daily_reports_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dismiss_send_reminder"("p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dismiss_send_reminder"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dismiss_send_reminder"("p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."easter_eggs_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."easter_eggs_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_budget_line_delete"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_budget_line_delete"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_budget_line_delete"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_budget_line_upsert"("p_code" "text", "p_label" "text", "p_category" "text", "p_hint" "text", "p_tags" "text"[], "p_sort" integer, "p_create" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_budget_lines_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_budget_lines_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_forget"("p_issuer" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_learn"("p_issuer" "text", "p_codes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_codes_unlearn"("p_issuer" "text", "p_codes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_delete"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_delete"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_delete"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_denylist_add"("p_issuer" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_denylist_remove"("p_issuer" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_learn"("p_name" "text", "p_display" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_learn"("p_name" "text", "p_display" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_learn"("p_name" "text", "p_display" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_merge"("p_from_name" "text", "p_to_name" "text", "p_display" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_rename"("p_old_name" "text", "p_new_name" "text", "p_display" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_issuer_unlearn"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_issuer_unlearn"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_issuer_unlearn"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_learn_document"("p_hash" "text", "p_issuer" "text", "p_display" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_comptes" "jsonb", "p_method" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_learned_docs_delete"("p_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_learned_docs_delete"("p_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_learned_docs_delete"("p_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_learned_docs_forget"("p_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_learned_docs_forget"("p_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_learned_docs_forget"("p_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_learned_docs_record"("p_hash" "text", "p_issuer" "text", "p_codes" "text"[], "p_deltas" "jsonb", "p_method" "text", "p_comptes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_comptes_delete"("p_compte" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_comptes_delete"("p_compte" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_ref_comptes_delete"("p_compte" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_comptes_reimport"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_comptes_reimport"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_ref_comptes_reimport"("p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_comptes_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_comptes_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_ref_comptes_upsert"("p_compte" "text", "p_libelle" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_delete"("p_code" "text", "p_compte" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_delete"("p_code" "text", "p_compte" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_ref_delete"("p_code" "text", "p_compte" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_imputations_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_imputations_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_reimport"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_reimport"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_ref_reimport"("p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_reimport_replace"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_reimport_replace"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_ref_reimport_replace"("p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_ref_upsert"("p_code" "text", "p_compte" "text", "p_section" "text", "p_libelle" "text", "p_description" "text", "p_sort" integer, "p_create" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_wordpool_forget_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_wordpool_forget_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_wordpool_forget_code"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_wordpool_learn"("p_codes" "text"[], "p_deltas" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_wordpool_prune"("p_min_count" integer, "p_top_k" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_wordpool_unlearn"("p_codes" "text"[], "p_deltas" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_access"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."hotel_rooms_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hotel_rooms_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."literie_sheets_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."literie_sheets_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."parking_no_past_rewrite"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parking_no_past_rewrite"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."parking_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parking_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pdj_addon_production_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pdj_addon_production_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pdj_clamp_breakfasts_included"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pdj_clamp_breakfasts_included"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pdj_externals_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pdj_externals_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pdj_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pdj_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pms_daily_metrics_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pms_daily_metrics_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_self_role_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_self_role_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapro_occupancy"("p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapro_occupancy"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rapro_occupancy"("p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapro_rooms_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapro_rooms_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapro_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapro_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rapro_sheets_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rapro_sheets_stamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_page_permission"("p_user" "uuid", "p_page" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_page_permission"("p_user" "uuid", "p_page" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_page_permission"("p_user" "uuid", "p_page" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."repjour_analytique_annuelle"("p_annee" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repjour_analytique_annuelle"("p_annee" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."repjour_analytique_annuelle"("p_annee" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."repjour_analytique_mensuelle"("p_annee" integer, "p_mois" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repjour_analytique_mensuelle"("p_annee" integer, "p_mois" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."repjour_analytique_mensuelle"("p_annee" integer, "p_mois" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."repjour_dashboard"("p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repjour_dashboard"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."repjour_dashboard"("p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_page_permission"("p_user" "uuid", "p_page" "text", "p_level" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_grade"("p_user" "uuid", "p_grade" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_grade"("p_user" "uuid", "p_grade" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_grade"("p_user" "uuid", "p_grade" "text") TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."affiche_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."affiche_templates" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."baby_cot_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."baby_cot_assignments" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."baby_cots" TO "authenticated";
GRANT ALL ON TABLE "public"."baby_cots" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."budget" TO "authenticated";
GRANT ALL ON TABLE "public"."budget" TO "service_role";



GRANT ALL ON SEQUENCE "public"."budget_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."budget_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."caisse_cautions" TO "authenticated";
GRANT ALL ON TABLE "public"."caisse_cautions" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."caisse_sheets" TO "authenticated";
GRANT ALL ON TABLE "public"."caisse_sheets" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_acces" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_acces" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_acces_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_acces_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_chapters" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_chapters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_chapters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_chapters_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_classeurs" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_classeurs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_classeurs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_classeurs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."classeur_document_versions" TO "service_role";
GRANT SELECT ON TABLE "public"."classeur_document_versions" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."classeur_document_versions_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_documents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_documents_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_images" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_images" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_images_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_images_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_intercalaires" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_intercalaires" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_intercalaires_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_intercalaires_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_merge_history" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_merge_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_merge_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_merge_history_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_periodicites" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_periodicites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_periodicites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_periodicites_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_signature_sheets" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_signature_sheets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_signature_sheets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_signature_sheets_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."classeur_tracking_sheets" TO "authenticated";
GRANT ALL ON TABLE "public"."classeur_tracking_sheets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."classeur_tracking_sheets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."classeur_tracking_sheets_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."daily_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_reports_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."easter_eggs" TO "authenticated";
GRANT ALL ON TABLE "public"."easter_eggs" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_budget_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_budget_lines" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_issuer_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_issuer_codes" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_issuer_denylist" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_issuer_denylist" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_learned_docs" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_learned_docs" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_issuer_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_issuer_memory" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_issuers" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_issuers" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_ref_comptes" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_ref_comptes" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_ref_imputations" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_ref_imputations" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."facturation_wordpool" TO "authenticated";
GRANT ALL ON TABLE "public"."facturation_wordpool" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."forecast_days" TO "authenticated";
GRANT ALL ON TABLE "public"."forecast_days" TO "service_role";



GRANT ALL ON SEQUENCE "public"."forecast_days_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."forecast_days_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hotel_config" TO "authenticated";
GRANT ALL ON TABLE "public"."hotel_config" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."hotel_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."hotel_rooms" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."literie_sheets" TO "authenticated";
GRANT ALL ON TABLE "public"."literie_sheets" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."literie_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."literie_stock" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."literie_stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."literie_stock_movements" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parking_reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."parking_reservations" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parking_tarifs" TO "authenticated";
GRANT ALL ON TABLE "public"."parking_tarifs" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parking_arrivals_agg" TO "authenticated";
GRANT ALL ON TABLE "public"."parking_arrivals_agg" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."parking_daily_occupation" TO "authenticated";
GRANT ALL ON TABLE "public"."parking_daily_occupation" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."pdj_addon_production" TO "authenticated";
GRANT ALL ON TABLE "public"."pdj_addon_production" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."pdj_breakfasts" TO "authenticated";
GRANT ALL ON TABLE "public"."pdj_breakfasts" TO "service_role";



GRANT ALL ON TABLE "public"."pdj_daily_agg" TO "service_role";
GRANT SELECT ON TABLE "public"."pdj_daily_agg" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."pdj_externals" TO "authenticated";
GRANT ALL ON TABLE "public"."pdj_externals" TO "service_role";



GRANT ALL ON TABLE "public"."pdj_service_dates" TO "service_role";
GRANT SELECT ON TABLE "public"."pdj_service_dates" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."pms_daily_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."pms_daily_metrics" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rapro_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rapro_rooms" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rapro_sheets" TO "authenticated";
GRANT ALL ON TABLE "public"."rapro_sheets" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rapro_daily_agg" TO "authenticated";
GRANT ALL ON TABLE "public"."rapro_daily_agg" TO "service_role";



GRANT ALL ON TABLE "public"."repjour_auto_send_log" TO "service_role";
GRANT SELECT ON TABLE "public"."repjour_auto_send_log" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."repjour_auto_send_log_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."report_send_throttle" TO "authenticated";
GRANT ALL ON TABLE "public"."report_send_throttle" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."server_report_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."server_report_recipients" TO "service_role";



GRANT ALL ON SEQUENCE "public"."server_report_recipients_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."server_report_recipients_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."user_page_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_page_permissions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







