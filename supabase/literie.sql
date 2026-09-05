-- =============================================================================
-- literie — script UNIQUE pour toute la page 'literie' (grille literie
-- synthétique + stock de secours + planning lits parapluie bébé).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, EN UNE FOIS, du
-- début à la fin. Entièrement idempotent (create table if not exists, add/
-- drop column if not exists/if exists, create or replace function, drop
-- policy if exists puis create) : rejouable sans risque sur une base déjà à
-- jour comme sur une base neuve.
--
-- Remplace (et absorbe le contenu de) les anciens fichiers séparés
-- hotel_rooms.sql, literie_stock.sql, baby_cots.sql,
-- baby_cot_assignments_label.sql, literie_rls.sql et verif_securite_literie.sql
-- — supprimés du dépôt, ce fichier-ci est désormais la SEULE source à
-- rejouer pour tout redéployer ou tout revérifier. Se termine par un bilan
-- en une seule ligne (section 5).
--
-- HORS PÉRIPHÈRE : `literie_sheets` (feuille du jour, commentaire + clôture)
-- a été retirée de l'app (décision utilisateur) — cette table existe encore
-- en base si supabase/literie_sheets.sql a été joué avant, mais n'est plus
-- créée ni vérifiée ici (orpheline, sans effet si tu ne la touches pas).
-- =============================================================================


-- =============================================================================
-- 1) HOTEL_ROOMS — statut literie synthétique par chambre (état permanent)
-- =============================================================================
create table if not exists public.hotel_rooms (
  room                 smallint primary key,
  literie_synthetique  boolean not null default false,
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);

create or replace function public.hotel_rooms_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists hotel_rooms_stamp on public.hotel_rooms;
create trigger hotel_rooms_stamp
  before insert or update on public.hotel_rooms
  for each row execute function public.hotel_rooms_stamp();

-- Seed des 80 chambres (source : src/lib/hotel/rooms.ts, ALL_ROOMS).
insert into public.hotel_rooms (room)
select generate_series(102, 114)
union all select generate_series(201, 214)
union all select generate_series(301, 314)
union all select generate_series(401, 414)
union all select generate_series(501, 514)
union all select generate_series(621, 631)
on conflict (room) do nothing;

alter table public.hotel_rooms enable row level security;


-- =============================================================================
-- 2) LITERIE_STOCK / LITERIE_STOCK_MOVEMENTS — stock de secours + historique
-- =============================================================================
create table if not exists public.literie_stock (
  id                  smallint primary key default 1 check (id = 1),
  synthetic_pillows   integer not null default 0 check (synthetic_pillows >= 0),
  synthetic_duvets    integer not null default 0 check (synthetic_duvets >= 0),
  updated_at          timestamptz not null default now()
);
insert into public.literie_stock (id) values (1) on conflict (id) do nothing;

create table if not exists public.literie_stock_movements (
  id          uuid primary key default gen_random_uuid(),
  room        smallint not null references public.hotel_rooms(room),
  item        text not null check (item in ('oreiller', 'couette')),
  direction   text not null check (direction in ('mise_en_place', 'retour')),
  quantity    smallint not null default 1 check (quantity > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid not null default auth.uid()
);
create index if not exists literie_stock_movements_room_idx
  on public.literie_stock_movements (room, created_at desc);

-- RPC bas niveau : UN mouvement + ajustement du compteur (utilisée en interne
-- par literie_toggle_bedding ci-dessous ; reste appelable seule pour un futur
-- ajustement manuel du stock).
create or replace function public.literie_record_movement(
  p_room smallint, p_item text, p_direction text, p_quantity smallint default 1
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.page_level_rank(public.get_page_level('literie')) < 2 then
    raise exception 'not authorized';
  end if;
  if p_item not in ('oreiller', 'couette') then
    raise exception 'invalid item: %', p_item;
  end if;
  if p_direction not in ('mise_en_place', 'retour') then
    raise exception 'invalid direction: %', p_direction;
  end if;

  insert into public.literie_stock_movements (room, item, direction, quantity, created_by)
  values (p_room, p_item, p_direction, p_quantity, auth.uid());

  update public.literie_stock set
    synthetic_pillows = synthetic_pillows
      + case when p_item = 'oreiller' and p_direction = 'retour' then p_quantity
             when p_item = 'oreiller' and p_direction = 'mise_en_place' then -p_quantity
             else 0 end,
    synthetic_duvets = synthetic_duvets
      + case when p_item = 'couette' and p_direction = 'retour' then p_quantity
             when p_item = 'couette' and p_direction = 'mise_en_place' then -p_quantity
             else 0 end,
    updated_at = now()
  where id = 1;
end;
$$;
grant execute on function public.literie_record_movement(smallint, text, text, smallint) to authenticated;

-- RPC atomique (celle appelée par l'app) : chambre + les 2 mouvements + le
-- compteur dans UNE seule transaction — si le stock est insuffisant, TOUT
-- annule, y compris le statut de la chambre (pas de désynchronisation).
create or replace function public.literie_toggle_bedding(
  p_room smallint, p_synthetic boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_direction text := case when p_synthetic then 'mise_en_place' else 'retour' end;
begin
  if public.page_level_rank(public.get_page_level('literie')) < 2 then
    raise exception 'not authorized';
  end if;

  update public.hotel_rooms set literie_synthetique = p_synthetic where room = p_room;
  if not found then
    raise exception 'unknown room: %', p_room;
  end if;

  perform public.literie_record_movement(p_room, 'oreiller', v_direction);
  perform public.literie_record_movement(p_room, 'couette', v_direction);
end;
$$;
grant execute on function public.literie_toggle_bedding(smallint, boolean) to authenticated;

alter table public.literie_stock enable row level security;
alter table public.literie_stock_movements enable row level security;


-- =============================================================================
-- 3) BABY_COTS / BABY_COT_ASSIGNMENTS — ressources + planning lits bébé
-- =============================================================================
create table if not exists public.baby_cots (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into public.baby_cots (label)
select 'Lit ' || n from generate_series(1, 4) as n
where not exists (select 1 from public.baby_cots);

-- Schéma final : `label` texte libre (comme `client` sur parking_reservations),
-- PAS de chambre associée formellement. NUITÉES (comme Parking) : `end_date`
-- est le jour de DÉPART, EXCLU (le lit se libère ce matin-là) — d'où
-- `end_date > start_date` (au moins 1 nuit), pas `>=`.
create table if not exists public.baby_cot_assignments (
  id          uuid primary key default gen_random_uuid(),
  cot_id      uuid not null references public.baby_cots(id),
  label       text not null default '',
  start_date  date not null,
  end_date    date not null check (end_date > start_date),
  comment     text not null default '',
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Défensif : bascule une base déjà créée avec l'ANCIENNE contrainte
-- (`end_date >= start_date`, jour de départ INCLUS) vers la nouvelle
-- (nuitées, `end_date > start_date`). Les lignes existantes à 0 nuit
-- (`end_date = start_date`, ancien sens « 1 jour occupé ») sont d'abord
-- décalées d'1 jour pour rester valides sous la nouvelle contrainte.
update public.baby_cot_assignments set end_date = end_date + 1 where end_date = start_date;
alter table public.baby_cot_assignments drop constraint if exists baby_cot_assignments_end_date_check;
alter table public.baby_cot_assignments add constraint baby_cot_assignments_end_date_check check (end_date > start_date);

-- Défensif : rattrape une base qui aurait encore l'ANCIEN schéma (room/
-- guest_name, avant migration) — sans effet si déjà migré. `room`/`guest_name`
-- ne sont référencées que dans du SQL DYNAMIQUE (EXECUTE), jamais en dur :
-- sinon la requête refuserait de COMPILER dès que ces colonnes n'existent
-- plus (Postgres valide les colonnes au moment de la préparation, pas
-- seulement à l'exécution du WHERE/EXISTS).
alter table public.baby_cot_assignments add column if not exists label text not null default '';
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'baby_cot_assignments'
      and column_name in ('room', 'guest_name')
  ) then
    execute $sql$
      update public.baby_cot_assignments
      set label = trim(
        coalesce(guest_name, '')
        || case when coalesce(guest_name, '') <> '' and room is not null then ' — ' else '' end
        || case when room is not null then 'ch. ' || room::text else '' end
      )
      where label = ''
    $sql$;
  end if;
end
$$;
alter table public.baby_cot_assignments drop column if exists room;
alter table public.baby_cot_assignments drop column if exists guest_name;

create index if not exists baby_cot_assignments_cot_idx
  on public.baby_cot_assignments (cot_id, start_date);

create or replace function public.baby_cot_assignments_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists baby_cot_assignments_stamp on public.baby_cot_assignments;
create trigger baby_cot_assignments_stamp
  before insert or update on public.baby_cot_assignments
  for each row execute function public.baby_cot_assignments_stamp();

do $$
begin
  alter publication supabase_realtime add table public.baby_cot_assignments;
exception
  when duplicate_object then null;
end
$$;

alter table public.baby_cots enable row level security;
alter table public.baby_cot_assignments enable row level security;


-- =============================================================================
-- 4) RLS — lecture + écriture des 5 tables actives (fichier dédié, ces tables
--    sont toutes propres à la page 'literie', aucune policy préexistante à
--    fermer — cf. supabase/page_permissions_rls*.sql pour les autres pages).
-- =============================================================================

-- HOTEL_ROOMS
drop policy if exists "hotel_rooms read (page:literie)" on public.hotel_rooms;
create policy "hotel_rooms read (page:literie)"
  on public.hotel_rooms for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('literie'))) >= 1);

drop policy if exists "hotel_rooms write (page:literie)" on public.hotel_rooms;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "hotel_rooms write (page:literie)"
  on public.hotel_rooms for update to authenticated
  using ((select public.page_level_rank(public.get_page_level('literie'))) >= 2)
  with check ((select public.page_level_rank(public.get_page_level('literie'))) >= 2);

-- LITERIE_STOCK / LITERIE_STOCK_MOVEMENTS (lecture seule — écriture RPC only)
drop policy if exists "literie_stock read (page:literie)" on public.literie_stock;
create policy "literie_stock read (page:literie)"
  on public.literie_stock for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('literie'))) >= 1);

drop policy if exists "literie_stock_movements read (page:literie)" on public.literie_stock_movements;
create policy "literie_stock_movements read (page:literie)"
  on public.literie_stock_movements for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('literie'))) >= 1);

-- BABY_COTS (gestion du parc, réservée à 'gestion')
drop policy if exists "baby_cots read (page:literie)" on public.baby_cots;
create policy "baby_cots read (page:literie)"
  on public.baby_cots for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('literie'))) >= 1);

drop policy if exists "baby_cots write (page:literie)" on public.baby_cots;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "baby_cots write (page:literie)"
  on public.baby_cots for all to authenticated
  using ((select public.get_page_level('literie')) = 'gestion')
  with check ((select public.get_page_level('literie')) = 'gestion');

-- BABY_COT_ASSIGNMENTS (fenêtre de grâce LITERIE_GRACE_DAYS = 2)
drop policy if exists "baby_cot_assignments read (page:literie)" on public.baby_cot_assignments;
create policy "baby_cot_assignments read (page:literie)"
  on public.baby_cot_assignments for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('literie'))) >= 1);

drop policy if exists "baby_cot_assignments write (page:literie)" on public.baby_cot_assignments;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "baby_cot_assignments write (page:literie)"
  on public.baby_cot_assignments for insert to authenticated
  with check (
    (select public.get_page_level('literie')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('literie'))) >= 2
      and start_date >= (current_date - 2)
    )
  );

drop policy if exists "baby_cot_assignments update (page:literie)" on public.baby_cot_assignments;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "baby_cot_assignments update (page:literie)"
  on public.baby_cot_assignments for update to authenticated
  using (
    (select public.get_page_level('literie')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('literie'))) >= 2
      and end_date >= (current_date - 2)
    )
  )
  with check (
    (select public.get_page_level('literie')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('literie'))) >= 2
      and end_date >= (current_date - 2)
    )
  );

drop policy if exists "baby_cot_assignments delete (page:literie)" on public.baby_cot_assignments;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "baby_cot_assignments delete (page:literie)"
  on public.baby_cot_assignments for delete to authenticated
  using (
    (select public.get_page_level('literie')) = 'gestion'
    or (
      (select public.page_level_rank(public.get_page_level('literie'))) >= 2
      and end_date >= (current_date - 2)
    )
  );


-- =============================================================================
-- 5) VÉRIFICATION — une ligne, à lire à la fin. Tout doit être `true`.
-- =============================================================================
select
  (select count(*) = 5 from pg_tables where schemaname = 'public' and tablename in (
    'hotel_rooms', 'literie_stock', 'literie_stock_movements',
    'baby_cots', 'baby_cot_assignments')) as tables_ok,
  (select count(*) = 80 from public.hotel_rooms) as chambres_ok,
  (select count(*) = 4 from public.baby_cots where active) as lits_ok,
  (select count(*) = 1 from public.literie_stock) as stock_ok,
  (select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'baby_cot_assignments'
      and column_name in ('room', 'guest_name')
  )) as schema_label_ok,
  (select count(*) = 2 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('literie_toggle_bedding', 'literie_record_movement')
  ) as rpc_ok,
  (select count(*) = 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'baby_cot_assignments'
  ) as realtime_ok,
  (select count(*) = 10 from pg_policies where schemaname = 'public' and tablename in (
    'hotel_rooms', 'literie_stock', 'literie_stock_movements',
    'baby_cots', 'baby_cot_assignments')
  ) as policies_ok;
-- Attendu : true partout sur cette ligne unique. Le premier `false` te dit
-- quelle section (1-4 ci-dessus) rejouer.
-- =============================================================================
