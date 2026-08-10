# Étape 1 — SQL : table `pdj_addon_production` + RLS + trigger

## Objectif

Créer la table qui stocke, par jour métier et par code petit-déjeuner, les agrégats du CSV
Addon Production (nombre de réservations + revenu TTC). Elle est écrite par **deux chemins**
(comme `pdj_breakfasts`) : l'Edge Function (service_role, contourne la RLS, pipeline auto) ET
l'app lors de l'**import manuel** (sous RLS). Elle a donc besoin de policies de **lecture ET
d'écriture** `page:pdj`. Aucune PII → pas de purge.

## Contexte

Granularité `(service_date, code)`, distincte de `pdj_breakfasts` qui est `(service_date, room)`.
Le gabarit à suivre est `supabase/pms_daily_metrics.sql` (table « par date » alimentée par
import, lue par l'app). Script **idempotent, NON destructif, exécuté par l'utilisateur**.

Décisions actées : date métier lue du contenu puis **alignée +1 jour** par l'importeur (donc
`service_date` reçu = jour du petit-déjeuner, cf. Point de correction n°1) ; pas de table
`pdj_day_extras` (extras dérivés du décompte existant).

## Fichier(s) impacté(s)

- `supabase/pdj_addon_production.sql` (nouveau) — table + trigger + RLS **+ les 4 policies**.

> DÉCISION 2026-08-10 : les policies addon sont **définies dans `pdj_addon_production.sql`**,
> PAS dans les fichiers d'autorité. Raison : `page_permissions_rls_lectures.sql` /
> `page_permissions_rls.sql` sont des migrations **one-shot** (leurs `drop` visent d'anciens
> noms permissifs → un rejeu échoue `42710 already exists`). En logeant les policies addon
> uniquement dans le fichier de table (idempotent, `drop if exists` par nom définitif), on
> obtient **un seul fichier auto-suffisant et rejouable**, sans doublon ni « revert silencieux ».

## Travail à réaliser

### 1. Table + index + trigger d'estampillage (`pdj_addon_production.sql`)

En-tête rituel (« À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable. »,
mention NON DESTRUCTIF, table NOUVELLE indépendante). Puis :

```sql
create table if not exists public.pdj_addon_production (
  id            uuid primary key default gen_random_uuid(),
  service_date  date not null,                 -- jour métier (même sémantique que pdj_breakfasts)
  code          text not null,                 -- 'PDJ' / 'PDJBB', normalisé upper/trim par l'import
  total_count   integer not null default 0,    -- Total Count = nb de réservations
  revenue_ttc   numeric(12,2) not null default 0,  -- Total Revenue (TTC)
  source_file   text,
  imported_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (service_date, code)                  -- clé d'upsert idempotent
);

create index if not exists pdj_addon_production_service_date_idx
  on public.pdj_addon_production (service_date);

-- Estampillage SERVEUR (updated_at). PAS d'imported_by : la table est écrite par l'Edge en
-- service_role → auth.uid() serait NULL ; la traçabilité passe par source_file.
create or replace function public.pdj_addon_production_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pdj_addon_production_set_updated_at on public.pdj_addon_production;
drop trigger if exists pdj_addon_production_stamp on public.pdj_addon_production;
create trigger pdj_addon_production_stamp
  before insert or update on public.pdj_addon_production
  for each row execute function public.pdj_addon_production_stamp();

alter table public.pdj_addon_production enable row level security;

-- RLS : les policies vivent dans page_permissions_rls*.sql (autorité UNIQUE).
-- Ne PAS recréer de policy ici (un rejeu rouvrirait les lectures).
```

### 2. Policies dans les fichiers d'autorité (calquées sur `pdj_breakfasts`)

L'autorité des policies reste `page_permissions_rls*.sql` — on N'écrit PAS de policy dans le
fichier de table. Ajouter, à côté des policies `pdj … (page:pdj)` existantes :

**Lecture — `page_permissions_rls_lectures.sql`** (niveau ≥ 1) :
```sql
drop policy if exists "pdj addon read (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon read (page:pdj)"
  on public.pdj_addon_production for select to authenticated
  using ((select public.page_level_rank(public.get_page_level('pdj'))) >= 1);
```

**Écriture — `page_permissions_rls.sql`** (miroir exact de `pdj_breakfasts` : INSERT/UPDATE
niveau ≥ 2 + fenêtre J-3, ou `gestion` hors fenêtre ; DELETE `gestion`). L'import manuel côté
app est réservé aux admins (`gestion`) → ils passent hors fenêtre ; l'Edge (service_role)
contourne la RLS de toute façon.
```sql
drop policy if exists "pdj addon write (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon write (page:pdj)"
  on public.pdj_addon_production for insert to authenticated
  with check (
    public.get_page_level('pdj') = 'gestion'
    or (public.page_level_rank(public.get_page_level('pdj')) >= 2
        and service_date >= (current_date - 3)));

drop policy if exists "pdj addon update (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon update (page:pdj)"
  on public.pdj_addon_production for update to authenticated
  using (
    public.get_page_level('pdj') = 'gestion'
    or (public.page_level_rank(public.get_page_level('pdj')) >= 2
        and service_date >= (current_date - 3)))
  with check (
    public.get_page_level('pdj') = 'gestion'
    or (public.page_level_rank(public.get_page_level('pdj')) >= 2
        and service_date >= (current_date - 3)));

drop policy if exists "pdj addon delete (page:pdj)" on public.pdj_addon_production;
create policy "pdj addon delete (page:pdj)"
  on public.pdj_addon_production for delete to authenticated
  using (public.get_page_level('pdj') = 'gestion');
```

### 3. Bloc de vérification en commentaire (fin de fichier)

```sql
-- Vérif (lecture seule) :
--   select policyname, cmd from pg_policies
--   where tablename = 'pdj_addon_production';        -- SELECT + INSERT + UPDATE + DELETE
--   select relrowsecurity from pg_class
--   where relname = 'pdj_addon_production';          -- t
```

## Ordre d'exécution

1. Rédiger `supabase/pdj_addon_production.sql`.
2. Ajouter la policy SELECT dans `page_permissions_rls_lectures.sql` et les policies
   INSERT/UPDATE/DELETE dans `page_permissions_rls.sql`.
3. L'utilisateur exécute les fichiers modifiés dans Supabase → SQL Editor.
4. Vérifier via le bloc de contrôle (RLS activée, 4 policies présentes).

## Critère de validation

- La table existe, `unique (service_date, code)` présent, RLS activée.
- 4 policies `page:pdj` : SELECT (rank ≥ 1), INSERT/UPDATE (rank ≥ 2 + fenêtre J-3 ou gestion),
  DELETE (gestion) — miroir exact de `pdj_breakfasts`.
- Script rejouable sans erreur ni effet destructif.

## Contrôle /borg

Étape critique (CREATE TABLE, trigger, RLS). Auditer après exécution :
- RLS bien activée et **défaut fermé** : un `authenticated` sans droit `page:pdj` lit 0 ligne
  et ne peut pas écrire.
- Les policies d'écriture sont bien **bornées** (rank ≥ 2 + fenêtre, ou gestion) — un simple
  lecteur (`lecture`) ne peut PAS insérer/modifier des revenus.
- Policies écrites dans les fichiers d'autorité, PAS dans `pdj_addon_production.sql` ni
  `pdj_breakfasts.sql` (autorité unique préservée, anti « revert silencieux »).
- Trigger `search_path = public` figé ; script strictement idempotent et non destructif.
- Aucune régression sur les policies des autres tables `page:pdj`.
