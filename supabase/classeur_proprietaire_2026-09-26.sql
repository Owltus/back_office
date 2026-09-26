-- =============================================================================
-- classeur_proprietaire_2026-09-26.sql — droits PAR CLASSEUR, sur le modèle
-- de l'Affichage (affiche_owner_model.sql) : le niveau `ecriture` ne modifie
-- que les classeurs qu'il a créés, `gestion` (et l'admin) tout.
--
-- Application : `supabase db query --linked -f supabase/classeur_proprietaire_2026-09-26.sql`
-- L'autorité `classeur_2026-09-25.sql` (section 5) porte le MÊME bloc :
-- rejouer l'un ou l'autre donne le même résultat.
--
-- Demande utilisateur (2026-09-26) : « regarder le principe de droits de la
--   page Affichage et faire pareil pour les registres, pour que les
--   utilisateurs aient des droits pour modifier ou non les classeurs ».
--
-- Avant : toute écriture (insert/update, dont la suppression douce) sur les
--   6 tables de contenu exigeait seulement le rang >= 2 sur la page ; un
--   compte `ecriture` pouvait donc réécrire le Registre de Sécurité d'un
--   autre.
--
-- Après :
--   - `classeur_classeurs` : INSERT rang >= 2 (le créateur devient
--     propriétaire, `created_by` posé par le trigger `classeur_stamp`) ;
--     UPDATE (dont suppression douce) gestion OU propriétaire de rang >= 2 ;
--     DELETE physique gestion seule (inchangé).
--   - `classeur_chapters` et les 4 tables d'éléments : INSERT/UPDATE gestion
--     OU propriétaire du classeur parent (résolu par les aides ci-dessous).
--   - `classeur_merge_history` : INSERT idem ; DELETE gestion, ou point
--     `auto` d'un classeur dont on est propriétaire.
--   - Lecture : inchangée (rang >= 1 sur tout).
--
-- Aides (schéma `private`, security definer, comme get_page_level) :
--   private.classeur_write_ok(classeur_id)   gestion, ou ecriture ET propriétaire
--   private.classeur_chapter_write_ok(chapter_id)  idem, via le chapitre
--   ⚠ À déclarer dans `verif_advisor.sql` (listes d'aides, contrôles 8 et 9).
--
-- Innocuité : create or replace + drop/create policy (mêmes noms qu'avant),
--   aucune donnée touchée. Les deux classeurs existants ont un `created_by`
--   (l'admin) : rien à renseigner.
--
-- Vérification : fin de script, lecture seule ; puis un test RLS en
--   transaction annulée (voir le compte rendu du 26/09).
-- =============================================================================

begin;

-- 1) Aides ------------------------------------------------------------------

create or replace function private.classeur_write_ok(p_classeur_id bigint)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    (select private.get_page_level('classeur')) = 'gestion'
    or (
      (select private.page_level_rank(private.get_page_level('classeur'))) >= 2
      and exists (
        select 1 from public.classeur_classeurs c
        where c.id = p_classeur_id and c.created_by = auth.uid()
      )
    );
$function$;

create or replace function private.classeur_chapter_write_ok(p_chapter_id bigint)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select private.classeur_write_ok(ch.classeur_id)
       from public.classeur_chapters ch
      where ch.id = p_chapter_id),
    false);
$function$;

revoke execute on function private.classeur_write_ok(bigint) from public, anon;
grant execute on function private.classeur_write_ok(bigint) to authenticated, service_role;
revoke execute on function private.classeur_chapter_write_ok(bigint) from public, anon;
grant execute on function private.classeur_chapter_write_ok(bigint) to authenticated, service_role;

-- 2) Classeur : insert rang >= 2, update gestion ou propriétaire -------------

drop policy if exists "classeur_classeurs insert (page:classeur)" on public.classeur_classeurs;
create policy "classeur_classeurs insert (page:classeur)"
  on public.classeur_classeurs for insert to authenticated
  with check ((select private.page_level_rank(private.get_page_level('classeur'))) >= 2);

drop policy if exists "classeur_classeurs update (page:classeur)" on public.classeur_classeurs;
create policy "classeur_classeurs update (page:classeur)"
  on public.classeur_classeurs for update to authenticated
  using ((select private.classeur_write_ok(id)))
  with check ((select private.classeur_write_ok(id)));

-- 3) Chapitres : par le classeur parent ---------------------------------------

drop policy if exists "classeur_chapters insert (page:classeur)" on public.classeur_chapters;
create policy "classeur_chapters insert (page:classeur)"
  on public.classeur_chapters for insert to authenticated
  with check ((select private.classeur_write_ok(classeur_id)));

drop policy if exists "classeur_chapters update (page:classeur)" on public.classeur_chapters;
create policy "classeur_chapters update (page:classeur)"
  on public.classeur_chapters for update to authenticated
  using ((select private.classeur_write_ok(classeur_id)))
  with check ((select private.classeur_write_ok(classeur_id)));

-- 4) Éléments : par le chapitre parent ----------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'classeur_documents', 'classeur_tracking_sheets',
    'classeur_signature_sheets', 'classeur_intercalaires'
  ] loop
    execute format('drop policy if exists "%s insert (page:classeur)" on public.%I', t, t);
    execute format(
      'create policy "%s insert (page:classeur)" on public.%I for insert to authenticated
         with check ((select private.classeur_chapter_write_ok(chapter_id)))', t, t);
    execute format('drop policy if exists "%s update (page:classeur)" on public.%I', t, t);
    execute format(
      'create policy "%s update (page:classeur)" on public.%I for update to authenticated
         using ((select private.classeur_chapter_write_ok(chapter_id)))
         with check ((select private.classeur_chapter_write_ok(chapter_id)))', t, t);
  end loop;
end $$;

-- 5) Points de restauration : par le classeur ---------------------------------

drop policy if exists "classeur_merge_history insert (page:classeur)" on public.classeur_merge_history;
create policy "classeur_merge_history insert (page:classeur)"
  on public.classeur_merge_history for insert to authenticated
  with check ((select private.classeur_write_ok(classeur_id)));

drop policy if exists "classeur_merge_history delete (page:classeur)" on public.classeur_merge_history;
create policy "classeur_merge_history delete (page:classeur)"
  on public.classeur_merge_history for delete to authenticated
  using (
    (select private.get_page_level('classeur')) = 'gestion'
    or (kind = 'auto' and (select private.classeur_write_ok(classeur_id)))
  );

commit;

-- 6) Vérification (lecture seule) ---------------------------------------------

select 'aides presentes dans private, absentes de public' as controle,
       ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private'
            and p.proname in ('classeur_write_ok', 'classeur_chapter_write_ok')) = 2
        and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('classeur_write_ok', 'classeur_chapter_write_ok')) = 0)::text as ok
union all
select 'aides fermees a anon et PUBLIC',
       (not has_function_privilege('anon', 'private.classeur_write_ok(bigint)', 'execute')
        and not has_function_privilege('anon', 'private.classeur_chapter_write_ok(bigint)', 'execute'))::text
union all
select 'aides : search_path fige',
       ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private'
            and p.proname in ('classeur_write_ok', 'classeur_chapter_write_ok')
            and p.proconfig::text like '%search_path%') = 2)::text
union all
select '12 policies insert/update de contenu passent par un proprietaire',
       ((select count(*) from pg_policies
          where schemaname = 'public' and tablename like 'classeur\_%'
            and cmd in ('INSERT', 'UPDATE')
            and (coalesce(qual, '') || coalesce(with_check, '')) like '%write_ok%') = 12)::text
union all
select 'insert classeur reste au rang >= 2 (le createur devient proprietaire)',
       ((select count(*) from pg_policies
          where tablename = 'classeur_classeurs' and cmd = 'INSERT'
            and with_check like '%page_level_rank%' and with_check not like '%write_ok%') = 1)::text
union all
select 'delete historique : gestion ou auto du proprietaire',
       ((select count(*) from pg_policies
          where tablename = 'classeur_merge_history' and cmd = 'DELETE'
            and qual like '%kind = ''auto''%' and qual like '%write_ok%') = 1)::text
union all
select 'toujours 23 policies classeur_*',
       ((select count(*) from pg_policies where schemaname = 'public' and tablename like 'classeur\_%') = 23)::text
union all
select 'tous les classeurs ont un proprietaire',
       ((select count(*) from public.classeur_classeurs where created_by is null) = 0)::text;
