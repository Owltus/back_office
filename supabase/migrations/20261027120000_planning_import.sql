-- =====================================================================
-- PLANNING — import des données du prototype (2026-10-27)
-- =====================================================================
-- Plan `plan/planning-portage-2026-10-27/`, décision D8 : les vrais noms du
-- staff ne passent JAMAIS par le dépôt. L'utilisateur exporte la base du
-- prototype (`scripts/planning-exporter-prototype.mjs`, format
-- `planning-prototype-v20`) et l'importe dans l'app (gestion de la page).
--
-- `planning_importer(p jsonb)` : UNE transaction, `security invoker` (RLS et
-- triggers de l'appelant), réservée à la gestion, et seulement dans un
-- planning VIDE (aucun code horaire, poste ni fiche) : un import ne fusionne
-- jamais avec des données saisies. Les identifiants du prototype sont
-- convertis (codes horaires, motifs, postes, catégories, fiches), y compris
-- dans les listes (codes permis, postes permis, compétences, semaine type,
-- contrat précédent). Ordre : jours d'absence AVANT les shifts (un jour
-- d'absence retire le shift du jour), verrous APRÈS les shifts (une semaine
-- verrouillée n'accepte plus de shift).
-- =====================================================================

create or replace function public.planning_importer(p jsonb)
  returns jsonb
  language plpgsql security invoker
  set search_path to ''
as $$
declare
  r jsonb;
  e jsonb;
  v bigint;
  mh jsonb := '{}';  -- code horaire : id du prototype -> id ici
  mm jsonb := '{}';  -- motif
  mp jsonb := '{}';  -- poste
  mg jsonb := '{}';  -- catégorie
  ms jsonb := '{}';  -- fiche
  v_semaine jsonb;
  n_abs integer := 0;
  n_aff integer := 0;
  n_bes integer := 0;
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  if coalesce(p ->> 'format', '') <> 'planning-prototype-v20' then
    raise exception 'Ce fichier n''est pas un export du prototype de planning.' using errcode = 'PL400';
  end if;
  if exists (select 1 from public.planning_horaires)
     or exists (select 1 from public.planning_postes)
     or exists (select 1 from public.planning_salaries) then
    raise exception 'Le planning contient déjà des données : l''import ne se fait que dans un planning vide.'
      using errcode = 'PL409';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p -> 'horaires', '[]')) loop
    insert into public.planning_horaires (code, nom, debut, fin, couleur, pause, raccourci, raccourci_debut)
    values (r ->> 'code', r ->> 'nom', r ->> 'debut', r ->> 'fin', coalesce(r ->> 'couleur', '#5b8def'),
            coalesce((r ->> 'pause')::int, 0), coalesce((r ->> 'raccourci')::int, 0),
            coalesce((r ->> 'raccourci_debut')::int, 0))
    returning id into v;
    mh := mh || jsonb_build_object(r ->> 'id', v);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'motifs', '[]')) loop
    insert into public.planning_motifs (code, nom, couleur, decompte, nature)
    values (r ->> 'code', r ->> 'nom', coalesce(r ->> 'couleur', '#94a3b8'),
            coalesce((r ->> 'decompte')::boolean, true), coalesce(r ->> 'nature', 'absence'))
    returning id into v;
    mm := mm || jsonb_build_object(r ->> 'id', v);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'postes', '[]')) loop
    insert into public.planning_postes (nom, categorie, couleur, horaires_autorises, a_part)
    values (r ->> 'nom', coalesce(r ->> 'categorie', 'autre'), coalesce(r ->> 'couleur', '#5b8def'),
            coalesce(array(select (mh ->> x)::bigint
                             from jsonb_array_elements_text(coalesce(r -> 'horaires_autorises', '[]')) x
                            where mh ? x), '{}'),
            coalesce((r ->> 'a_part')::boolean, false))
    returning id into v;
    mp := mp || jsonb_build_object(r ->> 'id', v);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'groupes', '[]')) loop
    insert into public.planning_groupes (nom, ordre, postes_autorises)
    values (r ->> 'nom', coalesce((r ->> 'ordre')::int, 0),
            coalesce(array(select (mp ->> x)::bigint
                             from jsonb_array_elements_text(coalesce(r -> 'postes_autorises', '[]')) x
                            where mp ? x), '{}'))
    returning id into v;
    mg := mg || jsonb_build_object(r ->> 'id', v);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'salaries', '[]')) loop
    -- Semaine type : 7 jours, codes horaires et motifs convertis.
    select coalesce(jsonb_agg(
             case when j.e is null then '{"mode": "auto"}'::jsonb
                  else (j.e - 'type_shift_id' - 'type_absence_id')
                       || jsonb_build_object(
                            'type_shift_id', case when mh ? (j.e ->> 'type_shift_id')
                                                  then (mh ->> (j.e ->> 'type_shift_id'))::bigint end,
                            'type_absence_id', case when mm ? (j.e ->> 'type_absence_id')
                                                    then (mm ->> (j.e ->> 'type_absence_id'))::bigint end)
             end order by g.n), '[]')
      into v_semaine
      from generate_series(0, 6) g(n)
      left join lateral (select coalesce(r -> 'semaine_type', '[]') -> g.n as e) j on true;
    insert into public.planning_salaries
      (prenom, nom, groupe_id, type_contrat, heures_hebdo, forfait_jours, mineur, competences,
       semaine_type, shifts_autorises, date_entree, date_sortie, actif)
    values (
      r ->> 'prenom', coalesce(r ->> 'nom', ''),
      case when mg ? (r ->> 'groupe_id') then (mg ->> (r ->> 'groupe_id'))::bigint end,
      coalesce(r ->> 'type_contrat', 'cdi'), coalesce((r ->> 'heures_hebdo')::numeric, 0),
      coalesce((r ->> 'forfait_jours')::boolean, false), coalesce((r ->> 'mineur')::boolean, false),
      coalesce((select jsonb_agg(jsonb_build_object('poste_id', (mp ->> (c ->> 'poste_id'))::bigint,
                                                    'niveau', coalesce(c ->> 'niveau', 'titulaire')))
                  from jsonb_array_elements(coalesce(r -> 'competences', '[]')) c
                 where mp ? (c ->> 'poste_id')), '[]'),
      v_semaine,
      coalesce(array(select (mh ->> x)::bigint
                       from jsonb_array_elements_text(coalesce(r -> 'shifts_autorises', '[]')) x
                      where mh ? x), '{}'),
      nullif(r ->> 'date_entree', '')::date, nullif(r ->> 'date_sortie', '')::date,
      coalesce((r ->> 'actif')::boolean, true))
    returning id into v;
    ms := ms || jsonb_build_object(r ->> 'id', v);
  end loop;

  -- Contrat précédent (même personne) : après toutes les fiches.
  for r in select * from jsonb_array_elements(coalesce(p -> 'salaries', '[]')) loop
    if ms ? (r ->> 'suite_de') then
      update public.planning_salaries set suite_de = (ms ->> (r ->> 'suite_de'))::bigint
       where id = (ms ->> (r ->> 'id'))::bigint;
    end if;
  end loop;

  -- Jours d'absence (avant les shifts).
  for r in select * from jsonb_array_elements(coalesce(p -> 'salaries', '[]')) loop
    for e in select * from jsonb_array_elements(coalesce(r -> 'absences', '[]')) loop
      if mm ? (e ->> 'motif_id') then
        insert into public.planning_absences (salarie_id, jour, motif_id)
        values ((ms ->> (r ->> 'id'))::bigint, (e ->> 'jour')::date, (mm ->> (e ->> 'motif_id'))::bigint)
        on conflict (salarie_id, jour) do update set motif_id = excluded.motif_id;
        n_abs := n_abs + 1;
      end if;
    end loop;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'besoins', '[]')) loop
    if mp ? (r ->> 'poste_id') then
      insert into public.planning_besoins (poste_id, jour, horaire_id, debut, fin, effectif, soutien, renfort)
      values ((mp ->> (r ->> 'poste_id'))::bigint, (r ->> 'jour')::smallint,
              case when mh ? (r ->> 'horaire_id') then (mh ->> (r ->> 'horaire_id'))::bigint end,
              r ->> 'debut', r ->> 'fin', coalesce((r ->> 'effectif')::int, 1),
              coalesce((r ->> 'soutien')::int, 1), coalesce((r ->> 'renfort')::int, 0));
      n_bes := n_bes + 1;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'affectations', '[]')) loop
    if ms ? (r ->> 'salarie_id') and mp ? (r ->> 'poste_id') then
      insert into public.planning_affectations
        (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, epinglee, court, pause)
      values ((r ->> 'lundi')::date, (ms ->> (r ->> 'salarie_id'))::bigint,
              (mp ->> (r ->> 'poste_id'))::bigint, (r ->> 'jour')::smallint,
              case when mh ? (r ->> 'horaire_id') then (mh ->> (r ->> 'horaire_id'))::bigint end,
              r ->> 'debut', r ->> 'fin', coalesce((r ->> 'epinglee')::boolean, false),
              coalesce((r ->> 'court')::boolean, false), coalesce((r ->> 'pause')::int, 0));
      n_aff := n_aff + 1;
    end if;
  end loop;

  -- Verrous en dernier.
  insert into public.planning_semaines_verrouillees (lundi)
  select x::date from jsonb_array_elements_text(coalesce(p -> 'verrous', '[]')) x
  on conflict (lundi) do nothing;

  return jsonb_build_object(
    'horaires', (select count(*) from jsonb_object_keys(mh)),
    'motifs', (select count(*) from jsonb_object_keys(mm)),
    'postes', (select count(*) from jsonb_object_keys(mp)),
    'groupes', (select count(*) from jsonb_object_keys(mg)),
    'salaries', (select count(*) from jsonb_object_keys(ms)),
    'absences', n_abs, 'besoins', n_bes, 'affectations', n_aff,
    'verrous', jsonb_array_length(coalesce(p -> 'verrous', '[]')));
end $$;

revoke all on function public.planning_importer(jsonb) from public, anon;
grant execute on function public.planning_importer(jsonb) to authenticated, service_role;
