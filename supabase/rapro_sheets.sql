-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées.
--
-- Clôture + commentaire du rapprochement, AU NIVEAU JOUR (rapro_rooms est par
-- (jour, chambre), donc pas de porteur naturel pour un état de jour). Une ligne
-- = un jour. PAS de fenêtre de grâce : réouverture libre par super/admin.

create table if not exists public.rapro_sheets (
  id           uuid primary key default gen_random_uuid(),
  report_date  date not null unique,           -- une ligne par jour (clé d'upsert)
  status       text not null default 'draft'
                 check (status in ('draft', 'validated')),
  comment      text not null default '',
  validated_at timestamptz,
  validated_by uuid,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Fonction trigger générique (déjà déployée avec rapro_rooms ; idempotente).
create or replace function public.rapro_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rapro_sheets_set_updated_at on public.rapro_sheets;
create trigger rapro_sheets_set_updated_at
  before update on public.rapro_sheets
  for each row execute function public.rapro_set_updated_at();

-- RLS : lecture pour tout authentifié, écriture réservée super_utilisateur/admin.
alter table public.rapro_sheets enable row level security;

drop policy if exists "rapro_sheets read (authenticated)" on public.rapro_sheets;
create policy "rapro_sheets read (authenticated)"
  on public.rapro_sheets for select
  to authenticated using (true);

drop policy if exists "rapro_sheets insert (super/admin)" on public.rapro_sheets;
create policy "rapro_sheets insert (super/admin)"
  on public.rapro_sheets for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

-- PAS de verrou temporel : super/admin peuvent réouvrir à tout moment.
drop policy if exists "rapro_sheets update (super/admin)" on public.rapro_sheets;
create policy "rapro_sheets update (super/admin)"
  on public.rapro_sheets for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "rapro_sheets delete (super/admin)" on public.rapro_sheets;
create policy "rapro_sheets delete (super/admin)"
  on public.rapro_sheets for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));
