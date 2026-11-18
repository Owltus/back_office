-- Planning : annuler et rétablir (Ctrl+Z / Ctrl+Y, demande utilisateur du
-- 2026-11-18). Remet des CASES (personne, jour) dans un état donné, en une
-- transaction.
--
-- `p_cases` : tableau de
--   { lundi, salarie_id, jour,
--     attendu: { shift, absence },   -- l'état que l'écran croit en base
--     voulu:   { shift, absence } }  -- l'état à remettre
-- où `shift` = { poste_id, horaire_id, debut, fin, pause, epinglee } ou null,
-- et `absence` = { motif_id, epinglee } ou null.
--
-- Sûreté : avant d'écrire quoi que ce soit, CHAQUE case est relue et doit
-- être exactement dans l'état `attendu` ; sinon rien n'est fait (PL409) : un
-- collègue a changé le planning entre-temps, l'annuler effacerait son travail.
-- Seules les cases qui diffèrent sont réécrites.
--
-- Ajout seul, `security invoker` : la RLS et les triggers des shifts et des
-- absences (semaine verrouillée PL423, jour passé PL409, estampille)
-- s'appliquent comme pour toute écriture de la grille.

create or replace function public.planning_restaurer_cases(p_cases jsonb)
returns integer
  language plpgsql
  set search_path to ''
as $$
declare
  c jsonb;
  v_lundi date;
  v_salarie bigint;
  v_jour integer;
  v_date date;
  v_shift jsonb;
  v_absence jsonb;
  v_voulu_shift jsonb;
  v_voulu_absence jsonb;
  v_n integer := 0;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  if p_cases is null or jsonb_typeof(p_cases) <> 'array'
     or jsonb_array_length(p_cases) > 5000 then
    raise exception 'Cases invalides.' using errcode = 'PL400';
  end if;

  -- Le verrou de chaque semaine, dans l'ordre (jamais d'interblocage).
  for v_lundi in
    select distinct (e ->> 'lundi')::date
      from jsonb_array_elements(p_cases) e
     order by 1
  loop
    if extract(isodow from v_lundi) <> 1 then
      raise exception 'Semaine invalide.' using errcode = 'PL400';
    end if;
    perform pg_advisory_xact_lock(hashtext('planning:' || v_lundi::text));
  end loop;

  -- 1. Tout est-il encore tel que l'écran le croit ?
  for c in select * from jsonb_array_elements(p_cases) loop
    v_lundi := (c ->> 'lundi')::date;
    v_salarie := (c ->> 'salarie_id')::bigint;
    v_jour := (c ->> 'jour')::integer;
    if v_jour is null or v_jour not between 0 and 6 then
      raise exception 'Jour invalide.' using errcode = 'PL400';
    end if;
    v_date := v_lundi + v_jour;
    select jsonb_build_object('poste_id', a.poste_id, 'horaire_id', a.horaire_id,
             'debut', a.debut, 'fin', a.fin, 'pause', a.pause, 'epinglee', a.epinglee)
      into v_shift
      from public.planning_affectations a
     where a.lundi = v_lundi and a.salarie_id = v_salarie and a.jour = v_jour;
    select jsonb_build_object('motif_id', b.motif_id, 'epinglee', b.epinglee)
      into v_absence
      from public.planning_absences b
     where b.salarie_id = v_salarie and b.jour = v_date;
    if coalesce(v_shift, 'null'::jsonb) is distinct from coalesce(c -> 'attendu' -> 'shift', 'null'::jsonb)
       or coalesce(v_absence, 'null'::jsonb) is distinct from coalesce(c -> 'attendu' -> 'absence', 'null'::jsonb) then
      raise exception 'Le planning a changé entre-temps : rien n''a été annulé.'
        using errcode = 'PL409';
    end if;
  end loop;

  -- 2. Remettre chaque case.
  for c in select * from jsonb_array_elements(p_cases) loop
    v_lundi := (c ->> 'lundi')::date;
    v_salarie := (c ->> 'salarie_id')::bigint;
    v_jour := (c ->> 'jour')::integer;
    v_date := v_lundi + v_jour;
    v_voulu_shift := nullif(c -> 'voulu' -> 'shift', 'null'::jsonb);
    v_voulu_absence := nullif(c -> 'voulu' -> 'absence', 'null'::jsonb);

    -- D'abord ce qui part (un jour d'absence retire le shift du jour : on
    -- n'écrit l'absence qu'une fois le shift voulu connu).
    if v_voulu_shift is null then
      delete from public.planning_affectations
       where lundi = v_lundi and salarie_id = v_salarie and jour = v_jour;
    end if;
    if v_voulu_absence is null then
      delete from public.planning_absences
       where salarie_id = v_salarie and jour = v_date;
    else
      insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
      values (v_salarie, v_date, (v_voulu_absence ->> 'motif_id')::bigint,
              coalesce((v_voulu_absence ->> 'epinglee')::boolean, true))
      on conflict (salarie_id, jour) do update
        set motif_id = excluded.motif_id, epinglee = excluded.epinglee
        where planning_absences.motif_id is distinct from excluded.motif_id
           or planning_absences.epinglee is distinct from excluded.epinglee;
    end if;
    if v_voulu_shift is not null then
      update public.planning_affectations set
        poste_id = (v_voulu_shift ->> 'poste_id')::bigint,
        horaire_id = (v_voulu_shift ->> 'horaire_id')::bigint,
        debut = v_voulu_shift ->> 'debut',
        fin = v_voulu_shift ->> 'fin',
        pause = (v_voulu_shift ->> 'pause')::integer,
        epinglee = (v_voulu_shift ->> 'epinglee')::boolean
       where lundi = v_lundi and salarie_id = v_salarie and jour = v_jour
         and (poste_id, horaire_id, debut, fin, pause, epinglee) is distinct from
             ((v_voulu_shift ->> 'poste_id')::bigint, (v_voulu_shift ->> 'horaire_id')::bigint,
              v_voulu_shift ->> 'debut', v_voulu_shift ->> 'fin',
              (v_voulu_shift ->> 'pause')::integer, (v_voulu_shift ->> 'epinglee')::boolean);
      if not exists (select 1 from public.planning_affectations
                      where lundi = v_lundi and salarie_id = v_salarie and jour = v_jour) then
        insert into public.planning_affectations
          (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, pause, epinglee)
        values (v_lundi, v_salarie, (v_voulu_shift ->> 'poste_id')::bigint, v_jour,
                (v_voulu_shift ->> 'horaire_id')::bigint, v_voulu_shift ->> 'debut',
                v_voulu_shift ->> 'fin', (v_voulu_shift ->> 'pause')::integer,
                (v_voulu_shift ->> 'epinglee')::boolean);
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.planning_restaurer_cases(jsonb) from public, anon;
grant execute on function public.planning_restaurer_cases(jsonb) to authenticated, service_role;
