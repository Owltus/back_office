-- Deux repos par semaine, même en congé (décision utilisateur du 2026-11-02,
-- congés comptés en jours ouvrés : 5 par semaine) : « si je m'arrête 3
-- semaines, j'ai 2 jours de repos par semaine ; les jours de congé ne
-- comptent pas comme des jours de repos ».
--
-- L'app propose alors un repos SUR un jour de congé en trop (plus de 5 jours
-- d'absence décomptée dans la semaine, `reposDeduits`, lib/planning/
-- semaine.ts). « Valider » l'écrit : ce jour-là, le congé devient un repos.
-- Avant, l'insertion s'arrêtait sur l'absence existante (`do nothing`).
--
-- Garde côté base : seule une absence DÉCOMPTÉE (nature absence, jamais
-- l'école) se change en repos, et seulement si la personne a au moins 6 de
-- ces jours dans la semaine (lus avant l'écriture : deux conversions d'une
-- semaine entière de congé passent ensemble, une troisième non). Tout autre
-- jour déjà occupé reste tel quel, comme avant.

create or replace function public.planning_valider_avec_repos(
  p_lundi date,
  p_salarie bigint,
  p_jour integer,
  p_epinglee boolean,
  p_repos jsonb
)
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
