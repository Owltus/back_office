-- =============================================================================
-- PARKING — RLS : fenêtre d'édition de 7 jours (écriture) + passé verrouillé (gestion)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Ne touche QUE les policies d'écriture de `parking_reservations` : aucune table,
-- aucun trigger, aucune donnée. Ré-exécutable (drop if exists puis create).
--
-- RÈGLE (miroir de lib/parking/editability.ts, PARKING_GRACE_DAYS = 7) :
--   - gestion  : peut tout modifier, y compris le passé verrouillé ;
--   - ecriture : uniquement les réservations d'actualité — date de fin de séjour
--     (start_date + nights) >= aujourd'hui - 7 jours (présent, futur, passé récent
--     et séjours encore en cours).
-- Le with check sur INSERT/UPDATE empêche aussi de pousser une résa dans le passé figé.
-- =============================================================================

-- 1) APERÇU (facultatif) — combien de résa seraient « verrouillées » aujourd'hui
--    pour un niveau écriture (départ antérieur à J-7).
select count(*) as reservations_verrouillees
from public.parking_reservations
where (start_date + nights) < (current_date - 7);


-- 2) POLICIES
drop policy if exists "parking insert (super/admin)" on public.parking_reservations;
drop policy if exists "parking update (super/admin)" on public.parking_reservations;
drop policy if exists "parking delete (super/admin)" on public.parking_reservations;
drop policy if exists "parking write (page:parking)" on public.parking_reservations;
drop policy if exists "parking update (page:parking)" on public.parking_reservations;
drop policy if exists "parking delete (page:parking)" on public.parking_reservations;

create policy "parking write (page:parking)"
  on public.parking_reservations for insert to authenticated
  with check (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );

create policy "parking update (page:parking)"
  on public.parking_reservations for update to authenticated
  using (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  )
  with check (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );

create policy "parking delete (page:parking)"
  on public.parking_reservations for delete to authenticated
  using (
    public.get_page_level('parking') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('parking')) >= 2
      and (start_date + nights) >= (current_date - 7)
    )
  );


-- 3) VÉRIFICATION — doit lister les 3 policies (insert/update/delete) ci-dessus.
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'parking_reservations'
  and policyname like 'parking %(page:parking)'
order by cmd;
