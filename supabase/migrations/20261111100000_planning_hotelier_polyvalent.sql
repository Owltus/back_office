-- Planning : la Réception et le Club deviennent UN poste, « Hôtelier
-- polyvalent » (décision utilisateur du 2026-11-11, page Besoins : « je ne
-- veux pas faire de différence entre le Club et la Réception… ne garde aucun
-- historique, fais-moi une migration totale »).
--
-- Le poste Réception est GARDÉ et renommé (son id, sa zone, son ouverture,
-- sa couleur) ; le Club y est versé puis supprimé :
--   1) compétences : une seule ligne pour le nouveau poste, au MEILLEUR des
--      deux niveaux (titulaire > dépannage > soutien) ;
--   2) horaires permis : l'union des deux listes (une liste vide = tous) ;
--      journée maximum : la plus longue des deux ;
--   3) shifts : TOUS ceux du Club passent sur le nouveau poste, passé et
--      semaines verrouillées compris (drapeau d'administration
--      `planning.admin`, le temps de cette migration seulement) ;
--   4) besoins du Club : versés s'il n'y en a pas déjà un identique, sinon
--      retirés avec le poste ;
--   5) catégories : le Club retiré de leurs postes permis ;
--   6) le Club est supprimé, la Réception renommée.
--
-- Sans ces deux postes (base neuve, `db:reset` avant le seed) : rien.
-- Livraison : écrit du contenu, `--avec-donnees`.

do $$
declare
  v_garde bigint;
  v_club bigint;
begin
  select id into v_garde from public.planning_postes where nom = 'Réception';
  select id into v_club from public.planning_postes where nom = 'Club';
  if v_garde is null or v_club is null then
    raise notice 'Réception ou Club absent : rien à fusionner.';
    return;
  end if;

  perform set_config('planning.admin', 'on', true);

  -- 1) Compétences.
  update public.planning_salaries s
     set competences = (
       select coalesce(jsonb_agg(e), '[]'::jsonb)
         from jsonb_array_elements(s.competences) e
        where (e ->> 'poste_id')::bigint not in (v_garde, v_club)
     ) || jsonb_build_array(
       (select e || jsonb_build_object('poste_id', v_garde)
          from jsonb_array_elements(s.competences) e
         where (e ->> 'poste_id')::bigint in (v_garde, v_club)
         order by case e ->> 'niveau'
                    when 'titulaire' then 1
                    when 'occasionnel' then 2
                    else 3
                  end,
                  (e ->> 'poste_id')::bigint = v_garde desc
         limit 1)
     )
   where exists (
     select 1 from jsonb_array_elements(s.competences) e
      where (e ->> 'poste_id')::bigint = v_club
   );

  -- 2) Horaires permis et journée maximum.
  update public.planning_postes g
     set horaires_autorises = case
           when coalesce(cardinality(g.horaires_autorises), 0) = 0
             or coalesce(cardinality(c.horaires_autorises), 0) = 0
             then '{}'::bigint[]
           else array(
             select distinct x
               from unnest(g.horaires_autorises || c.horaires_autorises) x
              order by x)
         end,
         jour_max_minutes = greatest(g.jour_max_minutes, c.jour_max_minutes)
    from public.planning_postes c
   where g.id = v_garde and c.id = v_club;

  -- 3) Shifts.
  update public.planning_affectations
     set poste_id = v_garde
   where poste_id = v_club;

  -- 4) Besoins (aucun sur l'hôtel : l'accueil se règle par son tableau).
  update public.planning_besoins b
     set poste_id = v_garde
   where b.poste_id = v_club
     and not exists (
       select 1 from public.planning_besoins d
        where d.poste_id = v_garde
          and d.jour = b.jour
          and d.horaire_id is not distinct from b.horaire_id
          and d.debut is not distinct from b.debut
          and d.fin is not distinct from b.fin
     );

  -- 5) Catégories.
  update public.planning_groupes
     set postes_autorises = array_remove(postes_autorises, v_club)
   where v_club = any (postes_autorises);

  -- 6) Le Club part, la Réception prend son nom.
  delete from public.planning_postes where id = v_club;
  update public.planning_postes
     set nom = 'Hôtelier polyvalent'
   where id = v_garde;
end $$;
