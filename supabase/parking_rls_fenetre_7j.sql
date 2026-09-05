-- =============================================================================
-- PARKING — RLS : fenêtre d'édition de 7 jours (écriture) + passé verrouillé (gestion)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Ne touche QUE les policies d'écriture de `parking_reservations` : aucune table,
-- aucun trigger, aucune donnée. Ré-exécutable (drop if exists puis create).
--
-- RÈGLE (miroir de lib/parking/editability.ts, PARKING_GRACE_DAYS = 7) :
--   - gestion  : peut tout modifier/créer, y compris le passé verrouillé ;
--   - ecriture : n'agit que sur l'actualité, sans jamais réécrire le passé figé :
--       * INSERT : l'ARRIVÉE (start_date) doit être >= aujourd'hui - 7 j
--                  (pas de réservation back-datée) ;
--       * UPDATE : la FIN (start_date + nights) doit rester >= aujourd'hui - 7 j,
--                  ET (trigger) le DÉBUT ne peut pas reculer plus loin dans le passé
--                  verrouillé qu'il ne l'était (empêche d'étirer/glisser une résa
--                  présente vers les jours figés) ;
--       * DELETE : seulement une résa d'actualité (fin >= aujourd'hui - 7 j).
--     Le cas « début reculé » exige de comparer OLD et NEW → impossible en policy
--     (WITH CHECK ne voit que NEW), d'où le trigger BEFORE UPDATE ci-dessous.
-- =============================================================================

-- 1) APERÇU (facultatif) — combien de résa seraient « verrouillées » aujourd'hui
--    pour un niveau écriture (fin antérieure à J-7).
select count(*) as reservations_verrouillees
from public.parking_reservations
where (start_date + nights) < (current_date - 7);


-- 2) POLICIES (gate de NIVEAU + fenêtre temporelle sur les bornes visibles de NEW)
drop policy if exists "parking insert (super/admin)" on public.parking_reservations;
drop policy if exists "parking update (super/admin)" on public.parking_reservations;
drop policy if exists "parking delete (super/admin)" on public.parking_reservations;
drop policy if exists "parking write (page:parking)" on public.parking_reservations;
drop policy if exists "parking update (page:parking)" on public.parking_reservations;
drop policy if exists "parking delete (page:parking)" on public.parking_reservations;

-- INSERT : l'arrivée doit être dans la zone éditable (pas de back-dating).
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "parking write (page:parking)"
  on public.parking_reservations for insert to authenticated
  with check (
    (select public.get_page_level('parking')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('parking'))) >= 2
      and start_date >= (current_date - 7)
    )
  );

-- UPDATE : la résa (avant ET après) doit rester d'actualité (fin >= J-7).
-- Le recul du début est traité par le trigger (§3).
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "parking update (page:parking)"
  on public.parking_reservations for update to authenticated
  using (
    (select public.get_page_level('parking')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('parking'))) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  )
  with check (
    (select public.get_page_level('parking')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('parking'))) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );

-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "parking delete (page:parking)"
  on public.parking_reservations for delete to authenticated
  using (
    (select public.get_page_level('parking')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('parking'))) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );


-- 3) TRIGGER anti-recul du début — le seul cas nécessitant OLD vs NEW.
--    Un éditeur `ecriture` ne peut pas faire reculer le début d'une résa plus
--    loin dans le passé verrouillé qu'il ne l'était. `gestion` (et les contextes
--    non-utilisateur : service_role / SQL editor) ne sont pas bridés.
create or replace function public.parking_no_past_rewrite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Contexte non-utilisateur (maintenance, service_role) : aucun garde-fou.
  if auth.uid() is null then
    return new;
  end if;
  -- La gestion (et l'admin, qui a get_page_level = 'gestion') peut tout.
  if public.get_page_level('parking') = 'gestion' then
    return new;
  end if;
  -- Interdire de reculer le début plus loin dans le passé verrouillé.
  if new.start_date < old.start_date and new.start_date < (current_date - 7) then
    raise exception 'parking: recul du debut dans le passe verrouille (reserve a la gestion)';
  end if;
  return new;
end;
$$;

drop trigger if exists parking_no_past_rewrite on public.parking_reservations;
create trigger parking_no_past_rewrite
  before update on public.parking_reservations
  for each row execute function public.parking_no_past_rewrite();


-- 4) VÉRIFICATION — doit lister les 3 policies + le trigger.
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'parking_reservations'
  and policyname like 'parking %(page:parking)'
order by cmd;

select tgname
from pg_trigger
where tgrelid = 'public.parking_reservations'::regclass
  and not tgisinternal
  and tgname = 'parking_no_past_rewrite';
