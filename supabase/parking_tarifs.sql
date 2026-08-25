-- =============================================================================
-- Parking — table de tarifs VERSIONNÉE (prix TTC + taux de TVA, avec date
-- d'effet), pour calculer un chiffre d'affaires sans jamais casser les
-- calculs déjà effectués sur une période passée.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- parking_status_gratuite.sql.
--
-- Une ligne = un tarif en vigueur À PARTIR de `effective_from` (inclus),
-- jusqu'à la prochaine ligne (ou indéfiniment si c'est la plus récente).
-- Ne JAMAIS modifier une ligne existante pour changer un prix : insérer une
-- nouvelle ligne avec la nouvelle date d'effet, via la RPC set_parking_tarif
-- ci-dessous (seul canal d'écriture — aucune policy INSERT/UPDATE/DELETE
-- pour `authenticated`). C'est ce qui garantit qu'un CA déjà calculé sur une
-- période passée ne bouge jamais rétroactivement.
--
-- Une réservation est facturée au tarif en vigueur à sa DATE D'ARRIVÉE, pour
-- la totalité de ses nuitées (même simplification que celle déjà en place
-- pour les nuitées elles-mêmes, cf. parking_analytics_agg.sql : une
-- réservation à cheval sur deux mois compte déjà toutes ses nuits dans son
-- mois d'arrivée).
--
-- Idempotent : create table/index if not exists, policies redéfinies via
-- drop/create, seed via on conflict do nothing. Non destructif.
-- =============================================================================

create table if not exists public.parking_tarifs (
  id uuid primary key default gen_random_uuid(),
  price_ttc numeric(10, 2) not null check (price_ttc > 0),
  vat_rate numeric(5, 2) not null check (vat_rate >= 0 and vat_rate < 100),
  effective_from date not null unique,
  created_at timestamptz not null default now()
);

create index if not exists parking_tarifs_effective_from_idx
  on public.parking_tarifs (effective_from desc);

alter table public.parking_tarifs enable row level security;

-- Lecture : mêmes droits que le reste de la page parking. Autorité unique des
-- lectures par page = page_permissions_rls*.sql — cette policy-ci est
-- spécifique à parking_tarifs (nouvelle table), elle ne duplique aucune
-- policy existante sur une autre table.
drop policy if exists "parking_tarifs read (page:parking)" on public.parking_tarifs;
create policy "parking_tarifs read (page:parking)"
  on public.parking_tarifs for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('parking'))) >= 1);

-- Écriture : réservée admin, exclusivement via la RPC ci-dessous. Aucune
-- policy INSERT/UPDATE/DELETE pour `authenticated`.

create or replace function public.set_parking_tarif(
  p_price_ttc numeric,
  p_vat_rate numeric,
  p_effective_from date
)
returns public.parking_tarifs
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.parking_tarifs;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_price_ttc <= 0 then
    raise exception 'invalid price_ttc: %', p_price_ttc;
  end if;
  if p_vat_rate < 0 or p_vat_rate >= 100 then
    raise exception 'invalid vat_rate: %', p_vat_rate;
  end if;

  insert into public.parking_tarifs (price_ttc, vat_rate, effective_from)
  values (p_price_ttc, p_vat_rate, p_effective_from)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.set_parking_tarif(numeric, numeric, date) to authenticated;

-- Amorçage : tarif actuel (20 € TTC / 10 %), daté rétroactivement à la plus
-- ancienne réservation connue pour couvrir tout l'historique existant. Sans
-- effet si une ligne existe déjà à cette date (ré-exécutable).
insert into public.parking_tarifs (price_ttc, vat_rate, effective_from)
select 20.00, 10.00, coalesce(
  (select min(start_date) from public.parking_reservations),
  current_date
)
on conflict (effective_from) do nothing;

-- Requêtes de contrôle :
-- select * from public.parking_tarifs order by effective_from;
-- select public.set_parking_tarif(20.00, 10.00, current_date); -- doit échouer 'not authorized' si non-admin
