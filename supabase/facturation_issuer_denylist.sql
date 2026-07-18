-- =============================================================================
-- facturation_issuer_denylist — garde « cet émetteur ne va JAMAIS sur ce code ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Distinct du signal fréquentiel facturation_issuer_codes (co-occurrence POSITIVE) : ici
-- la PRÉSENCE d'une paire (issuer, code) = interdiction. La détection retire ce code des
-- candidats pour cet émetteur. Mêmes règles de sécurité que l'existant : RLS + policy
-- SELECT authenticated, AUCUNE policy d'écriture, écritures via RPC SECURITY DEFINER avec
-- garde de rôle, search_path figé. `get_user_role()` supposée déjà déployée. Table isolée
-- (aucune FK/trigger sur les tables partagées) → réversible par `drop table`.
-- =============================================================================

create table if not exists public.facturation_issuer_denylist (
  issuer     text        not null,   -- clé = normalize(supplierName).trim()
  code       text        not null,   -- code exclu des candidats pour cet émetteur
  created_at timestamptz not null default now(),
  primary key (issuer, code)
);

create index if not exists facturation_issuer_denylist_issuer_idx
  on public.facturation_issuer_denylist (issuer);

alter table public.facturation_issuer_denylist enable row level security;

drop policy if exists "issuer_denylist read (authenticated)" on public.facturation_issuer_denylist;
create policy "issuer_denylist read (authenticated)" on public.facturation_issuer_denylist
  for select to authenticated using (true);

-- ---- RPC : poser une interdiction (idempotent) ------------------------------
create or replace function public.facturation_issuer_denylist_add(
  p_issuer text,
  p_code   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_issuer, '')) < 4 then
    return; -- garde homogène anti faux-positifs
  end if;

  insert into public.facturation_issuer_denylist (issuer, code)
  values (p_issuer, p_code)
  on conflict (issuer, code) do nothing;
end;
$$;

-- ---- RPC : lever une interdiction (undo) ------------------------------------
create or replace function public.facturation_issuer_denylist_remove(
  p_issuer text,
  p_code   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_denylist
   where issuer = p_issuer and code = p_code;
end;
$$;
