-- Plus de code horaire (demande utilisateur du 2026-10-31 : « supprimer les
-- notions de code horaire, issues d'une vieille application ; ce qui
-- importe, ce sont les horaires, et savoir si c'est du matin, du soir, de la
-- nuit ou du middle »). Décisions du même jour :
--   - la colonne `code` est supprimée tout de suite (SUPPRIMER au clavier à
--     la livraison) ; un horaire se lit par ses heures et son moment ;
--   - deux horaires n'ont jamais les mêmes heures (sans code, on ne les
--     distinguerait plus) ;
--   - Direction (08:00-18:00) et Supervision (12:00-20:45), sans moment,
--     passent en middle ; « 12 h - 20 h 45 » demandé reste cet horaire ;
--   - horaires ajoutés : 08:00-15:45 (matin) et 14:00-22:45 (soir), pause
--     45 min, permis sur les postes qui tournent entre matins et soirs
--     (Supervision réception, Réception, Club en prod) ; 00:00-07:00 (nuit)
--     existe déjà en prod (ajouté ailleurs s'il manque, sur les postes de
--     nuit).
-- Les codes des MOTIFS d'absence (CP, MA…) restent.

-- 1) Un moment pour tous (Direction, Supervision : seuls sans moment).
update public.planning_horaires set periode = 'middle' where periode is null;

-- 2) Le code disparaît (sa contrainte de longueur part avec lui).
alter table public.planning_horaires drop column code;

comment on column public.planning_horaires.periode is
  'Moment de l''horaire : matin, middle, soir, nuit ou court (proposé d''après les heures, modifiable).';
comment on column public.planning_horaires.code_rouge is
  'Heures écrites en rouge (petit shift à part).';

-- 3) Sans code, les heures distinguent les horaires.
create unique index planning_horaires_heures_unique
  on public.planning_horaires (debut, fin);

-- 4) Horaires demandés. Seulement sur une base qui a déjà ses horaires
-- (prod, copie) : une base rejouée depuis zéro reçoit les siens du seed,
-- joué après les migrations (sinon ses identifiants entreraient en
-- conflit). Matin et soir : permis sur les postes qui listent déjà des
-- matins ET des soirs ; nuit : sur ceux qui listent une nuit (un poste
-- « tous les horaires » n'a rien à changer).
with demandes (nom, debut, fin, pause, periode) as (
  values
    ('Matin de 8 h à 15 h 45', '08:00', '15:45', 45, 'matin'),
    ('Soir de 14 h à 22 h 45', '14:00', '22:45', 45, 'soir'),
    ('Nuit de minuit à 7 h', '00:00', '07:00', 0, 'nuit')
),
ajoutes as (
  insert into public.planning_horaires (nom, debut, fin, couleur, pause, periode)
  select d.nom, d.debut, d.fin,
         coalesce(
           (select h.couleur from public.planning_horaires h
             where h.periode = d.periode order by h.id limit 1),
           '#5b8def'),
         d.pause, d.periode
  from demandes d
  where exists (select 1 from public.planning_horaires)
  on conflict (debut, fin) do nothing
  returning id, periode
)
update public.planning_postes p
set horaires_autorises = p.horaires_autorises || array(
  select a.id from ajoutes a
  where (a.periode = 'nuit' and exists (
          select 1 from public.planning_horaires h
          where h.id = any (p.horaires_autorises) and h.periode = 'nuit'))
     or (a.periode in ('matin', 'soir')
         and exists (
           select 1 from public.planning_horaires h
           where h.id = any (p.horaires_autorises) and h.periode = 'matin')
         and exists (
           select 1 from public.planning_horaires h
           where h.id = any (p.horaires_autorises) and h.periode = 'soir'))
  order by a.id
)
where cardinality(p.horaires_autorises) > 0;

-- 5) Import du prototype : même fonction, sans le code (corps repris du
-- catalogue, `pg_get_functiondef`, le 2026-10-31). Le code éventuel du
-- fichier est ignoré.
create or replace function public.planning_importer(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  e jsonb;
  v bigint;
  mh jsonb := '{}';  -- horaire : id du prototype -> id ici
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
    insert into public.planning_horaires (nom, debut, fin, couleur, pause, raccourci, raccourci_debut)
    values (r ->> 'nom', r ->> 'debut', r ->> 'fin', coalesce(r ->> 'couleur', '#5b8def'),
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
end $function$;

revoke all on function public.planning_importer(jsonb) from public, anon;
grant execute on function public.planning_importer(jsonb) to authenticated, service_role;

-- 6) Suppression d'un horaire : même fonction, l'horaire nommé par ses
-- heures au lieu de son code (corps repris du catalogue le 2026-10-31 ;
-- trouvé par le test pgTAP « horaire seul permis d'un poste », 42703).
create or replace function public.planning_supprimer_horaire(p_id bigint)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_heures text;
  v_qui text;
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  select replace(debut, '24:00', '00:00') || '–' || replace(fin, '24:00', '00:00')
    into v_heures from public.planning_horaires where id = p_id;
  if v_heures is null then return; end if;
  if exists (select 1 from public.planning_affectations a
              where a.horaire_id = p_id and private.planning_verrouillee(a.lundi)) then
    raise exception 'L''horaire % figure dans des plannings réalisés : il ne peut plus être supprimé.', v_heures
      using errcode = 'PL409';
  end if;
  select string_agg(q, ', ') into v_qui from (
    select 'la fiche de ' || btrim(prenom || ' ' || nom) as q from public.planning_salaries
     where shifts_autorises = array[p_id]
    union all
    select 'le poste ' || nom from public.planning_postes where horaires_autorises = array[p_id]) t;
  if v_qui is not null then
    raise exception 'L''horaire % est le seul permis pour %. Ajoutez d''abord un autre horaire à ces listes.',
      v_heures, v_qui using errcode = 'PL409';
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
  -- Besoins : supprimés (FK en cascade) ; shifts : gardent leurs heures, en
  -- horaire spécifique.
  delete from public.planning_horaires where id = p_id;
end $function$;

revoke all on function public.planning_supprimer_horaire(bigint) from public, anon;
grant execute on function public.planning_supprimer_horaire(bigint) to authenticated, service_role;
