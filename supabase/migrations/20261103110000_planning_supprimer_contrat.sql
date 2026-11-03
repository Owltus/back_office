-- Supprimer un contrat sans couper le parcours (demande utilisateur du
-- 2026-11-03 : « éditer les contrats passés, présents ou futurs, les
-- supprimer et les recréer à volonté »).
--
-- Une fiche = un contrat ; les contrats d'une même personne sont liés par
-- `suite_de`. Supprimer un contrat du milieu laissait le suivant orphelin
-- (FK `on delete set null`) : il devenait une autre personne. Désormais, ce
-- qui suivait le contrat supprimé est rattaché à ce qui le précédait.
--
-- BONNE PRATIQUE RH (décision utilisateur du même jour, « applique les bonnes
-- pratiques ») : on ne supprime jamais l'historique de quelqu'un qui a
-- travaillé (registre du personnel, heures, jours fériés dus, plannings
-- réalisés). Un contrat qui a un shift ou une absence, quelle que soit la
-- semaine, ne se supprime plus : on change ses dates, ou on indique sa fin.
-- La suppression ne sert qu'à réparer une erreur (une fiche ou un contrat
-- créé par erreur, jamais servi). Corps de fonction remplacé, même nom,
-- même signature.

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
  if exists (select 1 from public.planning_affectations a where a.salarie_id = p_id)
     or exists (select 1 from public.planning_absences ab where ab.salarie_id = p_id) then
    raise exception 'Ce contrat a un historique (shifts ou absences) : on ne le supprime pas. Changez plutôt ses dates, ou indiquez sa fin de contrat.'
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
