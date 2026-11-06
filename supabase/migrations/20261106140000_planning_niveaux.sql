-- Les NIVEAUX de l'établissement (2026-11-06, lot 2, A7 du plan
-- planning-moteur-configurable : « qu'aucun paramètre ne soit en dur »).
--
-- 1. Table `planning_niveaux` : le niveau d'une personne sur un poste (nom,
--    ordre : le premier est préféré, `autonome` : tient une place seul,
--    `jamais_seul` : toujours avec une personne autonome qui n'est pas
--    elle-même « jamais seule »). Trois niveaux créés, aux règles
--    d'aujourd'hui : Titulaire, Dépannage, Soutien. Leurs clés texte
--    (`titulaire`, `occasionnel`, `soutien`) sont celles des compétences
--    déjà écrites : aucune fiche n'est réécrite.
-- 2. Compétences : `planning_competences_ok` ne contrôle plus que la forme ;
--    un trigger vérifie que chaque niveau existe (PL400). Un niveau utilisé
--    (fiche, besoin) ne se retire pas (PL409), ni le dernier niveau autonome.
-- 3. `planning_besoins.niveau_min` : clé étrangère vers `planning_niveaux`,
--    nulle = tout niveau autonome (l'ancien 'depannage') ; 'titulaire' reste.
-- 4. `planning_besoins.niveaux` (jsonb, `[{niveau, nombre}]`) : le nombre de
--    personnes demandé par niveau. Vide : `effectif`, `soutien` et
--    `niveau_min` font foi (aucun besoin n'est réécrit).
--
-- RETIRE (livraison : `--supprimer`) : le CHECK
-- `planning_besoins_niveau_min_check`, le NOT NULL et le défaut de
-- `niveau_min`.
-- ÉCRIT DU CONTENU (livraison : `--avec-donnees`) : les trois niveaux, et
-- `niveau_min` 'depannage' → null.

create table public.planning_niveaux (
  id text primary key check (id ~ '^[a-z0-9_]{1,40}$'),
  nom text not null check (length(btrim(nom)) between 1 and 40),
  ordre integer not null default 0,
  autonome boolean not null default true,
  jamais_seul boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_niveaux_nom_unique unique (nom)
);
comment on table public.planning_niveaux is
  'Niveaux d''une personne sur un poste. Ordre : le premier est préféré par le calcul. Autonome : tient une place seul. Jamais seul : toujours avec une personne autonome qui ne l''est pas.';

create trigger planning_niveaux_stamp before insert or update on public.planning_niveaux
  for each row execute function private.planning_stamp();

alter table public.planning_niveaux enable row level security;

create policy "planning_niveaux read (page:planning)" on public.planning_niveaux
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_niveaux insert (page:planning)" on public.planning_niveaux
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_niveaux update (page:planning)" on public.planning_niveaux
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_niveaux delete (page:planning)" on public.planning_niveaux
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

grant select, insert, update, delete on public.planning_niveaux to authenticated;
grant all on public.planning_niveaux to service_role;

-- Les niveaux d'aujourd'hui.
insert into public.planning_niveaux (id, nom, ordre, autonome, jamais_seul) values
  ('titulaire', 'Titulaire', 0, true, false),
  ('occasionnel', 'Dépannage', 1, true, false),
  ('soutien', 'Soutien', 2, false, true);

-- Compétences : la forme seulement ; le niveau existe (trigger).
create or replace function private.planning_competences_ok(p jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or jsonb_typeof(e -> 'poste_id') <> 'number'
           or coalesce(btrim(e ->> 'niveau'), '') = '');
$$;

create or replace function private.planning_salaries_niveaux() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_inconnu text;
begin
  select string_agg(distinct e ->> 'niveau', ', ') into v_inconnu
    from jsonb_array_elements(new.competences) e
   where not exists (select 1 from public.planning_niveaux n where n.id = e ->> 'niveau');
  if v_inconnu is not null then
    raise exception 'Niveau inconnu : %.', v_inconnu using errcode = 'PL400';
  end if;
  return new;
end $$;
revoke all on function private.planning_salaries_niveaux() from public, anon, authenticated;
create trigger planning_salaries_niveaux
  before insert or update of competences on public.planning_salaries
  for each row execute function private.planning_salaries_niveaux();

-- Besoins : le niveau demandé renvoie à la table ; nul = tout niveau autonome.
alter table public.planning_besoins drop constraint planning_besoins_niveau_min_check;
alter table public.planning_besoins alter column niveau_min drop not null;
alter table public.planning_besoins alter column niveau_min drop default;
update public.planning_besoins set niveau_min = null where niveau_min = 'depannage';
alter table public.planning_besoins
  add constraint planning_besoins_niveau_min_fkey
  foreign key (niveau_min) references public.planning_niveaux (id) on delete restrict;
comment on column public.planning_besoins.niveau_min is
  'Niveau demandé : le moins préféré des niveaux autonomes qui tiennent la place. Nul : tout niveau autonome. Ignoré quand `niveaux` est rempli.';

-- Nombre par niveau : [{"niveau": "titulaire", "nombre": 1}, …]. Vide : les
-- colonnes effectif, soutien et niveau_min.
alter table public.planning_besoins
  add column niveaux jsonb not null default '[]'
  check (jsonb_typeof(niveaux) = 'array');
comment on column public.planning_besoins.niveaux is
  'Nombre de personnes demandé par niveau ([{niveau, nombre}]). Vide : effectif, soutien et niveau_min font foi.';

create or replace function private.planning_besoins_niveaux() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.niveaux) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'nombre') <> 'number'
        or (e ->> 'nombre')::numeric not between 1 and 20
        or not exists (select 1 from public.planning_niveaux n where n.id = e ->> 'niveau')
  ) then
    raise exception 'Nombre par niveau invalide.' using errcode = 'PL400';
  end if;
  if (select count(*) from jsonb_array_elements(new.niveaux))
     <> (select count(distinct e ->> 'niveau') from jsonb_array_elements(new.niveaux) e) then
    raise exception 'Un niveau est demandé deux fois.' using errcode = 'PL400';
  end if;
  return new;
end $$;
revoke all on function private.planning_besoins_niveaux() from public, anon, authenticated;
create trigger planning_besoins_niveaux
  before insert or update of niveaux on public.planning_besoins
  for each row execute function private.planning_besoins_niveaux();

-- Un niveau utilisé ne se retire pas, ni le dernier niveau autonome.
create or replace function private.planning_niveaux_garde() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.planning_salaries s, jsonb_array_elements(s.competences) e
                where e ->> 'niveau' = old.id)
       or exists (select 1 from public.planning_besoins b, jsonb_array_elements(b.niveaux) e
                   where e ->> 'niveau' = old.id) then
      raise exception 'Ce niveau est utilisé : retirez-le des fiches et des besoins d''abord.'
        using errcode = 'PL409';
    end if;
  end if;
  if old.autonome and (tg_op = 'DELETE' or not new.autonome)
     and not exists (select 1 from public.planning_niveaux n where n.autonome and n.id <> old.id) then
    raise exception 'Il faut au moins un niveau qui tient une place seul.' using errcode = 'PL409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function private.planning_niveaux_garde() from public, anon, authenticated;
create trigger planning_niveaux_garde
  before update of autonome or delete on public.planning_niveaux
  for each row execute function private.planning_niveaux_garde();
