-- ============================================================================
-- facturation_ref_comptes — DICTIONNAIRE des comptes comptables (numéro -> nom humain).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable (idempotent).
--
-- But : donner à chaque numéro de compte (ex. 60710000) un LIBELLÉ lisible par un
-- non-comptable (ex. « Achats de denrées »), INDÉPENDANT des codes analytiques. Un même
-- compte partagé par plusieurs codes porte ainsi partout le même nom clair. C'est la donnée
-- qui rend le référentiel plusieurs-à-plusieurs lisible à l'écran ; le tampon PDF et
-- l'historique technique gardent le numéro.
--
-- RLS : lecture PAR PAGE (facturation), aucune écriture directe (write = RPC only, voir
-- facturation_ref_comptes_rpc.sql). Le seed vit dans facturation_ref_comptes_seed.sql
-- (à passer APRÈS ce fichier et le RPC).
-- 2026-09-05 : aides en schéma private (voir private_schema_aides.sql)
-- ============================================================================

-- 1) Table -------------------------------------------------------------------
create table if not exists public.facturation_ref_comptes (
  compte     text        not null,
  libelle    text        not null default '',
  updated_at timestamptz not null default now(),
  primary key (compte)
);

-- 2) RLS : lecture PAR PAGE (facturation), aucune policy d'écriture (write = RPC only) --
-- Aligné sur facturation_ref_imputations : lecture réservée au niveau `facturation`.
alter table public.facturation_ref_comptes enable row level security;
drop policy if exists "ref_comptes read (page:facturation)" on public.facturation_ref_comptes;
create policy "ref_comptes read (page:facturation)" on public.facturation_ref_comptes
  for select to authenticated
  using ((select private.page_level_rank(private.get_page_level('facturation'))) >= 1);

-- 3) Trigger updated_at ------------------------------------------------------
create or replace function public.facturation_ref_comptes_touch()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists facturation_ref_comptes_touch on public.facturation_ref_comptes;
create trigger facturation_ref_comptes_touch
  before update on public.facturation_ref_comptes
  for each row execute function public.facturation_ref_comptes_touch();

-- Contrôle : select count(*) from public.facturation_ref_comptes;
