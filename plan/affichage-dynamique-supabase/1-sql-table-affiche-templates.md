# Étape 1 — SQL : table `affiche_templates` + RLS (+ seed / realtime)

## Objectif

Créer la table applicative `affiche_templates` qui persiste les modèles d'affiche, avec un trigger `updated_at`, des policies RLS par rôle (lecture pour tous les connectés, écriture réservée selon D1) et, selon D2, un seed des 7 modèles existants. Le script est **exécuté par l'utilisateur** dans Supabase → SQL Editor ; l'assistant n'écrit jamais en prod.

## Contexte

Réplique fidèle du patron `supabase/parking_realtime.sql` (seul `.sql` versionné du repo). Tout le script doit être **ré-exécutable sans erreur** (`create ... if not exists`, `drop policy if exists` avant chaque `create policy`, `create or replace function`, `drop trigger if exists`). `get_user_role()` est supposée déjà déployée (ne pas la recréer). Fonction trigger **dédiée** `affiche_set_updated_at()` — ne jamais réutiliser `parking_set_updated_at` (convention : une fonction par feature pour ne rien écraser dans la base partagée).

## Fichier(s) impacté(s)

- `supabase/affiche_templates.sql` (nouveau)

## Travail à réaliser

### 1. Table + index + trigger

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
create table if not exists public.affiche_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  icon text not null default 'alert',
  color text not null default 'okko'
    check (color in ('bw', 'okko', 'red', 'blue', 'yellow')),
  title_fr text not null default '',
  message_fr text not null default '',
  title_en text not null default '',
  message_en text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiche_templates_sort_idx
  on public.affiche_templates (sort_order, name);

create or replace function public.affiche_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists affiche_templates_set_updated_at on public.affiche_templates;
create trigger affiche_templates_set_updated_at
  before update on public.affiche_templates
  for each row execute function public.affiche_set_updated_at();
```

Le `check` sur `color` reflète le type `ColorKey` (`'bw' | 'okko' | 'red' | 'blue' | 'yellow'`) : une couleur invalide venue de la DB ferait planter le rendu (`COLORS[colorKey]` sans repli, `Poster.tsx:105`). Pas de `check` sur `icon` (le rendu a un repli `alert` via `getIconSvg`).

### 2. RLS — lecture ouverte, écriture selon D1

Option A (recommandée, miroir parking) : écriture pour `super_utilisateur` + `admin`.

```sql
alter table public.affiche_templates enable row level security;

drop policy if exists "affiche read (authenticated)" on public.affiche_templates;
create policy "affiche read (authenticated)"
  on public.affiche_templates for select
  to authenticated using (true);

drop policy if exists "affiche insert (super/admin)" on public.affiche_templates;
create policy "affiche insert (super/admin)"
  on public.affiche_templates for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "affiche update (super/admin)" on public.affiche_templates;
create policy "affiche update (super/admin)"
  on public.affiche_templates for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "affiche delete (super/admin)" on public.affiche_templates;
create policy "affiche delete (super/admin)"
  on public.affiche_templates for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));
```

Pour l'Option B (admin seul), remplacer `in ('super_utilisateur', 'admin')` par `= 'admin'` dans les policies insert / update / delete.

### 3. Seed des 7 modèles (selon D2, Option A)

Seed idempotent : n'insère que si la table est vide. Les 7 lignes reprennent exactement la constante `collection` de `src/lib/poster/templates.ts` (name, icon, color, titleFr, messageFr, titleEn, messageEn). Le seed s'exécute en SQL Editor (rôle privilégié), il **contourne la RLS** — normal.

```sql
insert into public.affiche_templates
  (name, icon, color, title_fr, message_fr, title_en, message_en, sort_order)
select * from (values
  ('Café en panne', 'coffee', 'okko', '<titre FR>', '<message FR>', '<title EN>', '<message EN>', 0)
  -- … les 6 autres lignes (elevator_maintenance, water_outage, power_outage,
  --    fire_alarm_test, wet_paint, toilet_out), transcrites depuis templates.ts
) as seed(name, icon, color, title_fr, message_fr, title_en, message_en, sort_order)
where not exists (select 1 from public.affiche_templates);
```

À l'exécution, l'assistant lit `templates.ts` pour transcrire les 7 lignes exactes (icônes et textes réels).

### 4. Realtime — SELON D3 (Option B uniquement)

Si D3 = Option B (Realtime), ajouter le bloc idempotent. Si D3 = Option A (`useQuery`), **ne pas** l'ajouter.

```sql
do $$
begin
  alter publication supabase_realtime add table public.affiche_templates;
exception
  when duplicate_object then null;
end
$$;
```

## Ordre d'exécution

1. Acter D1, D2, D3.
2. Rédiger `supabase/affiche_templates.sql` (table + trigger + RLS ; seed transcrit de `templates.ts` ; bloc realtime seulement si D3 = B).
3. Fournir le script à l'utilisateur, qui l'exécute dans Supabase → SQL Editor.
4. Vérifier (lecture seule) : la table existe, 7 lignes seedées, 4 policies présentes.

## Critère de validation

- Le script s'exécute sans erreur et est ré-exécutable (aucune erreur au second passage).
- `select count(*) from affiche_templates` renvoie 7 (si D2 = A).
- `select policyname, cmd from pg_policies where tablename = 'affiche_templates'` liste bien read (select) + insert/update/delete.
- Un compte `utilisateur` ne peut pas écrire (rejet RLS) ; un `super_utilisateur`/`admin` le peut. Vérification en lecture seule côté assistant (pas de write de test en prod).

## Contrôle /borg

Étape critique (CREATE TABLE, CREATE TRIGGER, RLS sur backend partagé). Audit post-exécution :
- La table est bien `public.affiche_templates` et n'entre en collision avec **aucune** table existante (`profiles`, `daily_reports`, `forecast_days`, `budget`, `email_recipients`, `hotel_config`, `audit_log`, `parking_reservations`).
- La fonction trigger est `affiche_set_updated_at` (dédiée), pas un écrasement de `parking_set_updated_at` ni d'une fonction existante.
- Les 4 policies sont `to authenticated` ; la condition d'écriture correspond exactement à D1 ; SELECT est `using (true)`.
- Aucune écriture n'a été tentée par l'assistant contre les tables existantes ; seule la nouvelle table a été créée / seedée, par l'utilisateur.
- Idempotence : un second passage du script ne duplique pas le seed (garde `where not exists`) ni ne plante sur la publication realtime.
