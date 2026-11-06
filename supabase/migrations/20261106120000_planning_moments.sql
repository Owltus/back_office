-- Les MOMENTS de la journée deviennent une liste de l'établissement
-- (2026-11-06, lot 2, A6 du plan planning-moteur-configurable : « qu'aucun
-- paramètre ne soit en dur »).
--
-- 1. Table `planning_moments` : nom, ordre dans la journée, conditions de
--    classement d'un horaire (début, fin, « toutes » ou « une seule »,
--    priorité), « compte dans le tableau », « c'est la nuit », couleur.
--    Remplie avec les quatre moments de l'hôtel, aux limites réglées
--    aujourd'hui dans `planning_reglages` : les 37 horaires gardent leur
--    moment (vérifié par `moment.test.ts` et le banc du 2026-11-06).
-- 2. `planning_horaires.periode` et `planning_consignes.periode` renvoient à
--    un moment (clé étrangère, `on update cascade`, un moment utilisé ne se
--    retire pas).
--
-- RETIRE (livraison : `--supprimer`) : les CHECK à valeurs fixes
-- `planning_horaires_periode_check` et `planning_consignes_periode_check`,
-- remplacés par les clés étrangères. Les colonnes de limites de
-- `planning_reglages` (`nuit_debut`… `libre_matin_avant`) sont GARDÉES mais
-- plus lues : les retirer serait un retrait.
-- ÉCRIT DU CONTENU (livraison : `--avec-donnees`) : les quatre moments.

create table public.planning_moments (
  id text primary key check (id ~ '^[a-z0-9_-]{1,40}$'),
  nom text not null check (length(btrim(nom)) between 1 and 40),
  ordre integer not null default 0,
  priorite integer not null default 0,
  debut_de integer check (debut_de between 0 and 1440),
  debut_a integer check (debut_a between 0 and 1440),
  fin_de integer check (fin_de between 0 and 2880),
  fin_a integer check (fin_a between 0 and 2880),
  toutes boolean not null default true,
  libre_avant integer check (libre_avant between 0 and 1440),
  compte_dans_tableau boolean not null default false,
  est_nuit boolean not null default false,
  couleur text check (couleur ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_moments_nom_unique unique (nom)
);
comment on table public.planning_moments is
  'Moments de la journée de l''établissement. Un horaire se range dans le premier moment (par priorité) dont les conditions tiennent ; un moment sans condition prend le reste. « Compte dans le tableau » : un chiffre par jour au tableau de l''accueil. « C''est la nuit » : règles des nuits et passation avec le veilleur.';

create trigger planning_moments_stamp before insert or update on public.planning_moments
  for each row execute function private.planning_stamp();

alter table public.planning_moments enable row level security;

create policy "planning_moments read (page:planning)" on public.planning_moments
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_moments insert (page:planning)" on public.planning_moments
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_moments update (page:planning)" on public.planning_moments
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_moments delete (page:planning)" on public.planning_moments
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

grant select, insert, update, delete on public.planning_moments to authenticated;
grant all on public.planning_moments to service_role;

-- Les moments de l'hôtel, aux limites réglées (défauts si la ligne manque).
insert into public.planning_moments
  (id, nom, ordre, priorite, debut_de, debut_a, fin_de, fin_a, toutes,
   libre_avant, compte_dans_tableau, est_nuit)
select v.id, v.nom, v.ordre, v.priorite, v.debut_de, v.debut_a, v.fin_de,
       v.fin_a, v.toutes, v.libre_avant, v.tableau, v.nuit
from (
  select
    coalesce((select nuit_debut from public.planning_reglages where id = 1), 1260) as nd,
    coalesce((select nuit_fin from public.planning_reglages where id = 1), 300) as nf,
    coalesce((select soir_fin from public.planning_reglages where id = 1), 1260) as sf,
    coalesce((select soir_debut from public.planning_reglages where id = 1), 900) as sd,
    coalesce((select matin_debut_avant from public.planning_reglages where id = 1), 540) as md,
    coalesce((select matin_fin_max from public.planning_reglages where id = 1), 1065) as mf,
    coalesce((select libre_matin_avant from public.planning_reglages where id = 1), 750) as lm
) l
cross join lateral (values
  ('matin', 'Matin', 1, 3, null::int, l.md, null::int, l.mf, true, l.lm, true, false),
  ('middle', 'Middle', 2, 4, null, null, null, null, true, null, false, false),
  ('soir', 'Soir', 3, 2, l.sd, null, l.sf, null, false, null, true, false),
  ('nuit', 'Nuit', 4, 1, l.nd, l.nf, null, null, false, null, true, true)
) as v(id, nom, ordre, priorite, debut_de, debut_a, fin_de, fin_a, toutes,
       libre_avant, tableau, nuit);

-- Un horaire ou une consigne renvoie à un moment.
alter table public.planning_horaires
  drop constraint planning_horaires_periode_check;
alter table public.planning_horaires
  add constraint planning_horaires_periode_fkey foreign key (periode)
  references public.planning_moments (id) on update cascade;
alter table public.planning_consignes
  drop constraint planning_consignes_periode_check;
alter table public.planning_consignes
  add constraint planning_consignes_periode_fkey foreign key (periode)
  references public.planning_moments (id) on update cascade;

create index planning_horaires_periode_idx on public.planning_horaires (periode);
