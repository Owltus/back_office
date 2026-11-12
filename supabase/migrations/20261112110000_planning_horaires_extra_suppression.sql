-- Page Horaires, retours de la RH du 2026-11-12 (demande utilisateur).
--
-- 1) Un horaire peut être RANGÉ À LA MAIN dans le tableau Extra, quelle que
--    soit sa durée (« des horaires du matin qui devraient être dans les
--    extras, je ne peux pas les déplacer » : 07:00–13:00 et 08:00–14:00 font
--    6 h pile, Extra n'acceptait que moins de 6 h). Extra reste un rangement
--    de la page : le calcul compte l'horaire dans son moment. Ajout seul,
--    défaut faux, aucun horaire ne change.
--
-- 2) Supprimer un horaire qui a servi dans des semaines verrouillées
--    (« je ne peux juste pas les supprimer… qu'elles soient migrées en mode
--    manuel pour le passé ») : la suppression dit pourquoi elle refuse et
--    combien de shifts sont concernés (indice `passer_en_manuel`), puis,
--    sur accord, ces shifts gardent leurs heures et leur pause et passent en
--    horaire spécifique (`horaire_id` vide), comme les shifts à venir le
--    faisaient déjà. Seule la référence à l'horaire change : la garde des
--    semaines verrouillées est levée le temps de cette seule écriture
--    (drapeau `planning.admin` local à la transaction, prévu par
--    `private.planning_garde_verrou`), puis remise.
--    La version à un argument garde son nom et son sens (elle refuse) : un
--    écran d'avant la livraison continue de marcher.

alter table public.planning_horaires
  add column extra boolean not null default false;

comment on column public.planning_horaires.extra is
  'Rangé à la main dans le tableau Extra de la page Horaires, quelle que soit sa durée. Rangement de la page seulement : le calcul compte l''horaire dans son moment.';

create or replace function public.planning_supprimer_horaire(
  p_id bigint, p_passer_en_manuel boolean)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_heures text;
  v_qui text;
  v_realises integer;
  v_avenir integer;
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  select replace(debut, '24:00', '00:00') || '–' || replace(fin, '24:00', '00:00')
    into v_heures from public.planning_horaires where id = p_id;
  if v_heures is null then return; end if;
  -- Seul horaire permis : le passer en manuel n'y changerait rien.
  select string_agg(q, ', ') into v_qui from (
    select 'la fiche de ' || btrim(prenom || ' ' || nom) as q from public.planning_salaries
     where shifts_autorises = array[p_id]
    union all
    select 'le poste ' || nom from public.planning_postes where horaires_autorises = array[p_id]) t;
  if v_qui is not null then
    raise exception 'L''horaire % est le seul permis pour %. Ajoutez d''abord un autre horaire à ces listes, puis supprimez-le.',
      v_heures, v_qui using errcode = 'PL409';
  end if;
  select count(*) filter (where private.planning_verrouillee(a.lundi)),
         count(*) filter (where not private.planning_verrouillee(a.lundi))
    into v_realises, v_avenir
    from public.planning_affectations a where a.horaire_id = p_id;
  if v_realises > 0 and not coalesce(p_passer_en_manuel, false) then
    raise exception 'L''horaire % a servi dans % shift% de semaines verrouillées. Pour le supprimer, ces shifts gardent leurs heures et passent en horaire spécifique.%',
      v_heures, v_realises, case when v_realises > 1 then 's' else '' end,
      case when v_avenir > 0
           then format(' Les %s autre%s shift%s de semaines ouvertes aussi.', v_avenir,
                       case when v_avenir > 1 then 's' else '' end,
                       case when v_avenir > 1 then 's' else '' end)
           else '' end
      using errcode = 'PL409', hint = 'passer_en_manuel';
  end if;
  if v_realises > 0 then
    -- Seule la référence change : heures et pause restent (horaire spécifique).
    perform set_config('planning.admin', 'on', true);
    update public.planning_affectations set horaire_id = null where horaire_id = p_id;
    perform set_config('planning.admin', 'off', true);
  end if;
  update public.planning_salaries set
    shifts_autorises = array_remove(shifts_autorises, p_id),
    semaine_type = (select jsonb_agg(case when (e ->> 'type_shift_id')::bigint = p_id
                                          then e || '{"type_shift_id": null}'::jsonb else e end
                                     order by o)
                      from jsonb_array_elements(semaine_type) with ordinality as t(e, o))
   where p_id = any (shifts_autorises)
      or exists (select 1 from jsonb_array_elements(semaine_type) e
                  where (e ->> 'type_shift_id')::bigint = p_id);
  update public.planning_postes set horaires_autorises = array_remove(horaires_autorises, p_id)
   where p_id = any (horaires_autorises);
  -- Besoins : supprimés (FK en cascade) ; shifts des semaines ouvertes :
  -- gardent leurs heures, en horaire spécifique (FK `set null`).
  delete from public.planning_horaires where id = p_id;
end $function$;

revoke all on function public.planning_supprimer_horaire(bigint, boolean) from public, anon;
grant execute on function public.planning_supprimer_horaire(bigint, boolean) to authenticated, service_role;

-- La version d'avant (un argument) : même refus, mêmes messages.
create or replace function public.planning_supprimer_horaire(p_id bigint)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
  perform public.planning_supprimer_horaire(p_id, false);
end $function$;
