-- =============================================================================
-- classeur_securite_2026-09-28.sql — DURCISSEMENT après l'audit de sécurité
-- du Classeur (2026-09-28 : agent catalogue + tests d'attaque en transaction
-- annulée). Aucune faille critique ; ce script ferme les écarts PROUVÉS.
--
-- Application : `supabase db query --linked -f supabase/classeur_securite_2026-09-28.sql`
-- Contrôle    : `supabase db query --linked -f supabase/verif_classeur_acces.sql`
-- L'autorité `classeur_2026-09-25.sql` porte le même bloc (section 9).
--
-- 1) Identifiants en `generated ALWAYS` (M1). `by default` laissait un
--    compte `ecriture` créer un classeur avec un `id` CHOISI : après une
--    suppression physique, il reprenait l'identifiant d'un classeur caché,
--    en devenait le créateur (donc écrivain) et héritait de ses fichiers
--    restés sous `<id>/` dans le stockage (aucune clé étrangère). Aucun
--    code de l'app ne fournit d'`id` (vérifié).
-- 2) Horodatages bornés au présent (+ 5 min de dérive d'horloge). La fusion
--    fournit `updated_at` (dernier écrit gagne) ; un horodatage futur
--    gagnait toutes les fusions suivantes et faisait échapper un point de
--    restauration à l'élagage.
-- 3) Création d'un classeur hors gestion : `deleted_at` nul et rangé EN FIN
--    de liste (B2 : `sort_order = -1000` le plaçait en tête chez tout le
--    monde alors que réordonner la liste est réservé à la gestion).
-- 4) Fiche image cohérente avec son dossier (B1) : le chemin commence par
--    l'identifiant du classeur. Sans cela, une fiche de A pouvait « prendre »
--    le chemin d'un fichier de B (unicité) et faire supprimer le fichier de
--    B depuis la médiathèque de A. 103 fiches existantes : toutes conformes.
-- 5) L'historique suit le document (B4) : un document déplacé vers un autre
--    classeur (ou son chapitre) emporte ses versions — elles restaient
--    lisibles par les lecteurs de l'ANCIEN classeur.
-- 6) `search_path` vide sur `private.classeur_chapter_write_ok` (definer ;
--    non exploitable, `public` n'étant pas inscriptible, mais c'était la
--    seule aide classeur à ne pas suivre la règle).
--
-- Innocuité : contrainte validée sur des données déjà conformes, triggers et
--   fonctions remplacés ; la seule réécriture de données possible est le
--   réalignement 5), qui ne touche AUCUNE ligne aujourd'hui (vérifié :
--   toutes les versions sont dans le classeur de leur document).
-- =============================================================================

begin;

-- 1) Identifiants : generated always ------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname like 'classeur\_%'
       and a.attname = 'id' and a.attidentity = 'd'
  loop
    execute format('alter table public.%I alter column id set generated always', t);
  end loop;
end $$;

-- 2) Estampillage : horodatages bornés au présent ------------------------------
create or replace function public.classeur_stamp()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
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
$function$;
revoke execute on function public.classeur_stamp() from public, anon, authenticated;

-- 3) Garde du classeur : création rangée en fin de liste -----------------------
create or replace function private.classeur_garde()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
revoke execute on function private.classeur_garde() from public, anon, authenticated;

-- 4) Fiche image : chemin dans le dossier de SON classeur ----------------------
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'classeur_images_chemin_du_classeur') then
    alter table public.classeur_images
      add constraint classeur_images_chemin_du_classeur
      check (split_part(chemin, '/', 1) = classeur_id::text);
  end if;
end $$;

-- 5) L'historique suit le document ------------------------------------------------
create or replace function private.classeur_versions_suivent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
revoke execute on function private.classeur_versions_suivent() from public, anon, authenticated;

drop trigger if exists classeur_versions_suivent on public.classeur_documents;
create trigger classeur_versions_suivent
  after update of chapter_id on public.classeur_documents
  for each row execute function private.classeur_versions_suivent();
drop trigger if exists classeur_versions_suivent on public.classeur_chapters;
create trigger classeur_versions_suivent
  after update of classeur_id on public.classeur_chapters
  for each row execute function private.classeur_versions_suivent();

-- 6) search_path vide ----------------------------------------------------------------
alter function private.classeur_chapter_write_ok(bigint) set search_path = '';

commit;
