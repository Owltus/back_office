-- Motifs, équité, accueil et jours fériés réglables (lot 1b du plan
-- `plan/planning-moteur-configurable-2026-11-05/10-audit-notions-en-dur.md`).
--
-- Demande utilisateur du 2026-11-06 : « qu'aucun paramètre ne soit en dur,
-- avec des termes tels que des rôles, des postes… ». Défauts = l'hôtel
-- d'aujourd'hui, à l'identique.
--
-- 1. Motifs : plus aucun code (CP, JF, JFR) ni nom (« forfait ») lu par le
--    code. Trois cases et un rôle sur le motif :
--      libre_weekend   compte comme un jour libre pour le week-end ;
--      reserve_forfait réservé aux personnes au forfait jours ;
--      role            'ferie_chome' (jour férié pris le jour même),
--                      'ferie_rattrape' (jour férié rattrapé),
--                      'repos_defaut' (le repos posé par le planning) ;
--                      un seul motif par rôle ;
--      icone           icône choisie (vide : devinée d'après le nom).
--    Les trois fonctions qui testaient `upper(trim(code)) = 'JFR'` lisent le
--    rôle (create or replace, même nom, même signature).
-- 2. Équité : jours du week-end, nuit de la veille, critères répartis et
--    nombre de semaines dans `planning_reglages`. L'alerte des heures en
--    plus peut compter jusqu'à ce nombre de semaines (CHECK recréé sous le
--    même nom).
-- 3. Importance : un vrai booléen `planning_postes.indispensable` (rempli
--    depuis `importance`, colonne gardée et plus lue).
-- 4. Tableau de l'accueil : « au moins / au plus » permis (retrait du CHECK
--    `planning_consignes_exact`) ; les chiffres d'aujourd'hui restent exacts.
-- 5. Jours fériés en plus (`planning_feries`) : date, nom, chaque année ou
--    non, ajoutés aux 11 jours calculés.
--
-- RETIRE (livraison : `--supprimer`) : le CHECK `planning_consignes_exact`.
-- ÉCRIT DES DONNÉES (livraison : `--avec-donnees`) : cases et rôles des
-- motifs d'après leur code d'aujourd'hui, `indispensable` des postes.

-- ------------------------------------------------------------ 1. motifs
alter table public.planning_motifs
  add column libre_weekend boolean not null default false,
  add column reserve_forfait boolean not null default false,
  add column role text,
  add column icone text,
  add constraint planning_motifs_role_check
    check (role in ('ferie_chome', 'ferie_rattrape', 'repos_defaut')),
  -- Le repos par défaut est un repos ; un jour férié, une absence.
  add constraint planning_motifs_role_nature check (
    role is null
    or (role = 'repos_defaut' and nature = 'repos')
    or (role in ('ferie_chome', 'ferie_rattrape') and nature = 'absence')),
  add constraint planning_motifs_icone_check check (
    icone in ('conge', 'ecole', 'formation', 'maladie', 'ferie', 'argent',
              'deces', 'recuperation', 'autorise', 'repos', 'absence'));

create unique index planning_motifs_role_unique
  on public.planning_motifs (role) where role is not null;

comment on column public.planning_motifs.libre_weekend is
  'Un jour de ce motif compte comme libre pour le week-end (congé, repos ; jamais maladie ni école).';
comment on column public.planning_motifs.reserve_forfait is
  'Motif proposé seulement aux personnes au forfait jours.';
comment on column public.planning_motifs.role is
  'Rôle du motif pour le planning : ferie_chome (jour férié pris le jour même), ferie_rattrape (jour férié rattrapé), repos_defaut (repos posé par le planning). Un motif par rôle.';
comment on column public.planning_motifs.icone is
  'Icône choisie ; null : devinée d''après le nom.';

-- Les cases d'après le code d'aujourd'hui (comportement identique).
update public.planning_motifs
   set libre_weekend = nature <> 'ecole'
         and (nature = 'repos' or not decompte
              or upper(btrim(code)) in ('CP', 'JF', 'JFR')),
       reserve_forfait = lower(nom) like '%forfait%';

update public.planning_motifs set role = 'ferie_chome'
 where id = (select id from public.planning_motifs
              where upper(btrim(code)) = 'JF' and nature = 'absence'
              order by id limit 1);
update public.planning_motifs set role = 'ferie_rattrape'
 where id = (select id from public.planning_motifs
              where upper(btrim(code)) = 'JFR' and nature = 'absence'
              order by id limit 1);
update public.planning_motifs set role = 'repos_defaut'
 where id = (select id from public.planning_motifs
              where nature = 'repos' order by id limit 1);

-- Un repos ou un jour férié rattrapé posé par le planning reste en
-- proposition ; le reste est posé à la main, donc validé.
create or replace function private.planning_absence_epinglee()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if not new.epinglee and not exists (
    select 1 from public.planning_motifs m
     where m.id = new.motif_id
       and (m.nature = 'repos' or m.role = 'ferie_rattrape')) then
    new.epinglee := true;
  end if;
  return new;
end $function$;

create or replace function public.planning_appliquer_generation(p_lundi date, p_etat text, p_depuis integer, p_tout boolean, p_exclus bigint[], p_sans_effacer boolean, p_nouvelles jsonb)
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare
  v_depuis integer;
  v_n integer;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('planning:' || p_lundi::text));
  if private.planning_verrouillee(p_lundi) then
    raise exception 'Semaine verrouillée : c''est un planning réalisé.' using errcode = 'PL423';
  end if;
  v_depuis := private.planning_depuis(p_lundi);
  if p_depuis is distinct from v_depuis then
    raise exception 'La date du jour a changé pendant le calcul : relancez.' using errcode = 'PL409';
  end if;
  if p_etat is distinct from private.planning_etat(p_lundi) then
    raise exception 'Le planning a changé pendant le calcul : relancez.' using errcode = 'PL409';
  end if;
  if not coalesce(p_sans_effacer, false) then
    delete from public.planning_affectations
     where lundi = p_lundi and jour >= v_depuis
       and (p_tout or not epinglee or salarie_id = any (coalesce(p_exclus, '{}')));
    delete from public.planning_absences
     where not epinglee
       and jour between p_lundi + v_depuis and p_lundi + 6;
  end if;
  insert into public.planning_affectations
    (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, epinglee, pause)
  select p_lundi, (n ->> 'salarie_id')::bigint, (n ->> 'poste_id')::bigint,
         (n ->> 'jour')::smallint, nullif(n ->> 'horaire_id', '')::bigint,
         n ->> 'debut', n ->> 'fin', false,
         coalesce((n ->> 'pause')::int, 0)
    from jsonb_array_elements(coalesce(p_nouvelles, '[]'::jsonb)) n
   where n ->> 'motif_id' is null
     and (n ->> 'jour')::int >= v_depuis
     and not exists (
       select 1 from public.planning_absences ab
        where ab.salarie_id = (n ->> 'salarie_id')::bigint
          and ab.jour = p_lundi + (n ->> 'jour')::int);
  get diagnostics v_n = row_count;

  -- Jours fériés rattrapés ET repos proposés (2026-11-03) : seulement le
  -- motif au rôle « jour férié rattrapé » ou un motif de nature repos, un
  -- jour à venir de la semaine, sans shift ni absence ce jour-là, toujours
  -- en proposition.
  insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
  select (n ->> 'salarie_id')::bigint, p_lundi + (n ->> 'jour')::int,
         (n ->> 'motif_id')::bigint, false
    from jsonb_array_elements(coalesce(p_nouvelles, '[]'::jsonb)) n
   where n ->> 'motif_id' is not null
     and (n ->> 'jour')::int between v_depuis and 6
     and exists (
       select 1 from public.planning_motifs m
        where m.id = (n ->> 'motif_id')::bigint
          and (m.role = 'ferie_rattrape' or m.nature = 'repos'))
     and not exists (
       select 1 from public.planning_affectations a
        where a.lundi = p_lundi and a.salarie_id = (n ->> 'salarie_id')::bigint
          and a.jour = (n ->> 'jour')::int)
  on conflict (salarie_id, jour) do nothing;
  return v_n;
end $function$;

create or replace function public.planning_valider_avec_repos(p_lundi date, p_salarie bigint, p_jour integer, p_epinglee boolean, p_repos jsonb)
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare
  v_n integer := 0;
  v_m integer;
  v_motif bigint;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'Semaine invalide.' using errcode = 'PL400';
  end if;
  perform pg_advisory_xact_lock(hashtext('planning:' || p_lundi::text));

  update public.planning_affectations set epinglee = p_epinglee
   where lundi = p_lundi
     and (p_salarie is null or salarie_id = p_salarie)
     and (p_jour is null or jour = p_jour)
     and epinglee is distinct from p_epinglee;
  get diagnostics v_n = row_count;

  update public.planning_absences ab set epinglee = p_epinglee
    from public.planning_motifs m
   where m.id = ab.motif_id
     and (m.nature = 'repos' or m.role = 'ferie_rattrape')
     and ab.jour between p_lundi and p_lundi + 6
     and (p_salarie is null or ab.salarie_id = p_salarie)
     and (p_jour is null or ab.jour = p_lundi + p_jour)
     and ab.epinglee is distinct from p_epinglee;
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  if p_epinglee and jsonb_array_length(coalesce(p_repos, '[]'::jsonb)) > 0 then
    -- Le repos par défaut (rôle), sinon le premier motif de nature repos.
    select id into v_motif from public.planning_motifs
     where nature = 'repos'
     order by (role is not distinct from 'repos_defaut') desc, id limit 1;
    if v_motif is null then
      raise exception 'Aucun motif Repos dans les réglages.' using errcode = 'PL409';
    end if;
    insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
    select (r ->> 'salarie_id')::bigint, p_lundi + (r ->> 'jour')::int, v_motif, true
      from jsonb_array_elements(p_repos) r
     where (r ->> 'jour')::int between 0 and 6
       and (p_salarie is null or (r ->> 'salarie_id')::bigint = p_salarie)
       and (p_jour is null or (r ->> 'jour')::int = p_jour)
       -- Un jour qui a reçu un shift entre-temps n'est plus un repos.
       and not exists (
         select 1 from public.planning_affectations a
          where a.lundi = p_lundi and a.salarie_id = (r ->> 'salarie_id')::bigint
            and a.jour = (r ->> 'jour')::int)
    on conflict (salarie_id, jour) do update
       set motif_id = excluded.motif_id, epinglee = true
     where exists (
             select 1 from public.planning_motifs m
              where m.id = planning_absences.motif_id
                and m.nature = 'absence' and m.decompte)
       and (select count(*)
              from public.planning_absences b
              join public.planning_motifs m on m.id = b.motif_id
             where b.salarie_id = planning_absences.salarie_id
               and b.jour between p_lundi and p_lundi + 6
               and m.nature = 'absence' and m.decompte) >= 6;
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
  end if;
  return v_n;
end $function$;

-- ------------------------------------------------------------ 2. équité
alter table public.planning_reglages
  add column weekend_jours smallint[] not null default '{5,6}',
  add column weekend_nuit_veille boolean not null default true,
  add column equite_criteres text[] not null
    default '{weekends,soirs,matins_tot}',
  add column equite_semaines smallint not null default 4
    check (equite_semaines between 1 and 12),
  add constraint planning_reglages_weekend_jours check (
    cardinality(weekend_jours) between 1 and 3
    and weekend_jours <@ '{0,1,2,3,4,5,6}'::smallint[]),
  add constraint planning_reglages_equite_criteres check (
    equite_criteres <@ '{weekends,soirs,matins_tot,nuits}'::text[]);

alter table public.planning_reglages
  drop constraint planning_reglages_semaines_en_plus_alerte_check;
alter table public.planning_reglages
  add constraint planning_reglages_semaines_en_plus_alerte_check
    check (semaines_en_plus_alerte between 1 and 12),
  add constraint planning_reglages_equite_alerte
    check (semaines_en_plus_alerte <= equite_semaines);

comment on column public.planning_reglages.weekend_jours is
  'Jours du week-end (0 = lundi, 6 = dimanche) : règle du week-end libre et partage des week-ends.';
comment on column public.planning_reglages.weekend_nuit_veille is
  'La nuit de la veille du week-end (du vendredi au samedi) rend le week-end travaillé.';
comment on column public.planning_reglages.equite_criteres is
  'Ce que le planning répartit à part égale : weekends, soirs, matins_tot, nuits.';
comment on column public.planning_reglages.equite_semaines is
  'Semaines regardées pour le partage (et les heures en plus).';

-- ------------------------------------------------------- 3. importance
alter table public.planning_postes
  add column indispensable boolean not null default false;
update public.planning_postes
   set indispensable = (importance = 'indispensable');
comment on column public.planning_postes.indispensable is
  'Indispensable au fonctionnement : ses places passent devant les autres quand il manque du monde (D11). La colonne importance n''est plus lue.';

-- -------------------------------------------- 4. tableau de l'accueil
alter table public.planning_consignes
  drop constraint planning_consignes_exact;
comment on table public.planning_consignes is
  'Tableau de l''accueil : personnes par jour et par moment (matin, soir, nuit). minimum = maximum : un chiffre exact ; sinon au moins minimum, au plus maximum.';

-- ------------------------------------------------- 5. jours fériés en plus
create table public.planning_feries (
  id bigint generated always as identity primary key,
  jour date not null,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  -- Chaque année à la même date (le jour et le mois de `jour`).
  recurrent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_feries_unique unique (jour)
);
comment on table public.planning_feries is
  'Jours fériés en plus des 11 jours calculés (fête locale, jour chômé de l''établissement). Récurrent : chaque année à la même date.';

create trigger planning_feries_stamp before insert or update on public.planning_feries
  for each row execute function private.planning_stamp();

alter table public.planning_feries enable row level security;

create policy "planning_feries read (page:planning)" on public.planning_feries
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_feries insert (page:planning)" on public.planning_feries
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_feries update (page:planning)" on public.planning_feries
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_feries delete (page:planning)" on public.planning_feries
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

grant select, insert, update, delete on public.planning_feries to authenticated;
grant all on public.planning_feries to service_role;
