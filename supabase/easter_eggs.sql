-- =============================================================================
-- ⚠ NE PLUS REJOUER TEL QUEL (bannière posée le 2026-09-28, revue des rejeux).
-- Pourquoi : `create or replace function public.easter_eggs_set_updated_at()`
-- n'a pas de clause `set search_path` ; un CREATE OR REPLACE remplace TOUS les
-- attributs, donc le rejeu EFFACERAIT le search_path figé par
-- lint_hardening_functions.sql et remediation_securite_2026-08-04.sql (F4) —
-- lint 0011 rouvert. Le seed ré-insérerait aussi « chloé » / « claudia » si un
-- admin les a supprimés. Si un rejeu est nécessaire : le faire suivre du bloc
-- F4 de remediation_securite_2026-08-04.sql. « Ré-exécutable (idempotent) »
-- plus bas n'est vrai qu'à cette condition.
-- =============================================================================

-- ============================================================================
-- easter_eggs — déclencheurs clavier configurables (mot-clé → effet visuel).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable
-- (idempotent). Remplace les easter eggs jusqu'ici codés en dur (« chloé »,
-- « claudia ») par une configuration gérée depuis la page admin /easter-eggs.
--
--   Lecture  : tout utilisateur authentifié (le runtime monte les effets actifs).
--   Écriture : admin uniquement — via public.is_admin() (RPC déjà
--              déployée, même garde que caisse_sheets « delete (admin) »).
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
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
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "easter_eggs insert (admin)"
  on public.easter_eggs for insert
  to authenticated
  with check ((select private.is_admin()));

-- UPDATE : admin seulement.
drop policy if exists "easter_eggs update (admin)" on public.easter_eggs;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "easter_eggs update (admin)"
  on public.easter_eggs for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- DELETE : admin seulement.
drop policy if exists "easter_eggs delete (admin)" on public.easter_eggs;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "easter_eggs delete (admin)"
  on public.easter_eggs for delete
  to authenticated
  using ((select private.is_admin()));

-- ---- Seed : migre les easter eggs jusqu'ici codés en dur -------------------
-- Les `effect_id` doivent correspondre aux `id` du registre EFFECTS (front).
insert into public.easter_eggs (keyword, effect_id) values
  ('chloé', 'fireworks'),
  ('claudia', 'shootingstars')
on conflict (keyword) do nothing;
