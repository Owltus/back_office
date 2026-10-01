-- Images du Classeur : l'ORIGINAL est conservé (2026-10-01).
--
-- Demande utilisateur : « prendre toujours l'image au complet et la garder en
--   base, compressée ; si je la recadre, je ne perds pas les données de
--   base ; pouvoir la remettre en forme comme je veux ».
-- Modèle (non destructif, comme Lightroom / Google Photos) :
--   - `chemin`          : copie d'AFFICHAGE, image ENTIÈRE allégée (1600 px de
--                         côté, WebP 0,8) — c'est elle que les documents
--                         référencent et que l'éditeur charge ;
--   - `original_chemin` : l'ORIGINAL, résolution d'origine, WebP compressé
--                         (`<classeur>/<uuid>.original.webp`) — jamais
--                         retouché ;
--   - le recadrage et la taille ne touchent plus aucun fichier : ce sont des
--     réglages écrits dans le document, appliqués à l'affichage.
-- Les fiches existantes gardent `original_*` à NULL (l'image envoyée avant
-- ce jour n'avait pas d'original conservé).
--
-- Innocuité : ajout de colonnes nullables et de contraintes vérifiées sur des
--   valeurs NULL ; relèvement de la taille maximale d'un fichier du bucket
--   (2 Mo → 20 Mo, pour les originaux de téléphone). Rien n'est supprimé.
--   Rejouable (if not exists / garde sur les contraintes).
-- Droits : grants de TABLE pour authenticated (les nouvelles colonnes en
--   héritent) ; RLS et policies Storage inchangées (dossier = classeur,
--   extension `webp`).

begin;

alter table public.classeur_images
  add column if not exists original_chemin text,
  add column if not exists original_largeur integer,
  add column if not exists original_hauteur integer,
  add column if not exists original_taille integer;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'classeur_images_original_chemin_check') then
    alter table public.classeur_images
      add constraint classeur_images_original_chemin_check check (
        original_chemin is null
        or (original_chemin ~ '^[0-9]{1,12}/[0-9a-f-]{36}\.original\.webp$'
            and split_part(original_chemin, '/', 1) = classeur_id::text)
      );
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'classeur_images_original_dims_check') then
    alter table public.classeur_images
      add constraint classeur_images_original_dims_check check (
        (original_largeur is null or original_largeur >= 0)
        and (original_hauteur is null or original_hauteur >= 0)
        and (original_taille is null or original_taille >= 0)
      );
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'classeur_images_original_chemin_key') then
    alter table public.classeur_images
      add constraint classeur_images_original_chemin_key unique (original_chemin);
  end if;
end
$$;

update storage.buckets
   set file_size_limit = 20 * 1024 * 1024
 where id = 'classeur-images';

commit;

-- Vérification (lecture seule) : tout doit être `true`.
select
  (select count(*) from information_schema.columns
    where table_name = 'classeur_images' and column_name like 'original\_%') = 4
    as quatre_colonnes,
  (select count(*) from pg_constraint
    where conname in ('classeur_images_original_chemin_check',
                      'classeur_images_original_dims_check',
                      'classeur_images_original_chemin_key')) = 3
    as trois_contraintes,
  (select file_size_limit from storage.buckets where id = 'classeur-images')
    = 20 * 1024 * 1024 as limite_20_mo,
  (select count(*) from public.classeur_images where original_chemin is not null) = 0
    as anciennes_fiches_intactes;
