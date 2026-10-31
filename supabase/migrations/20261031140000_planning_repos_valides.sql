-- Un repos se valide comme un shift (demande utilisateur du 2026-10-31 :
-- « les repos fixes sont auto-validés ; les repos classiques doivent pouvoir
-- être validés ou non validés, comme les shifts »).
--
-- Trois sortes de repos :
--   - repos FIXE de la semaine type : toujours validé, rien en base ;
--   - repos DÉDUIT (jour libre d'une semaine remplie) : une PROPOSITION,
--     calculée par l'app, rien en base. Le valider l'écrit en base, motif
--     de nature `repos`, validé ;
--   - repos POSÉ (motif de nature `repos`) : validé ou proposition, colonne
--     `epinglee` (même mot que les shifts). Posé à la main : validé.
-- Un repos en proposition est effacé par la génération et par « Effacer les
-- propositions », comme un shift en proposition ; un repos validé reste.
-- Les autres absences (congés, maladie, école) restent toujours validées.
--
-- Rien n'est retiré : une colonne ajoutée, des corps de fonctions recréés
-- sous le même nom, une fonction nouvelle.

alter table public.planning_absences
  add column epinglee boolean not null default true;

comment on column public.planning_absences.epinglee is
  'Repos validé (true) ou proposition (false). Toujours true hors motif de nature repos.';

-- Seul un repos peut être une proposition.
create or replace function private.planning_absence_epinglee() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if not new.epinglee and not exists (
    select 1 from public.planning_motifs m
     where m.id = new.motif_id and m.nature = 'repos') then
    new.epinglee := true;
  end if;
  return new;
end $$;
revoke all on function private.planning_absence_epinglee() from public, anon, authenticated;

create trigger planning_absences_epinglee
  before insert or update on public.planning_absences
  for each row execute function private.planning_absence_epinglee();

-- Valide (ou remet en proposition) les shifts ET les repos d'une case, d'une
-- journée, d'une personne ou de toute la semaine. p_repos : repos DÉDUITS
-- par l'app à écrire validés ([{salarie_id, jour}], jour 0 à 6), ignorés
-- pour une remise en proposition. Rend le nombre de shifts et de repos
-- changés.
create or replace function public.planning_valider_avec_repos(
  p_lundi date, p_salarie bigint, p_jour integer, p_epinglee boolean, p_repos jsonb)
  returns integer
  language plpgsql security invoker
  set search_path to ''
as $$
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
   where m.id = ab.motif_id and m.nature = 'repos'
     and ab.jour between p_lundi and p_lundi + 6
     and (p_salarie is null or ab.salarie_id = p_salarie)
     and (p_jour is null or ab.jour = p_lundi + p_jour)
     and ab.epinglee is distinct from p_epinglee;
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  if p_epinglee and jsonb_array_length(coalesce(p_repos, '[]'::jsonb)) > 0 then
    select id into v_motif from public.planning_motifs
     where nature = 'repos' order by id limit 1;
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
    on conflict (salarie_id, jour) do nothing;
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
  end if;
  return v_n;
end $$;
revoke all on function public.planning_valider_avec_repos(date, bigint, integer, boolean, jsonb) from public, anon;
grant execute on function public.planning_valider_avec_repos(date, bigint, integer, boolean, jsonb) to authenticated, service_role;

-- L'ancienne validation (shifts seuls) suit aussi les repos posés : même
-- corps que ci-dessus, sans repos déduits.
create or replace function public.planning_valider(
  p_lundi date, p_salarie bigint, p_jour integer, p_epinglee boolean)
  returns integer
  language plpgsql security invoker
  set search_path to ''
as $$
begin
  return public.planning_valider_avec_repos(p_lundi, p_salarie, p_jour, p_epinglee, null);
end $$;

-- Génération : un repos en proposition des jours à venir est effacé avec les
-- shifts en proposition (le calcul l'a déjà retiré, `preparerGeneration`).
create or replace function public.planning_appliquer_generation(
  p_lundi date, p_etat text, p_depuis integer, p_tout boolean, p_exclus bigint[],
  p_sans_effacer boolean, p_nouvelles jsonb)
  returns integer
  language plpgsql security invoker
  set search_path to ''
as $$
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
    (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, epinglee, court, pause)
  select p_lundi, (n ->> 'salarie_id')::bigint, (n ->> 'poste_id')::bigint,
         (n ->> 'jour')::smallint, nullif(n ->> 'horaire_id', '')::bigint,
         n ->> 'debut', n ->> 'fin', false, coalesce((n ->> 'court')::boolean, false),
         coalesce((n ->> 'pause')::int, 0)
    from jsonb_array_elements(coalesce(p_nouvelles, '[]'::jsonb)) n
   where (n ->> 'jour')::int >= v_depuis
     and not exists (
       select 1 from public.planning_absences ab
        where ab.salarie_id = (n ->> 'salarie_id')::bigint
          and ab.jour = p_lundi + (n ->> 'jour')::int);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Effacer : les repos en proposition partent avec les shifts en proposition
-- (dans les deux modes) ; un repos validé reste, comme les autres absences.
create or replace function public.planning_vider(p_lundi date, p_garder_epinglees boolean)
  returns integer
  language plpgsql security invoker
  set search_path to ''
as $$
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
  delete from public.planning_affectations
   where lundi = p_lundi and jour >= v_depuis
     and (not coalesce(p_garder_epinglees, false) or not epinglee);
  get diagnostics v_n = row_count;
  delete from public.planning_absences
   where not epinglee
     and jour between p_lundi + v_depuis and p_lundi + 6;
  return v_n;
end $$;
