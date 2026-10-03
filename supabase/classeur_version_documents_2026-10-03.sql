-- Classeur : NUMÉRO DE VERSION des documents, X.Y (2026-10-03).
--
-- Demande utilisateur : « un versionnage automatique, décimal (1.1, 1.2,
--   3.4) en fonction du contenu modifié, de manière logique, sans IA ; le
--   document peut être restauré à une version plus ancienne : garder une
--   logique simple pour repartir de cette version ».
-- Modèle :
--   - le NUMÉRO vit sur le document (`version_majeure`, `version_mineure`),
--     calculé par l'app à l'enregistrement (`lib/classeur/versionDocument.ts`,
--     règles déterministes : correction de forme = inchangé, contenu = +0.1,
--     procédure — étape, titre, encadré Attention/Important, > 30 % du
--     texte — = version majeure) avec sa RAISON (`version_raison`) ;
--   - chaque ligne de l'historique (`classeur_document_versions`) fige le
--     numéro et la raison de la version qu'elle conserve (trigger) ;
--   - un numéro NE RECULE JAMAIS (trigger `classeur_version_monotone`) :
--     reprendre une ancienne version donne un NOUVEAU numéro, jamais
--     l'ancien — deux papiers « 1.3 » différents ne peuvent pas exister.
-- Les documents existants partent en 1.0 ; l'historique déjà enregistré
--   garde un numéro vide (antérieur au versionnage).
--
-- Innocuité : ajout de colonnes avec valeur par défaut, contraintes de
--   bornes, une fonction trigger de plus (BEFORE UPDATE, ne bloque rien : elle
--   ramène un numéro qui reculerait), la fonction d'historique REMPLACÉE à
--   l'identique + deux colonnes. Rien n'est supprimé. Rejouable.
-- Droits : grants de TABLE pour authenticated (les colonnes en héritent) ;
--   RLS inchangée. Fonctions dans `private`, `search_path` vide, fermées à
--   anon/authenticated/public.

begin;

-- 1) Le numéro sur le document ------------------------------------------------
alter table public.classeur_documents
  add column if not exists version_majeure integer not null default 1,
  add column if not exists version_mineure integer not null default 0,
  add column if not exists version_raison text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'classeur_documents_version_check') then
    alter table public.classeur_documents
      add constraint classeur_documents_version_check check (
        version_majeure between 1 and 9999
        and version_mineure between 0 and 9999
        and char_length(version_raison) <= 300);
  end if;
end $$;

-- 2) Le numéro sur chaque version conservée -----------------------------------
alter table public.classeur_document_versions
  add column if not exists version text not null default '',
  add column if not exists raison text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'classeur_document_versions_version_check') then
    alter table public.classeur_document_versions
      add constraint classeur_document_versions_version_check check (
        char_length(version) <= 20 and char_length(raison) <= 300);
  end if;
end $$;

-- 3) Un numéro ne recule jamais -----------------------------------------------
create or replace function private.classeur_version_monotone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.version_majeure, new.version_mineure)
     < (old.version_majeure, old.version_mineure) then
    new.version_majeure := old.version_majeure;
    new.version_mineure := old.version_mineure;
  end if;
  return new;
end;
$$;

revoke all on function private.classeur_version_monotone() from public, anon, authenticated;

drop trigger if exists classeur_version_monotone on public.classeur_documents;
create trigger classeur_version_monotone
  before update of version_majeure, version_mineure on public.classeur_documents
  for each row execute function private.classeur_version_monotone();

-- 4) L'historique fige le numéro et la raison ---------------------------------
--    Identique à la définition en production (relue par pg_get_functiondef le
--    2026-10-03) ; seuls changent les deux colonnes `version`, `raison`.
create or replace function private.classeur_document_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function private.classeur_document_version() from public, anon, authenticated;

commit;

-- 5) VÉRIFICATION (lecture seule) — tout doit être `true` ----------------------
select n, controle, ok from (
  select 1 n, 'colonnes version sur classeur_documents' controle,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'classeur_documents'
        and column_name in ('version_majeure', 'version_mineure', 'version_raison')) = 3 ok
  union all
  select 2, 'colonnes version/raison sur l historique',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'classeur_document_versions'
        and column_name in ('version', 'raison')) = 2
  union all
  select 3, 'trigger monotone pose',
    exists (select 1 from pg_trigger where tgname = 'classeur_version_monotone' and not tgisinternal)
  union all
  select 4, 'fonctions fermees a authenticated',
    not has_function_privilege('authenticated', 'private.classeur_version_monotone()', 'execute')
    and not has_function_privilege('authenticated', 'private.classeur_document_version()', 'execute')
  union all
  select 5, 'documents existants en 1.0',
    not exists (select 1 from public.classeur_documents
                 where version_majeure <> 1 or version_mineure <> 0)
) v order by n;
