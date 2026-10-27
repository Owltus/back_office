-- Planning du staff : consignes de présence du matin et du soir, et codes
-- horaires de l'hôtel (demande utilisateur du 2026-10-27).
--
--   planning_horaires.periode      matin, soir ou nuit (null : ni l'un ni
--                                  l'autre, ex. direction). C'est la période
--                                  d'un shift pour les consignes.
--   planning_horaires.code_rouge   code écrit en rouge (petit shift à part,
--                                  M21, S11 dans le tableau des codes).
--   planning_postes.presence       le poste compte dans les consignes de
--                                  présence (Réception et Club à l'hôtel).
--   planning_consignes             par jour de la semaine type et par
--                                  période : combien de personnes, au moins
--                                  et au plus (« 3 ou 4 » = 3 à 4).
--
-- Aucun retrait : colonnes ajoutées avec une valeur par défaut, table neuve.
-- Mêmes droits que les besoins : lecture rang >= 1, écriture gestion.

alter table public.planning_horaires
  add column periode text check (periode in ('matin', 'soir', 'nuit')),
  add column code_rouge boolean not null default false;

alter table public.planning_postes
  add column presence boolean not null default false;

create table public.planning_consignes (
  id bigint generated always as identity primary key,
  jour smallint not null check (jour between 0 and 6),
  periode text not null check (periode in ('matin', 'soir')),
  minimum integer not null default 0 check (minimum between 0 and 20),
  maximum integer check (maximum between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_consignes_bornes check (maximum is null or maximum >= minimum),
  constraint planning_consignes_unique unique (jour, periode)
);

create trigger planning_consignes_stamp before insert or update on public.planning_consignes
  for each row execute function private.planning_stamp();

alter table public.planning_consignes enable row level security;

create policy "planning_consignes read (page:planning)" on public.planning_consignes
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_consignes insert (page:planning)" on public.planning_consignes
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_consignes update (page:planning)" on public.planning_consignes
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_consignes delete (page:planning)" on public.planning_consignes
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

grant select, insert, update, delete on public.planning_consignes to authenticated;
grant all on public.planning_consignes to service_role;
