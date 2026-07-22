-- ============================================================================
-- easter_eggs — déclencheurs clavier configurables (mot-clé → effet visuel).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable
-- (idempotent). Remplace les easter eggs jusqu'ici codés en dur (« chloé »,
-- « claudia ») par une configuration gérée depuis la page admin /easter-eggs.
--
--   Lecture  : tout utilisateur authentifié (le runtime monte les effets actifs).
--   Écriture : admin uniquement — via get_user_role() = 'admin' (RPC déjà
--              déployée, même garde que caisse_sheets « delete (admin) »).
-- ============================================================================

-- ---- Table -----------------------------------------------------------------
create table if not exists public.easter_eggs (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  effect_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un mot-clé = un seul effet (évite deux déclencheurs identiques).
  constraint easter_eggs_keyword_key unique (keyword)
);

-- ---- Trigger updated_at (fonction dédiée, ne rien écraser d'existant) -------
create or replace function public.easter_eggs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists easter_eggs_set_updated_at on public.easter_eggs;
create trigger easter_eggs_set_updated_at
  before update on public.easter_eggs
  for each row execute function public.easter_eggs_set_updated_at();

-- ---- RLS -------------------------------------------------------------------
alter table public.easter_eggs enable row level security;

-- LECTURE : tous les authentifiés (le runtime lit les effets actifs).
drop policy if exists "easter_eggs read (authenticated)" on public.easter_eggs;
create policy "easter_eggs read (authenticated)"
  on public.easter_eggs for select
  to authenticated using (true);

-- INSERT : admin seulement.
drop policy if exists "easter_eggs insert (admin)" on public.easter_eggs;
create policy "easter_eggs insert (admin)"
  on public.easter_eggs for insert
  to authenticated
  with check (get_user_role() = 'admin');

-- UPDATE : admin seulement.
drop policy if exists "easter_eggs update (admin)" on public.easter_eggs;
create policy "easter_eggs update (admin)"
  on public.easter_eggs for update
  to authenticated
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');

-- DELETE : admin seulement.
drop policy if exists "easter_eggs delete (admin)" on public.easter_eggs;
create policy "easter_eggs delete (admin)"
  on public.easter_eggs for delete
  to authenticated
  using (get_user_role() = 'admin');

-- ---- Seed : migre les easter eggs jusqu'ici codés en dur -------------------
-- Les `effect_id` doivent correspondre aux `id` du registre EFFECTS (front).
insert into public.easter_eggs (keyword, effect_id) values
  ('chloé', 'fireworks'),
  ('claudia', 'shootingstars')
on conflict (keyword) do nothing;
