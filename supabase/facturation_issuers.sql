-- =============================================================================
-- facturation_issuers — dictionnaire des émetteurs de factures déjà rencontrés
-- (page Facturation), pour reconnaître et pré-remplir l'émetteur.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Table NOUVELLE, préfixée `facturation_`, indépendante des tables repjour
-- partagées. get_user_role() est supposée déjà déployée.
--
-- Un émetteur = un nom NORMALISÉ (clé, minuscule sans accent) + son nom
-- d'affichage lisible + un compteur de confirmations. On ne stocke aucun contenu
-- de facture ici, juste des noms d'émetteurs saisis par l'utilisateur.
--
-- Écriture : JAMAIS en direct par le client. Seule la RPC SECURITY DEFINER
-- `facturation_issuer_learn` écrit (upsert +1), avec garde d'autorisation interne
-- (super_utilisateur / admin) et garde de longueur (≥ 4 car.) anti faux-positifs.
-- Lecture : tout authentifié (le pré-remplissage se fait côté client).
-- =============================================================================

create table if not exists public.facturation_issuers (
  name       text        primary key,   -- normalize(supplierName).trim()
  display    text        not null,       -- dernière forme lisible saisie
  count      integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.facturation_issuers enable row level security;

drop policy if exists "issuers read (authenticated)" on public.facturation_issuers;
create policy "issuers read (authenticated)" on public.facturation_issuers
  for select to authenticated using (true);
-- Pas de policy INSERT/UPDATE/DELETE : seule la RPC SECURITY DEFINER écrit.

-- p_name    : nom normalisé (clé) ; p_display : forme lisible à afficher.
create or replace function public.facturation_issuer_learn(
  p_name    text,
  p_display text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_name, '')) < 4 then
    return; -- garde anti faux-positifs (noms trop courts)
  end if;

  insert into public.facturation_issuers (name, display, count)
  values (p_name, p_display, 1)
  on conflict (name)
  do update set count = facturation_issuers.count + 1,
                display = excluded.display,
                updated_at = now();
end;
$$;
