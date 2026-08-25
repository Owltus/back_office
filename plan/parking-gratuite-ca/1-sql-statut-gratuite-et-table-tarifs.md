# Étape 1 — SQL : statut « gratuité » + table de tarifs versionnée

## Objectif

Élargir la contrainte de statut de `parking_reservations` pour accepter
`'gratuite'`, et créer une table `parking_tarifs` qui stocke le prix TTC et
le taux de TVA du parking avec une date d'effet — chaque changement futur de
tarif s'ajoute comme une NOUVELLE ligne, sans jamais modifier les lignes
existantes, pour ne jamais altérer un CA déjà calculé sur une période passée.

## Contexte

Précédent direct pour la contrainte : `supabase/parking_status_employe.sql`
(pattern `drop constraint if exists` / `add constraint`, idempotent). Aucun
précédent de table de configuration versionnée n'existe dans le projet — ce
chantier introduit le pattern. RLS lecture calquée sur
`supabase/page_permissions_rls_lectures.sql` (gate `page:parking`). RPC
d'écriture calquée sur `set_user_grade`
(`supabase/page_permissions.sql` — `security definer set search_path =
public`, garde `is_admin()` en première instruction).

## Fichier(s) impacté(s)

- `supabase/parking_status_gratuite.sql` (nouveau)
- `supabase/parking_tarifs.sql` (nouveau)

## Travail à réaliser

### 1. Élargir la contrainte de statut

`supabase/parking_status_gratuite.sql` :

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Idempotent, non destructif, ré-exécutable.

alter table public.parking_reservations
  drop constraint if exists parking_reservations_status_check;

alter table public.parking_reservations
  add constraint parking_reservations_status_check
  check (status in ('reserve', 'paye', 'checkout', 'employe', 'gratuite'));

-- Requête de contrôle :
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'parking_reservations_status_check';
```

### 2. Créer la table `parking_tarifs`

`supabase/parking_tarifs.sql` :

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Idempotent (create table/index if not exists), non destructif.
--
-- Une ligne = un tarif en vigueur À PARTIR de `effective_from` (inclus),
-- jusqu'à la prochaine ligne (ou indéfiniment si c'est la plus récente).
-- Ne JAMAIS modifier une ligne existante pour changer un prix : insérer une
-- nouvelle ligne avec la nouvelle date d'effet (cf. RPC set_parking_tarif
-- ci-dessous). C'est ce qui garantit qu'un CA déjà calculé sur une période
-- passée ne bouge jamais rétroactivement.

create table if not exists public.parking_tarifs (
  id uuid primary key default gen_random_uuid(),
  price_ttc numeric(10, 2) not null check (price_ttc > 0),
  vat_rate numeric(5, 2) not null check (vat_rate >= 0 and vat_rate < 100),
  effective_from date not null unique,
  created_at timestamptz not null default now()
);

create index if not exists parking_tarifs_effective_from_idx
  on public.parking_tarifs (effective_from desc);

alter table public.parking_tarifs enable row level security;

-- Lecture : mêmes droits que le reste de la page parking (autorité unique
-- des lectures par page = page_permissions_rls*.sql — ne PAS dupliquer
-- cette policy ailleurs, un rejeu d'un autre fichier ne doit jamais la
-- retirer).
drop policy if exists "parking_tarifs read (page:parking)" on public.parking_tarifs;
create policy "parking_tarifs read (page:parking)"
  on public.parking_tarifs for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('parking'))) >= 1);

-- Écriture : réservée admin, via RPC (jamais d'insert direct côté client).
-- Aucune policy INSERT/UPDATE/DELETE pour `authenticated` : la RPC
-- SECURITY DEFINER ci-dessous est le seul canal d'écriture.

create or replace function public.set_parking_tarif(
  p_price_ttc numeric,
  p_vat_rate numeric,
  p_effective_from date
)
returns public.parking_tarifs
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.parking_tarifs;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_price_ttc <= 0 then
    raise exception 'invalid price_ttc: %', p_price_ttc;
  end if;
  if p_vat_rate < 0 or p_vat_rate >= 100 then
    raise exception 'invalid vat_rate: %', p_vat_rate;
  end if;

  insert into public.parking_tarifs (price_ttc, vat_rate, effective_from)
  values (p_price_ttc, p_vat_rate, p_effective_from)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.set_parking_tarif(numeric, numeric, date) to authenticated;

-- Amorçage : tarif actuel (20 € TTC / 10 %), daté rétroactivement à la plus
-- ancienne réservation connue pour couvrir tout l'historique existant.
-- Sans effet si une ligne existe déjà à cette date (ré-exécutable).
insert into public.parking_tarifs (price_ttc, vat_rate, effective_from)
select 20.00, 10.00, coalesce(
  (select min(start_date) from public.parking_reservations),
  current_date
)
on conflict (effective_from) do nothing;

-- Requêtes de contrôle :
-- select * from public.parking_tarifs order by effective_from;
-- select public.set_parking_tarif(20.00, 10.00, current_date); -- doit échouer si non-admin
```

## Ordre d'exécution

1. Écrire les deux fichiers SQL.
2. L'utilisateur exécute `parking_status_gratuite.sql` puis `parking_tarifs.sql`
   dans Supabase → SQL Editor, dans cet ordre.
3. Vérifier via les requêtes de contrôle en fin de chaque fichier.

## Critère de validation

- `select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'parking_reservations_status_check'`
  affiche `'gratuite'` dans la liste des valeurs autorisées.
- `select * from public.parking_tarifs` renvoie exactement une ligne :
  20.00 / 10.00 / une date ≤ à la plus ancienne réservation existante.
- Un utilisateur non-admin qui appelle `set_parking_tarif(...)` reçoit une
  erreur `not authorized` (à tester manuellement ou via un futur test RPC).
- Les deux fichiers SQL sont ré-exécutables sans erreur ni doublon (rejouer
  `parking_tarifs.sql` une seconde fois ne doit ni dupliquer la ligne
  d'amorçage, ni échouer).

## Contrôle /borg

Étape critique : nouvelle table + RLS + fonction `SECURITY DEFINER` en
production. À auditer après exécution du SQL par l'utilisateur :

- La policy de lecture ne s'appuie QUE sur `page_permissions_rls*.sql`
  (`get_page_level('parking')`) — aucune policy dupliquée qui rouvrirait un
  accès plus large en cas de rejeu d'un autre fichier.
- Aucune policy INSERT/UPDATE/DELETE pour `authenticated` sur
  `parking_tarifs` — seule la RPC `set_parking_tarif` (SECURITY DEFINER)
  peut écrire.
- `search_path = public` bien figé sur la fonction (protection contre le
  détournement de search_path classique sur les fonctions SECURITY
  DEFINER).
- La garde `is_admin()` est la toute première instruction du corps de la
  fonction, avant toute autre logique.
- La contrainte `check (price_ttc > 0)` et `check (vat_rate >= 0 and vat_rate < 100)`
  empêche l'insertion de valeurs aberrantes même par la RPC.
