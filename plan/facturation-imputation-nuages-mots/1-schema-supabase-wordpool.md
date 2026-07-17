# Étape 1 — Schéma Supabase : table + RLS + RPC (exécuté par l'utilisateur)

## Objectif

Produire le fichier SQL `supabase/facturation_wordpool.sql`, idempotent et sûr pour
la base partagée, définissant : la table des nuages en lignes `(code, token, count)`,
sa RLS, une RPC d'apprentissage atomique par delta, et une RPC de lecture. **Ce SQL
est EXÉCUTÉ PAR L'UTILISATEUR** dans le SQL Editor Supabase — jamais par l'assistant.

## Contexte

Aucune infra Supabase facturation n'existe. On calque `caisse_sheets.sql` /
`security_hardening_triggers.sql` (additif, idempotent, ne touche rien d'existant).
Objets **préfixés `facturation_`** pour ne rien écraser d'une autre app co-hébergée.
La RPC d'apprentissage est `SECURITY DEFINER` (contourne la RLS) → **garde
d'autorisation interne obligatoire** via `get_user_role()` (précédent `admin_update_password`).

## Fichier(s) impacté(s)

- `supabase/facturation_wordpool.sql` (nouveau)

## Travail à réaliser

### 1. Table `(code, token, count)`

```sql
create table if not exists public.facturation_wordpool (
  code       text        not null,
  token      text        not null,
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code, token)
);
```

### 2. RLS : lecture authentifiée, aucune écriture directe (tout passe par la RPC)

```sql
alter table public.facturation_wordpool enable row level security;

drop policy if exists "wordpool read (authenticated)" on public.facturation_wordpool;
create policy "wordpool read (authenticated)" on public.facturation_wordpool
  for select to authenticated using (true);
-- Pas de policy INSERT/UPDATE : seule la RPC SECURITY DEFINER écrit.
```

### 3. RPC d'apprentissage atomique par delta

```sql
create or replace function public.facturation_wordpool_learn(
  p_codes  text[],
  p_deltas jsonb              -- { "token": increment, ... }
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;
  insert into public.facturation_wordpool (code, token, count)
  select c.code, d.key, d.value::int
  from unnest(p_codes) as c(code), jsonb_each_text(p_deltas) as d(key, value)
  on conflict (code, token)
  do update set count = facturation_wordpool.count + excluded.count,
                updated_at = now();
end;
$$;
```

### 4. RPC de lecture (ou simple SELECT) + élagage (hygiène, D6)

Lecture directe possible par `select` (RLS le permet). Élagage en deux temps
(hapax + plafond top-K par code) pour borner la taille et l'entretenir :

```sql
create or replace function public.facturation_wordpool_prune(
  p_min_count int default 2,   -- hapax : supprime les tokens vus < 2 fois
  p_top_k     int default 300  -- plafond : garde les K meilleurs tokens par code
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;
  -- 1) hapax
  delete from public.facturation_wordpool where count < p_min_count;
  -- 2) plafond top-K par code (garde les plus fréquents, jette la traîne)
  delete from public.facturation_wordpool w
  using (
    select code, token,
           row_number() over (partition by code order by count desc) as rn
    from public.facturation_wordpool
  ) r
  where w.code = r.code and w.token = r.token and r.rn > p_top_k;
end;
$$;
```

Note : les mots **ubiquitaires** (présents sur presque tous les codes) ont un poids
IDF ≈ 0 au scoring — ils n'influencent rien même s'ils restent en base ; l'élagage
top-K finit par les évincer. Pas besoin de les traiter à part.

### 5. En-tête du fichier

Reprendre l'en-tête maison : « À EXÉCUTER PAR L'UTILISATEUR — table NOUVELLE
indépendante des tables partagées — `get_user_role()` supposée déployée — idempotent ».

## Ordre d'exécution

1. Rédiger `supabase/facturation_wordpool.sql`.
2. **L'utilisateur** l'exécute dans Supabase → SQL Editor.
3. Vérifier `select * from public.facturation_wordpool limit 1;` (table vide OK).

## Critère de validation

- SQL idempotent (rejouable sans erreur).
- Aucun objet non préfixé `facturation_` ; ne touche aucune table existante.
- La RPC refuse un appelant non super/admin (garde interne).
- Table lisible par un utilisateur authentifié, non écrivable en direct (seule la RPC écrit).

## Contrôle /borg

Étape critique (DDL sur base partagée). Auditer :
- Aucune collision de nom avec des objets existants (`facturation_*` inexistants avant).
- La RPC `SECURITY DEFINER` a bien sa garde `get_user_role()` (sinon contournement RLS).
- `search_path = public` figé (anti-hijack de search_path sur SECURITY DEFINER).
- Aucun `alter`/`drop` sur une table ou fonction hors périmètre `facturation_`.
