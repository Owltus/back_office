-- =============================================================================
-- classeur_images_2026-09-26.sql — images des documents du Classeur :
-- bucket Storage `classeur-images` + policies.
--
-- Application : `supabase db query --linked -f supabase/classeur_images_2026-09-26.sql`
--
-- Demande utilisateur (2026-09-26) : « un truc de très simple pour les
--   images : je te donne une image, avant de la stocker tu la passes en WebP,
--   avec une compression assez énervée mais sans trop de perte ».
--
-- Modèle :
--   - la CONVERSION est faite par le navigateur (`lib/classeur/images.ts`) :
--     redimension au plus long côté 1600 px, encodage WebP qualité 0,8 ;
--     le bucket n'accepte QUE `image/webp` et 2 Mo au plus, donc rien
--     d'autre ne peut y être écrit, quel que soit le client ;
--   - chemin `<classeur_id>/<uuid>.webp` : le premier dossier est le
--     classeur, la RLS d'écriture réutilise `private.classeur_write_ok` —
--     un compte n'ajoute une image qu'à un classeur qu'il peut modifier ;
--   - bucket PRIVÉ (révisé le jour même sur refus de l'utilisateur d'une
--     exposition publique) : AUCUNE URL publique. Le Markdown porte le
--     CHEMIN (`![nom](2/uuid.webp)`), l'app télécharge l'image par l'API
--     authentifiée (`storage.download`, RLS de lecture appliquée à chaque
--     requête) et l'affiche par une URL `blob:` locale au navigateur — à
--     l'écran comme dans l'iframe d'impression (même origine). Un chemin
--     connu ne donne rien sans session ET sans droit de lecture sur la
--     page Classeur ;
--   - pas de policy UPDATE (une image ne se réécrit pas : on en ajoute une
--     autre) ; DELETE aux mêmes conditions que l'INSERT.
--
-- Innocuité : insert … on conflict sur le bucket ; drop/create des 3
--   policies (noms propres au bucket). Aucune donnée touchée.
--
-- CSP : `img-src 'self' data: blob:` suffit (les images sont des `blob:`) ;
--   l'hôte Supabase n'a PAS à y figurer.
-- =============================================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('classeur-images', 'classeur-images', false, 2097152, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lecture (download / list) par l'API authentifiée : rang >= 1 sur la page.
-- C'est la SEULE voie de lecture : le bucket est privé.
drop policy if exists "classeur-images read (page:classeur)" on storage.objects;
create policy "classeur-images read (page:classeur)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'classeur-images'
    and (select private.page_level_rank(private.get_page_level('classeur'))) >= 1
  );

-- Écriture : chemin `<classeur_id>/<uuid>.webp`, classeur modifiable par
-- l'appelant (gestion, ou écriture ET propriétaire).
drop policy if exists "classeur-images insert (page:classeur)" on storage.objects;
create policy "classeur-images insert (page:classeur)"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'classeur-images'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9]{1,12}$'
    and storage.extension(name) = 'webp'
    and (select private.classeur_write_ok(((storage.foldername(name))[1])::bigint))
  );

drop policy if exists "classeur-images delete (page:classeur)" on storage.objects;
create policy "classeur-images delete (page:classeur)"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'classeur-images'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9]{1,12}$'
    and (select private.classeur_write_ok(((storage.foldername(name))[1])::bigint))
  );

commit;

-- Vérification (lecture seule) --------------------------------------------------
select 'bucket PRIVE, 2 Mo, webp seul' as controle,
       ((select count(*) from storage.buckets
          where id = 'classeur-images' and not public
            and file_size_limit = 2097152
            and allowed_mime_types = array['image/webp']) = 1)::text as ok
union all
select '3 policies classeur-images (select, insert, delete)',
       ((select count(*) from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'classeur-images %') = 3)::text
union all
select 'aucune policy update',
       ((select count(*) from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'classeur-images %' and cmd = 'UPDATE') = 0)::text
union all
select 'insert et delete passent par le proprietaire du classeur',
       ((select count(*) from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'classeur-images %' and cmd in ('INSERT', 'DELETE')
            and (coalesce(qual, '') || coalesce(with_check, '')) like '%classeur_write_ok%') = 2)::text;
