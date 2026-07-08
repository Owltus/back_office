# Étape 1 — Table jour `rapro_sheets` + RLS (Supabase)

## Objectif

Créer la table applicative qui persiste, **par jour**, l'état de clôture (`draft` / `validated`) et le commentaire du rapprochement, avec les politiques RLS (lecture pour tout authentifié, écriture réservée `super_utilisateur` / `admin`) et un trigger `updated_at`. **Pas de fenêtre de grâce** : la réouverture reste permise à tout moment pour super/admin. Le script est **exécuté par l'utilisateur** dans Supabase → SQL Editor.

## Contexte

Patron répliqué : `supabase/caisse_sheets.sql`, mais **simplifié** — on écarte volontairement le verrou temporel de grâce (`now() < validated_at + interval '24 hours'`), la colonne `operator_initials` et `countersigned_by`. `rapro_rooms` reste inchangée (par chambre) ; `rapro_sheets` porte l'état de jour.

La fonction trigger `public.rapro_set_updated_at()` existe déjà (déployée avec `rapro_rooms`) ; on la (re)crée en `create or replace` pour que ce script reste **autonome** même exécuté seul. `get_user_role()` est supposée déjà déployée (partagée avec caisse/pdj) — ne pas la recréer.

Suppose D1 = Option A (table jour) et D3 = Option A (garder `validated_at` / `validated_by`).

## Fichier(s) impacté(s)

- `supabase/rapro_sheets.sql` (nouveau)

## Travail à réaliser

### 1. Table + trigger + RLS (script complet)

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées.
--
-- Clôture + commentaire du rapprochement, AU NIVEAU JOUR (rapro_rooms est par
-- (jour, chambre), donc pas de porteur naturel pour un état de jour). Une ligne
-- = un jour. PAS de fenêtre de grâce : réouverture libre par super/admin.

create table if not exists public.rapro_sheets (
  id           uuid primary key default gen_random_uuid(),
  report_date  date not null unique,           -- une ligne par jour (clé d'upsert)
  status       text not null default 'draft'
                 check (status in ('draft', 'validated')),
  comment      text not null default '',
  validated_at timestamptz,
  validated_by uuid,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Fonction trigger générique (déjà déployée avec rapro_rooms ; idempotente).
create or replace function public.rapro_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rapro_sheets_set_updated_at on public.rapro_sheets;
create trigger rapro_sheets_set_updated_at
  before update on public.rapro_sheets
  for each row execute function public.rapro_set_updated_at();

-- RLS : lecture pour tout authentifié, écriture réservée super_utilisateur/admin.
alter table public.rapro_sheets enable row level security;

drop policy if exists "rapro_sheets read (authenticated)" on public.rapro_sheets;
create policy "rapro_sheets read (authenticated)"
  on public.rapro_sheets for select
  to authenticated using (true);

drop policy if exists "rapro_sheets insert (super/admin)" on public.rapro_sheets;
create policy "rapro_sheets insert (super/admin)"
  on public.rapro_sheets for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

-- PAS de verrou temporel : super/admin peuvent réouvrir à tout moment.
drop policy if exists "rapro_sheets update (super/admin)" on public.rapro_sheets;
create policy "rapro_sheets update (super/admin)"
  on public.rapro_sheets for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

drop policy if exists "rapro_sheets delete (super/admin)" on public.rapro_sheets;
create policy "rapro_sheets delete (super/admin)"
  on public.rapro_sheets for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));
```

## Ordre d'exécution

1. Acter D1 (table jour) et D3 (garder `validated_at`/`validated_by`).
2. Rédiger `supabase/rapro_sheets.sql` (script complet, idempotent).
3. **L'utilisateur** exécute le script dans Supabase → SQL Editor.
4. Vérifier en LECTURE SEULE que la table et les policies existent (voir critères).

## Critère de validation

- Le script est **ré-exécutable** sans erreur (tous les `if not exists` / `drop … if exists` en place).
- `select * from public.rapro_sheets limit 1;` fonctionne (table vide au départ).
- `select policyname from pg_policies where tablename = 'rapro_sheets';` renvoie les 4 policies attendues.
- Aucune policy `update` ne contient de condition temporelle (`interval`, `validated_at + …`) : la réouverture est libre pour super/admin.
- Aucune écriture n'a touché une table partagée (`profiles`, `daily_reports`, `hotel_config`, …).

## Contrôle /borg

Étape critique (DDL + RLS sur Supabase partagé, exécutée par l'utilisateur). Auditer après exécution :

- Table `rapro_sheets` **nouvelle**, aucun renommage/écrasement ; nom de trigger `rapro_sheets_set_updated_at` sans collision ; fonction `rapro_set_updated_at` réutilisée (pas un doublon divergent).
- Les 4 policies sont `to authenticated`, écriture gardée par `get_user_role() in ('super_utilisateur','admin')`, lecture `using (true)`.
- **Absence volontaire** de verrou de grâce dans la policy `update` (conforme à la demande « réouvrable à tout moment »).
- `get_user_role()` **non redéfinie** par ce script ; aucune DDL/policy n'affecte les tables repjour partagées.
- `report_date` porte bien une contrainte `unique` (clé d'upsert de la feuille jour).
