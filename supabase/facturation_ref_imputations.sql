-- ============================================================================
-- facturation_ref_imputations — RÉFÉRENTIEL des imputations au COUPLE
-- (code analytique + compte). Plan analytique OKKO, version « couple ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable (idempotent).
--
-- Remplace le modèle facturation_budget_lines (code seul) : ici une ligne = un
-- COUPLE (code_analytique, compte). Un code peut porter plusieurs comptes ; un
-- compte peut apparaître sous plusieurs codes. section / libelle / description
-- accompagnent le couple.
--
-- RLS : lecture authentifiée ; AUCUNE écriture directe (write = RPC only, voir
-- facturation_ref_imputations_rpc.sql). Le seed vit dans
-- facturation_ref_imputations_seed.sql (à passer APRÈS ce fichier et le RPC).
-- ============================================================================

-- 1) Table -------------------------------------------------------------------
create table if not exists public.facturation_ref_imputations (
  code_analytique text        not null,
  compte          text        not null,
  section         text        not null default '',
  libelle         text        not null default '',
  description     text        not null default '',
  sort_order      int         not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (code_analytique, compte)
);
create index if not exists facturation_ref_imp_compte_idx
  on public.facturation_ref_imputations (compte);

-- 2) RLS : lecture PAR PAGE (facturation), aucune policy d'écriture (write = RPC only) --
-- Durci (H2) : le SELECT était `using(true)` — lisible par tout compte connecté.
-- Aligné sur les autres facturation_* : lecture réservée au niveau `facturation`.
alter table public.facturation_ref_imputations enable row level security;
drop policy if exists "ref_imputations read (authenticated)" on public.facturation_ref_imputations;
drop policy if exists "ref_imputations read (page:facturation)" on public.facturation_ref_imputations;
create policy "ref_imputations read (page:facturation)" on public.facturation_ref_imputations
  for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('facturation'))) >= 1);

-- 3) Trigger updated_at ------------------------------------------------------
create or replace function public.facturation_ref_imputations_touch()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists facturation_ref_imputations_touch on public.facturation_ref_imputations;
create trigger facturation_ref_imputations_touch
  before update on public.facturation_ref_imputations
  for each row execute function public.facturation_ref_imputations_touch();

-- Contrôle : select count(*) from public.facturation_ref_imputations;
