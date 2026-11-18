-- Planning : valider ou remettre en proposition TOUS les shifts d'une personne
-- sur une période (demande utilisateur du 2026-11-18 : clic droit sur le nom
-- d'un employé, « Valider tous les shifts » / « Invalider tous les shifts »,
-- la semaine en vue semaine, le mois en vue mois).
--
-- UNE requête, une transaction : jamais un appel par shift.
--
-- Mêmes règles que `planning_valider_avec_repos`, qui reste la seule voie
-- pour une semaine entière et pour les repos :
--   - droit d'écriture sur la page (42501 sinon) ;
--   - une semaine verrouillée n'est pas touchée (elle est SAUTÉE au lieu de
--     faire échouer toute la période : un mois mêle souvent des semaines
--     verrouillées et ouvertes) ;
--   - valider un jour passé reste permis ; le remettre en proposition, non,
--     sauf pour la gestion (décision Q1 du 2026-11-18) ;
--   - seuls les SHIFTS changent : les repos proposés gardent leur propre
--     validation (bouton de la semaine, du jour, ou de la case).
-- `p_salaries` : les contrats de la personne (la vue mois montre sur une
-- seule ligne les contrats qui se suivent). Période bornée à 62 jours.
--
-- Ajout seul, `security invoker` : la RLS et les triggers des shifts
-- (verrou, passé, estampille) s'appliquent comme pour toute écriture.

create or replace function public.planning_valider_periode(
  p_salaries bigint[],
  p_du date,
  p_au date,
  p_epinglee boolean
) returns integer
  language plpgsql
  set search_path to ''
as $$
declare
  v_n integer := 0;
  v_lundi date;
  v_auj date := private.planning_aujourdhui();
  v_gestion boolean := private.planning_niveau() >= 3;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  if p_du is null or p_au is null or p_epinglee is null
     or p_au < p_du or p_au - p_du > 62 then
    raise exception 'Période invalide.' using errcode = 'PL400';
  end if;
  if coalesce(cardinality(p_salaries), 0) = 0 then
    return 0;
  end if;

  -- Le même verrou que les autres écritures d'une semaine, pris dans l'ordre
  -- des semaines (jamais d'interblocage entre deux appels).
  for v_lundi in
    select distinct a.lundi
      from public.planning_affectations a
     where a.salarie_id = any (p_salaries)
       and a.lundi + a.jour between p_du and p_au
     order by 1
  loop
    perform pg_advisory_xact_lock(hashtext('planning:' || v_lundi::text));
  end loop;

  update public.planning_affectations a set epinglee = p_epinglee
   where a.salarie_id = any (p_salaries)
     and a.lundi + a.jour between p_du and p_au
     and a.epinglee is distinct from p_epinglee
     and not private.planning_verrouillee(a.lundi)
     and (p_epinglee or v_gestion or a.lundi + a.jour >= v_auj);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.planning_valider_periode(bigint[], date, date, boolean) from public, anon;
grant execute on function public.planning_valider_periode(bigint[], date, date, boolean) to authenticated, service_role;
