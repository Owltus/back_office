-- =====================================================================
-- Fenêtres d'écriture comptées en jours de Paris, hors caisse
-- (audit de sécurité run-2 du 2026-11-18, étape 2 du plan
-- `plan/securite-audit-run2-2026-11-18/`)
-- =====================================================================
-- Symptôme : juste après minuit à Paris (une à deux heures selon la
--   saison), la base laisse un compte en écriture modifier un jour de plus
--   que ce que l'écran permet (J-2, J-3, J-7 décalés d'un jour).
-- Cause : les policies comparent à `current_date`, qui suit le fuseau de la
--   base (UTC). L'écran compte en jours de Paris.
-- Correctif : chaque policy concernée est recréée SOUS LE MÊME NOM, mêmes
--   rôles, même commande ; seule l'expression de date change :
--   `current_date` devient `(select private.planning_aujourdhui())`, la
--   date du jour à Paris (aide déjà en place, exécutable par
--   `authenticated`, lue une fois par requête). Le texte a été relevé dans
--   le catalogue local (`pg_policies`) et seul ce mot y a été remplacé.
--   Même changement dans les deux triggers qui bornent un début reculé
--   (lits bébé, parking).
--   Tables : rapro_rooms, rapro_sheets, literie_sheets,
--   baby_cot_assignments, parking_reservations, pdj_breakfasts,
--   pdj_externals, pdj_addon_production (21 policies).
-- Exclus (décision utilisateur du 2026-11-18) : caisse_sheets et
--   caisse_cautions gardent `current_date`.
-- Innocuité : la date de Paris est toujours égale ou postérieure à la date
--   UTC. Une borne `x >= jour - k` ne peut donc que se resserrer, et
--   seulement pendant la nuit. Aucune fenêtre ne s'élargit. La gestion et le
--   contexte système ne sont pas concernés.
-- Jour hôtelier (relecture adverse du 2026-11-18) : PDJ et Rapprochement
--   comptent en JOUR HÔTELIER, qui bascule à 02:00 à Paris
--   (src/lib/businessDay.ts, DAY_CUTOFF_HOUR = 2), et non en date de Paris.
--   Leurs policies utilisent donc private.jour_hotelier() ; parking et lits
--   bébé, qui comptent en date du calendrier, gardent planning_aujourdhui().
--   Entre 00:00 et 02:00, la fenêtre de ces deux pages est la même que celle
--   de l'écran. Pour ces deux pages seulement, la fenêtre peut donc être
--   d'un jour plus large qu'avec `current_date` (en hiver, de 01:00 à
--   02:00) : c'est celle que l'écran propose déjà.
-- =====================================================================

create or replace function private.jour_hotelier() returns date
  language sql stable
  set search_path to ''
as $$ select ((now() at time zone 'Europe/Paris') - interval '2 hours')::date; $$;
revoke all on function private.jour_hotelier() from public;
grant execute on function private.jour_hotelier() to authenticated, service_role;

drop policy "baby_cot_assignments delete (page:literie)" on public.baby_cot_assignments;
create policy "baby_cot_assignments delete (page:literie)" on public.baby_cot_assignments
  as PERMISSIVE for DELETE to authenticated
  using (((( SELECT private.get_page_level('literie'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('literie'::text)) AS page_level_rank) >= 2) AND (end_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 2)))));

drop policy "baby_cot_assignments update (page:literie)" on public.baby_cot_assignments;
create policy "baby_cot_assignments update (page:literie)" on public.baby_cot_assignments
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('literie'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('literie'::text)) AS page_level_rank) >= 2) AND (end_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 2)))))
  with check (((( SELECT private.get_page_level('literie'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('literie'::text)) AS page_level_rank) >= 2) AND (end_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 2)))));

drop policy "baby_cot_assignments write (page:literie)" on public.baby_cot_assignments;
create policy "baby_cot_assignments write (page:literie)" on public.baby_cot_assignments
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('literie'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('literie'::text)) AS page_level_rank) >= 2) AND (start_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 2)))));

drop policy "literie_sheets update (page:literie)" on public.literie_sheets;
create policy "literie_sheets update (page:literie)" on public.literie_sheets
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('literie'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('literie'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 2)))))
  with check (((( SELECT private.get_page_level('literie'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('literie'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 2)))));

drop policy "literie_sheets write (page:literie)" on public.literie_sheets;
create policy "literie_sheets write (page:literie)" on public.literie_sheets
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('literie'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('literie'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 2)))));

drop policy "parking delete (page:parking)" on public.parking_reservations;
create policy "parking delete (page:parking)" on public.parking_reservations
  as PERMISSIVE for DELETE to authenticated
  using (((( SELECT private.get_page_level('parking'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('parking'::text)) AS page_level_rank) >= 2) AND ((start_date + (nights)::integer) >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 7)))));

drop policy "parking update (page:parking)" on public.parking_reservations;
create policy "parking update (page:parking)" on public.parking_reservations
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('parking'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('parking'::text)) AS page_level_rank) >= 2) AND ((start_date + (nights)::integer) >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 7)))))
  with check (((( SELECT private.get_page_level('parking'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('parking'::text)) AS page_level_rank) >= 2) AND ((start_date + (nights)::integer) >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 7)))));

drop policy "parking write (page:parking)" on public.parking_reservations;
create policy "parking write (page:parking)" on public.parking_reservations
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('parking'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('parking'::text)) AS page_level_rank) >= 2) AND (start_date >= (( SELECT private.planning_aujourdhui() AS planning_aujourdhui) - 7)))));

drop policy "pdj addon update (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon update (page:pdj)" on public.pdj_addon_production
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))))
  with check (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))));

drop policy "pdj addon write (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon write (page:pdj)" on public.pdj_addon_production
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))));

drop policy "pdj delete (page:pdj)" on public.pdj_breakfasts;
create policy "pdj delete (page:pdj)" on public.pdj_breakfasts
  as PERMISSIVE for DELETE to authenticated
  using (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (manual_kind IS NOT NULL) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))));

drop policy "pdj update (page:pdj)" on public.pdj_breakfasts;
create policy "pdj update (page:pdj)" on public.pdj_breakfasts
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))))
  with check (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))));

drop policy "pdj write (page:pdj)" on public.pdj_breakfasts;
create policy "pdj write (page:pdj)" on public.pdj_breakfasts
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))));

drop policy "pdj externals update (page:pdj)" on public.pdj_externals;
create policy "pdj externals update (page:pdj)" on public.pdj_externals
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))))
  with check (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))));

drop policy "pdj externals write (page:pdj)" on public.pdj_externals;
create policy "pdj externals write (page:pdj)" on public.pdj_externals
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('pdj'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('pdj'::text)) AS page_level_rank) >= 2) AND (service_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 3)))));

drop policy "rapro_rooms delete (page:rapro)" on public.rapro_rooms;
create policy "rapro_rooms delete (page:rapro)" on public.rapro_rooms
  as PERMISSIVE for DELETE to authenticated
  using (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))));

drop policy "rapro_rooms update (page:rapro)" on public.rapro_rooms;
create policy "rapro_rooms update (page:rapro)" on public.rapro_rooms
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))))
  with check (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))));

drop policy "rapro_rooms write (page:rapro)" on public.rapro_rooms;
create policy "rapro_rooms write (page:rapro)" on public.rapro_rooms
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))));

drop policy "rapro_sheets delete (page:rapro)" on public.rapro_sheets;
create policy "rapro_sheets delete (page:rapro)" on public.rapro_sheets
  as PERMISSIVE for DELETE to authenticated
  using (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))));

drop policy "rapro_sheets update (page:rapro)" on public.rapro_sheets;
create policy "rapro_sheets update (page:rapro)" on public.rapro_sheets
  as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))))
  with check (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))));

drop policy "rapro_sheets write (page:rapro)" on public.rapro_sheets;
create policy "rapro_sheets write (page:rapro)" on public.rapro_sheets
  as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT private.get_page_level('rapro'::text) AS get_page_level) = 'gestion'::text) OR ((( SELECT private.page_level_rank(private.get_page_level('rapro'::text)) AS page_level_rank) >= 2) AND (report_date >= (( SELECT private.jour_hotelier() AS jour_hotelier) - 2)))));

-- Triggers : un début reculé est borné à la même date de Paris -----------
create or replace function public.parking_no_past_rewrite()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Contexte non-utilisateur (maintenance, service_role) : aucun garde-fou.
  if auth.uid() is null then
    return new;
  end if;
  -- La gestion (et l'admin, qui a get_page_level = 'gestion') peut tout.
  if private.get_page_level('parking') = 'gestion' then
    return new;
  end if;
  -- Interdire de reculer le début plus loin dans le passé verrouillé.
  if new.start_date < old.start_date
     and new.start_date < (private.planning_aujourdhui() - 7) then
    raise exception 'parking: recul du debut dans le passe verrouille (reserve a la gestion)';
  end if;
  return new;
end;
$$;

create or replace function public.baby_cot_assignments_no_past_rewrite()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if private.get_page_level('literie') = 'gestion' then
    return new;
  end if;
  -- Même plancher que la policy INSERT (LITERIE_GRACE_DAYS = 2).
  if new.start_date < old.start_date
     and new.start_date < (private.planning_aujourdhui() - 2) then
    raise exception using
      errcode = '42501',
      message = 'lits bebe: recul du debut hors fenetre (reserve a la gestion)';
  end if;
  return new;
end;
$$;

-- Fonctions de trigger fermées à authenticated (relecture adverse du
-- 2026-11-18 : elles l'étaient par les privilèges par défaut).
revoke all on function public.parking_no_past_rewrite() from public, anon, authenticated;
revoke all on function public.baby_cot_assignments_no_past_rewrite() from public, anon, authenticated;
