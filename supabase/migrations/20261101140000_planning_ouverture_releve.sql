-- Ouverture du matin et relève (demande utilisateur du 2026-11-01) :
--   « à 7 heures du matin… il faut qu'il y ait quelqu'un en réception et
--   quelqu'un au club » ; « c'est important qu'il y ait du monde entre les
--   shifts du matin et de l'après-midi pour transmettre les informations. Une
--   demi-heure… ». Des réglages, pas des valeurs en dur (choix utilisateur).
--
--   planning_postes.ouverture         heure à laquelle ce poste de l'accueil
--                                     doit être tenu (HH:MM, null : aucune).
--                                     Réception et Club : 07:00.
--   planning_reglages.releve_minutes  temps passé ensemble par l'équipe du
--                                     matin et celle de l'après-midi (0 : pas
--                                     de relève demandée). 30 par défaut.
--
-- Données : Réception et Club reçoivent 07:00 ; une ligne de réglages.

alter table public.planning_postes
  add column ouverture text
  check (ouverture is null or ouverture ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

comment on column public.planning_postes.ouverture is
  'Heure à laquelle ce poste de l''accueil doit être tenu chaque matin (null : aucune).';

update public.planning_postes set ouverture = '07:00' where presence;

create table public.planning_reglages (
  id smallint primary key default 1 check (id = 1),
  releve_minutes integer not null default 30 check (releve_minutes between 0 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.planning_reglages is
  'Réglages généraux du planning (une seule ligne).';

create trigger planning_reglages_stamp before insert or update on public.planning_reglages
  for each row execute function private.planning_stamp();

alter table public.planning_reglages enable row level security;

create policy "planning_reglages read (page:planning)" on public.planning_reglages
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_reglages update (page:planning)" on public.planning_reglages
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);

grant select, update on public.planning_reglages to authenticated;
grant all on public.planning_reglages to service_role;

insert into public.planning_reglages (id) values (1);
