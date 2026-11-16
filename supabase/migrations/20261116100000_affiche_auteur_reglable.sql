-- =============================================================================
-- Affichage : la gestion de la page peut changer l'AUTEUR d'un modèle
-- (demande utilisateur du 2026-11-16 : « chaque utilisateur a des droits selon
-- que c'est lui qui l'a créé ou non ; en gestion, on peut modifier cela »).
--
-- L'auteur (`created_by`) décide qui modifie un modèle : un compte en écriture
-- ne touche qu'aux siens (policies « affiche update / delete », inchangées).
-- Jusqu'ici le trigger d'estampille le figeait pour tout le monde.
--
-- 1. `affiche_stamp` : à la mise à jour, un auteur DIFFÉRENT n'est gardé que si
--    l'appelant a la gestion de la page (l'admin l'a toujours) ; sinon l'ancien
--    est remis, comme avant. Le nouvel auteur doit pouvoir écrire sur la page
--    (admin, ou droit écriture / gestion), sinon refus 23514 : il ne pourrait
--    rien faire de « son » modèle. Auteur vide = modèle de base (gestion seule).
--    Insertion inchangée (auteur = le créateur), contexte système inchangé.
-- 2. `affiche_personnes()` : les personnes qui peuvent être auteur (prénom,
--    nom, nom affiché ; jamais l'e-mail), pour la gestion de la page seulement.
--    Fonction dans `private`, relais `security invoker` dans `public`.
--
-- Ajout seul : corps de fonction remplacé sous le même nom, une fonction neuve.
-- =============================================================================

create or replace function private.affiche_peut_etre_auteur(p_user uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user
       and (p.role = 'admin'
            or exists (select 1 from public.user_page_permissions u
                        where u.user_id = p.id and u.page = 'affichage'
                          and u.level in ('ecriture', 'gestion')))
  );
$$;

revoke all on function private.affiche_peut_etre_auteur(uuid) from public;
grant execute on function private.affiche_peut_etre_auteur(uuid) to authenticated, service_role;

create or replace function public.affiche_stamp() returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_at := now();
    return new;
  end if;

  new.updated_at := now();
  if new.created_by is distinct from old.created_by
     and auth.uid() is not null
     and private.get_page_level('affichage') is not distinct from 'gestion' then
    -- 2026-11-16 : la gestion change l'auteur ; il doit pouvoir écrire ici.
    if new.created_by is not null
       and not private.affiche_peut_etre_auteur(new.created_by) then
      raise exception 'Cette personne n''a pas le droit de modifier les affiches.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  new.created_by := private.keep_author(new.created_by, old.created_by);
  return new;
end;
$$;

create or replace function private.affiche_personnes()
returns table (id uuid, prenom text, nom text, nom_affiche text)
language plpgsql stable security definer
set search_path to ''
as $$
begin
  if private.get_page_level('affichage') is distinct from 'gestion' then
    raise exception 'Réservé à la gestion de la page Affichage.' using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(p.first_name, ''), coalesce(p.last_name, ''),
           coalesce(p.display_name, '')
      from public.profiles p
     where private.affiche_peut_etre_auteur(p.id)
     order by coalesce(nullif(p.last_name, ''), p.display_name), p.first_name;
end;
$$;

revoke all on function private.affiche_personnes() from public;
grant execute on function private.affiche_personnes() to authenticated, service_role;

create or replace function public.affiche_personnes()
returns table (id uuid, prenom text, nom text, nom_affiche text)
language sql stable
set search_path to ''
as $$ select * from private.affiche_personnes(); $$;

revoke all on function public.affiche_personnes() from public;
grant execute on function public.affiche_personnes() to authenticated, service_role;
