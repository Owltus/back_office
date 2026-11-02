-- Jours fériés rattrapés (décisions utilisateur du 2026-11-02) : « lors de
-- la première année, nous n'avons droit à aucun jour férié. Après cette
-- année passée, chaque jour férié travaillé est un jour récupéré. Créer un
-- nouveau statut qui s'appellerait jour férié rattrapé ou JFR », « essaye de
-- faire en sorte que les JFR soient rattrapés dans les semaines ou jours qui
-- suivent un jour férié ».
--
-- L'app calcule qui a un jour férié travaillé à rattraper
-- (lib/planning/feries.ts, regles.ts) ; la génération place le JFR et
-- l'écrit comme une absence PROPOSÉE (epinglee = false), comme un repos
-- proposé : il part avec les propositions (génération suivante,
-- « Effacer »), « Valider » le valide. Le motif JFR vaut une journée de
-- contrat (decompte = true), comme un congé. Ne pas le confondre avec JF,
-- le jour férié chômé.
--
-- Rien n'est retiré : un motif ajouté, des corps de fonctions recréés sous
-- le même nom (mêmes signatures, droits inchangés).

-- Le motif, une seule fois. Seulement sur une base qui a déjà ses motifs
-- (prod, copie de la prod) : une base rejouée depuis zéro le reçoit du seed,
-- joué après les migrations (sinon les identifiants du seed entreraient en
-- conflit).
insert into public.planning_motifs (code, nom, couleur, decompte, nature)
select 'JFR', 'Jour férié rattrapé', '#c084fc', true, 'absence'
where exists (select 1 from public.planning_motifs)
  and not exists (
    select 1 from public.planning_motifs where upper(trim(code)) = 'JFR'
  );

-- Un repos OU un jour férié rattrapé peut être une proposition ; toute autre
-- absence reste validée.
create or replace function private.planning_absence_epinglee() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if not new.epinglee and not exists (
    select 1 from public.planning_motifs m
     where m.id = new.motif_id
       and (m.nature = 'repos' or upper(trim(m.code)) = 'JFR')) then
    new.epinglee := true;
  end if;
  return new;
end $$;
revoke all on function private.planning_absence_epinglee() from public, anon, authenticated;

-- Génération : en plus des shifts, les JFR choisis (entrées de p_nouvelles
-- qui portent un `motif_id`, toujours un motif JFR), posés en proposition
-- sur un jour sans shift ni absence. Les JFR en proposition des jours à
-- venir sont effacés avec les autres propositions (inchangé : `not
-- epinglee`).
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

  -- Jours fériés rattrapés : seulement un motif JFR, un jour à venir de la
  -- semaine, sans shift ni absence ce jour-là.
  insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
  select (n ->> 'salarie_id')::bigint, p_lundi + (n ->> 'jour')::int,
         (n ->> 'motif_id')::bigint, false
    from jsonb_array_elements(coalesce(p_nouvelles, '[]'::jsonb)) n
   where n ->> 'motif_id' is not null
     and (n ->> 'jour')::int between v_depuis and 6
     and exists (
       select 1 from public.planning_motifs m
        where m.id = (n ->> 'motif_id')::bigint and upper(trim(m.code)) = 'JFR')
     and not exists (
       select 1 from public.planning_affectations a
        where a.lundi = p_lundi and a.salarie_id = (n ->> 'salarie_id')::bigint
          and a.jour = (n ->> 'jour')::int)
  on conflict (salarie_id, jour) do nothing;
  return v_n;
end $$;
revoke all on function public.planning_appliquer_generation(date, text, integer, boolean, bigint[], boolean, jsonb) from public, anon;
grant execute on function public.planning_appliquer_generation(date, text, integer, boolean, bigint[], boolean, jsonb) to authenticated, service_role;

-- Validation : les JFR en proposition se valident (et se remettent en
-- proposition) avec les shifts et les repos posés. Reste du corps identique
-- à 20261102110000 (repos déduits, repos sur un congé en trop).
create or replace function public.planning_valider_avec_repos(
  p_lundi date,
  p_salarie bigint,
  p_jour integer,
  p_epinglee boolean,
  p_repos jsonb
)
 returns integer
 language plpgsql
 security invoker
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
     and (m.nature = 'repos' or upper(trim(m.code)) = 'JFR')
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
revoke all on function public.planning_valider_avec_repos(date, bigint, integer, boolean, jsonb) from public, anon;
grant execute on function public.planning_valider_avec_repos(date, bigint, integer, boolean, jsonb) to authenticated, service_role;
