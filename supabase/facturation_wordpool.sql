-- =============================================================================
-- facturation_wordpool — nuages de mots pour l'imputation comptable auto (page
-- Facturation).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Table NOUVELLE, préfixée `facturation_`, indépendante des tables repjour
-- partagées (aucune écriture sur celles-ci). get_user_role() est supposée déjà
-- déployée (lit profiles.role de auth.uid()).
--
-- Modèle : un « nuage de mots » par code d'imputation = des compteurs de tokens
-- AGRÉGÉS. On ne stocke NI les PDF NI leur texte : uniquement des fréquences de
-- mots additionnées. La taille dépend du vocabulaire métier (qui sature), pas du
-- nombre de factures. Rien n'est reconstructible.
--
-- Écriture : JAMAIS en direct par le client. Seule la RPC SECURITY DEFINER
-- `facturation_wordpool_learn` écrit (incrément atomique par delta), avec garde
-- d'autorisation interne (super_utilisateur / admin) — car SECURITY DEFINER
-- contourne la RLS. Lecture : tout authentifié (le scoring se fait côté client).
-- Chargement app : TanStack Query, pas de Realtime.
-- =============================================================================

-- ---- Table ------------------------------------------------------------------
create table if not exists public.facturation_wordpool (
  code       text        not null,   -- code analytique d'imputation
  token      text        not null,   -- mot normalisé (sans accent, sans chiffre)
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code, token)
);

create index if not exists facturation_wordpool_code_idx
  on public.facturation_wordpool (code);

-- ---- RLS : lecture authentifiée, aucune écriture directe --------------------
alter table public.facturation_wordpool enable row level security;

drop policy if exists "wordpool read (authenticated)" on public.facturation_wordpool;
create policy "wordpool read (authenticated)" on public.facturation_wordpool
  for select to authenticated using (true);
-- Pas de policy INSERT/UPDATE/DELETE : seule la RPC SECURITY DEFINER écrit.

-- ---- RPC : apprentissage atomique par delta ---------------------------------
-- p_codes  : les codes finaux validés d'une facture (vérité terrain).
-- p_deltas : { "token": increment, ... } (les mots de CETTE facture).
create or replace function public.facturation_wordpool_learn(
  p_codes  text[],
  p_deltas jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
    raise exception 'not authorized';
  end if;

  insert into public.facturation_wordpool (code, token, count)
  select c.code, d.key, d.value::int
  from unnest(p_codes) as c(code),
       jsonb_each_text(p_deltas) as d(key, value)
  on conflict (code, token)
  do update set count = facturation_wordpool.count + excluded.count,
                updated_at = now();
end;
$$;

-- ---- RPC : élagage (hygiène / bornage) --------------------------------------
-- 1) supprime les hapax (tokens vus < p_min_count fois),
-- 2) plafonne à p_top_k tokens par code (garde les plus fréquents).
-- À lancer ponctuellement (maintenance). Les mots ubiquitaires ont un poids
-- IDF ~ 0 au scoring : inoffensifs même s'ils restent ; le top-K finit par les
-- évincer.
create or replace function public.facturation_wordpool_prune(
  p_min_count int default 2,
  p_top_k     int default 300
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where count < p_min_count;

  delete from public.facturation_wordpool w
  using (
    select code, token,
           row_number() over (partition by code order by count desc) as rn
    from public.facturation_wordpool
  ) r
  where w.code = r.code and w.token = r.token and r.rn > p_top_k;
end;
$$;
