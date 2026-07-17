# Étape 1 — Schéma Supabase : table `facturation_issuers` + RPC

## Objectif

Produire `supabase/facturation_issuers.sql` (idempotent, préfixé, sûr pour la base
partagée) : dictionnaire des émetteurs connus + RLS + RPC d'apprentissage. **SQL
exécuté par l'utilisateur**.

## Contexte

Même patron que `facturation_wordpool.sql` : table dédiée, RLS lecture authentifiée,
écriture uniquement via RPC `SECURITY DEFINER` à garde `get_user_role`.

## Fichier(s) impacté(s)

- `supabase/facturation_issuers.sql` (nouveau)

## Travail à réaliser

```sql
-- Dictionnaire des émetteurs déjà saisis (nom normalisé → nom d'affichage).
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
-- Pas d'écriture directe : seule la RPC écrit.

create or replace function public.facturation_issuer_learn(
  p_name    text,
  p_display text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;
  if char_length(p_name) < 4 then return; end if;  -- garde anti faux-positifs
  insert into public.facturation_issuers (name, display, count)
  values (p_name, p_display, 1)
  on conflict (name)
  do update set count = facturation_issuers.count + 1,
                display = excluded.display,   -- garde la dernière forme saisie
                updated_at = now();
end;
$$;
```

En-tête maison : « À EXÉCUTER PAR L'UTILISATEUR — table NOUVELLE indépendante des
tables partagées — idempotent ».

## Ordre d'exécution

1. Rédiger `supabase/facturation_issuers.sql`.
2. L'utilisateur l'exécute dans Supabase → SQL Editor.

## Critère de validation

- SQL idempotent, préfixé `facturation_`, ne touche rien d'existant.
- RPC refuse un appelant non super/admin, et un nom < 4 caractères.
- Table lisible par authentifié, non écrivable en direct.

## Contrôle /borg

Étape critique (DDL sur base partagée). Auditer : garde `get_user_role` dans la RPC,
`search_path = public` figé, aucune collision de nom, aucun `alter/drop` hors
périmètre `facturation_`.
