-- =============================================================================
-- Classeur : trois TYPES de classeurs, public, privé, gestion (demande
-- utilisateur du 2026-11-16, sur le modèle de l'auteur réglable de
-- l'Affichage). Remplace l'accès par classeur du 2026-09-28 (accès pour tous
-- + exceptions par personne).
--
-- Règles (décisions utilisateur du 2026-11-16) :
--   public   tout compte qui a la page le lit ; tout compte en écriture sur la
--            page le modifie ; la gestion de la page le gère.
--   privé    son AUTEUR seul (et l'admin). Pas la gestion des autres.
--   gestion  la gestion de la page seule (et l'admin).
--   admin    tout, partout.
-- « Gérer » un classeur (niveau `gestion`) = le supprimer, le réordonner,
-- restaurer et purger ses points : admin, gestion de la page sur un public ou
-- un gestion, l'auteur d'un privé (s'il a l'écriture sur la page).
-- Changer le TYPE : l'auteur (public <-> privé) et la gestion ; vers ou depuis
-- « gestion » : la gestion seule. Changer l'AUTEUR : l'auteur et la gestion ;
-- le nouvel auteur doit avoir la page, même en LECTURE (décision utilisateur
-- du 2026-11-16 : la gestion peut dédier à quelqu'un un classeur qu'il lira
-- sans le modifier ; la gestion pour un classeur de type gestion), ou être
-- admin.
-- Les exceptions par personne (`classeur_acces`) ne sont plus lues ; la table
-- reste (aucune ligne aujourd'hui), comme `acces_tous`.
--
-- DONNÉES (aucune perte) : `visibilite` ajoutée ; « Privé » (acces_tous =
-- 'aucun') devient privé, le reste public. Rien d'autre n'est écrit.
-- Corps de fonctions remplacés sous le même nom ; policies retirées puis
-- recréées sous le même nom sur la même table : pas un retrait.
-- ⚠ `classeur_niveau_de` et `classeur_lecture_ligne` gardent leur signature
-- (bigint, uuid, text) : le 3e paramètre, nommé `p_acces_tous` depuis 2026-09,
-- porte désormais la VISIBILITÉ (Postgres ne renomme pas un paramètre).
-- =============================================================================

alter table public.classeur_classeurs
  add column if not exists visibilite text not null default 'public';

alter table public.classeur_classeurs
  drop constraint if exists classeur_classeurs_visibilite_check;
alter table public.classeur_classeurs
  add constraint classeur_classeurs_visibilite_check
  check (visibilite in ('public', 'prive', 'gestion'));

-- Couleur de l'icône (2026-11-16, demande utilisateur, purement esthétique) :
-- 14 teintes, `violet` = l'apparence d'avant. Miroir : `lib/classeur/couleurs.ts`.
alter table public.classeur_classeurs
  add column if not exists couleur text not null default 'violet';
alter table public.classeur_classeurs
  drop constraint if exists classeur_classeurs_couleur_check;
alter table public.classeur_classeurs
  add constraint classeur_classeurs_couleur_check
  check (couleur in ('rouge', 'orange', 'jaune', 'lime', 'vert', 'sarcelle', 'cyan', 'ciel', 'bleu', 'indigo', 'violet', 'fuchsia', 'rose', 'ardoise'));

update public.classeur_classeurs
   set visibilite = 'prive'
 where acces_tous = 'aucun' and visibilite = 'public';

-- Niveau d'un compte sur un classeur, d'après son auteur et son type.
create or replace function private.classeur_niveau_de(
  p_classeur_id bigint, p_created_by uuid, p_acces_tous text)
returns text
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_page text := private.get_page_level('classeur');
  v_vis  text := p_acces_tous;   -- la visibilité (voir l'en-tête)
begin
  if v_page is null then
    return 'aucun';
  end if;
  if private.is_admin() then
    return 'gestion';
  end if;
  if v_vis = 'prive' then
    if p_created_by is null or p_created_by is distinct from auth.uid() then
      return 'aucun';
    end if;
    return case when v_page = 'lecture' then 'lecture' else 'gestion' end;
  end if;
  if v_vis = 'gestion' then
    return case when v_page = 'gestion' then 'gestion' else 'aucun' end;
  end if;
  if v_vis = 'public' then
    return case v_page when 'gestion' then 'gestion'
                       when 'ecriture' then 'ecriture'
                       else 'lecture' end;
  end if;
  return 'aucun';
end;
$$;

create or replace function private.classeur_niveau(p_classeur_id bigint)
returns text
language sql stable security definer
set search_path to ''
as $$
  select coalesce(
    (select private.classeur_niveau_de(c.id, c.created_by, c.visibilite)
       from public.classeur_classeurs c where c.id = p_classeur_id),
    'aucun');
$$;

-- Garde des changements que la RLS ne voit pas (type, auteur, suppression,
-- ordre). Le niveau lu est celui de la ligne AVANT la modification.
create or replace function private.classeur_garde()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_gestion boolean;
  v_niveau  text;
  v_auteur  boolean;
begin
  -- Contexte système (CLI, service) : aucune garde.
  if v_uid is null then
    return new;
  end if;
  v_gestion := private.is_admin()
    or private.get_page_level('classeur') is not distinct from 'gestion';

  if tg_op = 'INSERT' then
    if new.visibilite = 'gestion' and not v_gestion then
      raise exception 'Seule la gestion crée un classeur de gestion.' using errcode = '42501';
    end if;
    if not v_gestion then
      -- Ni créé supprimé, ni placé où l'on veut dans la liste PARTAGÉE.
      new.deleted_at := null;
      new.sort_order := coalesce(
        (select max(c.sort_order) from public.classeur_classeurs c), 0) + 1;
    end if;
    return new;
  end if;

  v_niveau := private.classeur_niveau_de(old.id, old.created_by, old.visibilite);
  v_auteur := old.created_by is not distinct from v_uid;

  if new.visibilite is distinct from old.visibilite then
    if (new.visibilite = 'gestion' or old.visibilite = 'gestion') and not v_gestion then
      raise exception 'Seule la gestion range un classeur dans Gestion.' using errcode = '42501';
    end if;
    if not (v_gestion or (v_auteur and v_niveau in ('ecriture', 'gestion'))) then
      raise exception 'Seuls l''auteur et la gestion changent le type d''un classeur.' using errcode = '42501';
    end if;
  end if;

  if new.created_by is distinct from old.created_by then
    if not (v_gestion or (v_auteur and v_niveau in ('ecriture', 'gestion'))) then
      raise exception 'Seuls l''auteur et la gestion changent l''auteur d''un classeur.' using errcode = '42501';
    end if;
    if new.created_by is null then
      raise exception 'Un classeur doit avoir un auteur.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.profiles p
       where p.id = new.created_by
         and (p.role = 'admin'
              or exists (select 1 from public.user_page_permissions u
                          where u.user_id = p.id and u.page = 'classeur'
                            and (u.level = 'gestion'
                                 or (u.level in ('lecture', 'ecriture') and new.visibilite is distinct from 'gestion'))))) then
      raise exception 'Cette personne ne peut pas être l''auteur de ce classeur.' using errcode = '23514';
    end if;
  elsif new.visibilite is distinct from old.visibilite and new.visibilite = 'gestion'
        and new.created_by is not null
        and not exists (
          select 1 from public.profiles p
           where p.id = new.created_by
             and (p.role = 'admin'
                  or exists (select 1 from public.user_page_permissions u
                              where u.user_id = p.id and u.page = 'classeur'
                                and u.level = 'gestion'))) then
    raise exception 'L''auteur de ce classeur n''a pas la gestion : choisissez un autre auteur.' using errcode = '23514';
  end if;

  if new.deleted_at is distinct from old.deleted_at and v_niveau is distinct from 'gestion' then
    raise exception 'Vous ne pouvez pas supprimer ce classeur.' using errcode = '42501';
  end if;
  if new.sort_order is distinct from old.sort_order and v_niveau is distinct from 'gestion' then
    raise exception 'Vous ne pouvez pas déplacer ce classeur dans la liste.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- L'estampille ne fige plus l'auteur d'un CLASSEUR : `classeur_garde` (qui
-- passe avant, ordre alphabétique) décide qui le change. Inchangé ailleurs.
create or replace function public.classeur_stamp() returns trigger
language plpgsql
set search_path to 'public'
as $$
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
    if tg_table_name <> 'classeur_classeurs' then
      new.created_by := private.keep_author(new.created_by, old.created_by);
    end if;
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

-- Les personnes qui ont la page (noms, jamais l'e-mail) : pour afficher
-- l'auteur de chaque classeur et pour le choisir. Ouvert à tout compte qui a
-- la page (avant : gestion seule).
create or replace function private.classeur_personnes()
returns table (id uuid, prenom text, nom text, nom_affiche text, niveau_page text)
language plpgsql stable security definer
set search_path to ''
as $$
begin
  if private.get_page_level('classeur') is null then
    raise exception 'Réservé aux comptes qui ont la page Classeur.' using errcode = '42501';
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

drop policy if exists "classeur_classeurs read (page:classeur)" on public.classeur_classeurs;
create policy "classeur_classeurs read (page:classeur)" on public.classeur_classeurs
  for select to authenticated
  using (private.classeur_lecture_ligne(id, created_by, visibilite));

drop policy if exists "classeur_classeurs delete (page:classeur)" on public.classeur_classeurs;
create policy "classeur_classeurs delete (page:classeur)" on public.classeur_classeurs
  for delete to authenticated
  using ((select private.classeur_niveau(classeur_classeurs.id)) = 'gestion');

drop policy if exists "classeur_merge_history delete (page:classeur)" on public.classeur_merge_history;
create policy "classeur_merge_history delete (page:classeur)" on public.classeur_merge_history
  for delete to authenticated
  using (((select private.classeur_niveau(classeur_merge_history.classeur_id)) = 'gestion')
         or (kind = 'auto'
             and (select private.classeur_write_ok(classeur_merge_history.classeur_id))));

-- Journal : qui a changé le type ou l'auteur d'un classeur.
drop trigger if exists audit_classeur_visibilite on public.classeur_classeurs;
create trigger audit_classeur_visibilite
  after update of visibilite, created_by on public.classeur_classeurs
  for each row
  when (old.visibilite is distinct from new.visibilite
        or old.created_by is distinct from new.created_by)
  execute function private.log_row_change();
