-- Supprimer un contrat sans couper le parcours (demande utilisateur du
-- 2026-11-03 : « éditer les contrats passés, présents ou futurs, les
-- supprimer et les recréer à volonté »).
--
-- Une fiche = un contrat ; les contrats d'une même personne sont liés par
-- `suite_de`. Supprimer un contrat du milieu laissait le suivant orphelin
-- (FK `on delete set null`) : il devenait une autre personne. Désormais, ce
-- qui suivait le contrat supprimé est rattaché à ce qui le précédait.
--
-- La garde du planning réalisé reste : un contrat qui a des jours dans une
-- semaine verrouillée ne se supprime qu'une fois ces semaines déverrouillées
-- (le message le dit). Corps de fonction remplacé, même nom, même signature.

create or replace function public.planning_supprimer_salarie(p_id bigint) returns void
  language plpgsql security invoker
  set search_path to ''
as $$
declare
  v_parent bigint;
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  if exists (select 1 from public.planning_affectations a
              where a.salarie_id = p_id and private.planning_verrouillee(a.lundi))
     or exists (select 1 from public.planning_absences ab
                 where ab.salarie_id = p_id
                   and private.planning_verrouillee(private.planning_lundi(ab.jour))) then
    raise exception 'Ce contrat a des jours dans des semaines verrouillées (planning réalisé) : déverrouillez-les d''abord, ou changez plutôt ses dates.'
      using errcode = 'PL409';
  end if;
  -- Le parcours reste d'un seul tenant : ce qui suivait le contrat suit ce
  -- qui le précédait ; s'il était le premier, ses suivants suivent le plus
  -- ancien d'entre eux (sinon deux suivants deviendraient deux personnes).
  select s.suite_de into v_parent from public.planning_salaries s where s.id = p_id;
  if v_parent is null then
    select s.id into v_parent from public.planning_salaries s
     where s.suite_de = p_id
     order by s.date_entree nulls first, s.id
     limit 1;
    update public.planning_salaries set suite_de = null where id = v_parent;
  end if;
  update public.planning_salaries
     set suite_de = v_parent
   where suite_de = p_id;
  delete from public.planning_salaries where id = p_id;
end $$;
