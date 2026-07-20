-- =============================================================================
-- facturation_issuer_codes — co-occurrence ÉMETTEUR × CODE d'imputation.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Objectif : donner un « filtre fort par émetteur ». Pour un émetteur donné, on mémorise
-- combien de fois chaque code d'imputation a été VALIDÉ (au tamponnage). Ce signal est
-- SÉPARÉ du nuage de mots (facturation_wordpool) : il sert de PRIOR pour conditionner
-- l'attribution sans « collapser » un émetteur multi-articles (sa distribution reste
-- `{codeA:8, codeB:5}`). L'attribution reste pilotée par l'ÉDUCATION : rien n'est déduit
-- des libellés d'imputation, seulement de l'appris.
--
-- Mêmes règles de sécurité que l'existant : RLS + policy SELECT `authenticated`, AUCUNE
-- policy d'écriture directe, écritures via RPC SECURITY DEFINER avec garde de rôle, search_path
-- figé. `get_user_role()` supposée déjà déployée. Table isolée (aucune FK/trigger sur les
-- tables partagées repjour) → réversible par `drop table`.
-- =============================================================================

create table if not exists public.facturation_issuer_codes (
  issuer     text        not null,   -- clé émetteur = normalize(supplierName).trim()
  code       text        not null,   -- code analytique d'imputation
  count      integer     not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (issuer, code)
);

create index if not exists facturation_issuer_codes_issuer_idx
  on public.facturation_issuer_codes (issuer);

alter table public.facturation_issuer_codes enable row level security;

drop policy if exists "issuer_codes read (authenticated)" on public.facturation_issuer_codes;
create policy "issuer_codes read (authenticated)" on public.facturation_issuer_codes
  for select to authenticated using (true);

-- ---- RPC : apprentissage (+1 par code validé pour l'émetteur) ---------------
create or replace function public.facturation_issuer_codes_learn(
  p_issuer text,
  p_codes  text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_issuer, '')) < 4 then
    return; -- même garde anti faux-positifs que facturation_issuer_learn
  end if;

  insert into public.facturation_issuer_codes (issuer, code, count)
  select p_issuer, c.code, 1
  from unnest(p_codes) as c(code)
  on conflict (issuer, code)
  do update set count = facturation_issuer_codes.count + 1,
                updated_at = now();
end;
$$;

-- ---- RPC : désapprentissage symétrique (décrément borné + purge) ------------
create or replace function public.facturation_issuer_codes_unlearn(
  p_issuer text,
  p_codes  text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuer_codes w
     set count = greatest(0, w.count - 1),
         updated_at = now()
  from unnest(p_codes) as c(code)
  where w.issuer = p_issuer and w.code = c.code;

  delete from public.facturation_issuer_codes where count <= 0;
end;
$$;

-- ---- RPC : oubli complet d'un émetteur (delete/merge d'émetteur) ------------
create or replace function public.facturation_issuer_codes_forget(
  p_issuer text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_codes where issuer = p_issuer;
end;
$$;
