-- =============================================================================
-- REMPLACÉ — NE PLUS REJOUER (bannière posée le 2026-09-28, revue des rejeux).
-- Pourquoi : les RPC de ce fichier (`create or replace function public.…`,
-- SECURITY DEFINER) ont été déplacées dans le schéma private le 2026-09-05,
-- avec un relais SECURITY INVOKER de même nom dans public. Rejouer ce fichier
-- REMPLACERAIT ces relais par des fonctions definer exposées à l'API (Security
-- Advisor rouvert), avec la garde périmée `<> 'gestion'` (NULL passe : un
-- compte sans droit facturation pourrait écrire) et des appels à
-- `public.get_page_level(`, qui n'existe plus (la RPC casserait à l'appel).
-- Font autorité : private_rpc_relais.sql (RPC + relais), PUIS
-- facturation_garde_null_2026-09-05.sql (gardes `is distinct from 'gestion'`) ;
-- policies de lecture : page_permissions_rls_lectures.sql,
-- facturation_admin_only.sql et securite_audit_2026-09-06.sql. Les tables
-- existent en prod. Conservé pour l'historique.
-- =============================================================================

-- =============================================================================
-- facturation_issuer_denylist — garde « cet émetteur ne va JAMAIS sur ce code ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. (Historique : « Ré-exécutable » n'est plus vrai, voir la bannière REMPLACÉ ci-dessus.)
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

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.

-- ---------------------------------------------------------------------------
-- PÉRIMÉ le 2026-09-05 : les RPC ci-dessous (jusqu'à la fin du fichier) vivent
-- désormais dans le schéma private, avec un relais security invoker de même nom
-- dans public (autorité : supabase/private_rpc_relais.sql ; garde NULL :
-- supabase/facturation_garde_null_2026-09-05.sql). Ne pas rejouer ces blocs :
-- ils recréeraient des fonctions security definer dans public (Security Advisor
-- rouvert, doublon avec le relais) et une garde périmée (`<> 'gestion'` laisse
-- passer NULL). Conservés pour l'historique.
-- ---------------------------------------------------------------------------
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
  if public.get_page_level('facturation') <> 'gestion' then
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
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_denylist
   where issuer = p_issuer and code = p_code;
end;
$$;
