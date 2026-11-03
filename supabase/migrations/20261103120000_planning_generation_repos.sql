-- Les repos se posent, ils ne se devinent plus (demande utilisateur du
-- 2026-11-03 : « en temps normal, leur planning est censé être vide ; les
-- repos ne se posent qu'à la main ou par la génération ; je dois pouvoir les
-- retirer »). Avant, l'écran DÉDUISAIT des repos sur les jours vides d'une
-- semaine « remplie » : rien en base, donc impossible à vider. Désormais la
-- génération complète les ENREGISTRE en proposition, comme un jour férié
-- rattrapé : la génération accepte un motif de nature repos dans ses
-- absences proposées. Corps de fonction remplacé, même nom, même signature.

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

  -- Jours fériés rattrapés ET repos proposés (2026-11-03) : seulement un
  -- motif JFR ou un motif de nature repos, un jour à venir de la semaine,
  -- sans shift ni absence ce jour-là, toujours en proposition.
  insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
  select (n ->> 'salarie_id')::bigint, p_lundi + (n ->> 'jour')::int,
         (n ->> 'motif_id')::bigint, false
    from jsonb_array_elements(coalesce(p_nouvelles, '[]'::jsonb)) n
   where n ->> 'motif_id' is not null
     and (n ->> 'jour')::int between v_depuis and 6
     and exists (
       select 1 from public.planning_motifs m
        where m.id = (n ->> 'motif_id')::bigint
          and (upper(trim(m.code)) = 'JFR' or m.nature = 'repos'))
     and not exists (
       select 1 from public.planning_affectations a
        where a.lundi = p_lundi and a.salarie_id = (n ->> 'salarie_id')::bigint
          and a.jour = (n ->> 'jour')::int)
  on conflict (salarie_id, jour) do nothing;
  return v_n;
end $$;
