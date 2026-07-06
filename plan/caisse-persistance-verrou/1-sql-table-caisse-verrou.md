# Étape 1 — SQL : table `caisse_sheets` + RLS à verrou temporel + trigger

## Objectif

Créer la table applicative `caisse_sheets` (une ligne = un couple `report_date` + `shift`) portant tous les montants de la feuille de caisse (attendus StayNTouch + Lightspeed, réels CAISSE), le comptage du fond de caisse, les commentaires, et les colonnes de **validation / verrouillage**. Poser une RLS où l'écriture est réservée à `super_utilisateur` / `admin`, et où l'`UPDATE` d'une feuille **validée** est **refusé** aux non-admins passé une **fenêtre de grâce** (D1 = 3 h). Le script est **exécuté par l'utilisateur** dans Supabase → SQL Editor.

## Contexte

Réplique du patron `supabase/{parking_realtime,affiche_templates,pdj_breakfasts}.sql`. Nouveauté : la policy `UPDATE` porte une **condition temporelle** — aucun précédent dans le repo, mais `now()`, `interval` et `get_user_role()` (déjà déployée) suffisent. `created_by` et `validated_by` utilisent `default auth.uid()` / sont posés côté serveur plutôt que de faire confiance au client. Fonction trigger **dédiée** `caisse_set_updated_at` (ne pas écraser `parking_set_updated_at` / `affiche_set_updated_at` / `pdj_set_updated_at`). Colonnes de coupures selon D4 (15 colonnes dédiées). Le total du fond de caisse et les écarts ne sont **pas stockés** (dérivés en Étape 2).

## Fichier(s) impacté(s)

- `supabase/caisse_sheets.sql` (nouveau)

## Travail à réaliser

### 1. Table + index + trigger

```sql
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées.
create table if not exists public.caisse_sheets (
  id                uuid primary key default gen_random_uuid(),
  report_date       date not null,                              -- date de la feuille
  shift             text not null check (shift in ('matin','soir','nuit')),
  operator_initials text not null default '',                   -- ex. "cbs"

  -- STAY N' TOUCH (réception) — montants attendus
  snt_cash   numeric(10,2) not null default 0,
  snt_cb     numeric(10,2) not null default 0,                  -- CB sauf AX
  snt_ax     numeric(10,2) not null default 0,
  snt_cheq   numeric(10,2) not null default 0,
  snt_cvac   numeric(10,2) not null default 0,
  snt_cbweb  numeric(10,2) not null default 0,                  -- CB WEB (toutes) — soir

  -- LIGHTSPEED (club) — montants attendus
  ls_cash    numeric(10,2) not null default 0,
  ls_cb      numeric(10,2) not null default 0,
  ls_ax      numeric(10,2) not null default 0,
  ls_cheq    numeric(10,2) not null default 0,
  ls_cvac    numeric(10,2) not null default 0,

  -- CAISSE — montants réels comptés
  caisse_cash   numeric(10,2) not null default 0,
  caisse_cb     numeric(10,2) not null default 0,
  caisse_ax     numeric(10,2) not null default 0,
  caisse_cheq   numeric(10,2) not null default 0,
  caisse_cvac   numeric(10,2) not null default 0,
  caisse_adyen  numeric(10,2) not null default 0,               -- ADYEN — soir

  -- Comptage du fond de caisse (nombre de coupures/pièces) — D4
  cnt_500 smallint not null default 0,
  cnt_200 smallint not null default 0,
  cnt_100 smallint not null default 0,
  cnt_50  smallint not null default 0,
  cnt_20  smallint not null default 0,
  cnt_10  smallint not null default 0,
  cnt_5   smallint not null default 0,
  cnt_2   smallint not null default 0,
  cnt_1   smallint not null default 0,
  cnt_050 smallint not null default 0,                          -- 0,50 €
  cnt_020 smallint not null default 0,                          -- 0,20 €
  cnt_010 smallint not null default 0,                          -- 0,10 €
  cnt_005 smallint not null default 0,                          -- 0,05 €
  cnt_002 smallint not null default 0,                          -- 0,02 €
  cnt_001 smallint not null default 0,                          -- 0,01 €

  fund_origin numeric(10,2) not null default 150,               -- fond d'origine (150 €)
  comment     text not null default '',

  -- Validation / verrouillage
  status           text not null default 'draft' check (status in ('draft','validated')),
  validated_at     timestamptz,                                 -- horodatage de validation
  validated_by     uuid,                                        -- signature (auteur)
  countersigned_by uuid,                                        -- contre-signature (optionnel, D5)

  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (report_date, shift)                                   -- clé d'upsert (D9)
);

create index if not exists caisse_sheets_report_date_idx
  on public.caisse_sheets (report_date desc);

create or replace function public.caisse_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists caisse_sheets_set_updated_at on public.caisse_sheets;
create trigger caisse_sheets_set_updated_at
  before update on public.caisse_sheets
  for each row execute function public.caisse_set_updated_at();
```

### 2. RLS — lecture ouverte, écriture super/admin, verrou temporel sur UPDATE

```sql
alter table public.caisse_sheets enable row level security;

-- SELECT : tous les authentifiés
drop policy if exists "caisse read (authenticated)" on public.caisse_sheets;
create policy "caisse read (authenticated)"
  on public.caisse_sheets for select to authenticated using (true);

-- INSERT : super/admin
drop policy if exists "caisse insert (super/admin)" on public.caisse_sheets;
create policy "caisse insert (super/admin)"
  on public.caisse_sheets for insert to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

-- UPDATE : super/admin ET (admin OU pas encore validé OU dans la fenêtre de grâce)
-- La fenêtre de grâce est de 3 h (D1). L'admin n'est jamais bloqué.
drop policy if exists "caisse update (role + verrou)" on public.caisse_sheets;
create policy "caisse update (role + verrou)"
  on public.caisse_sheets for update to authenticated
  using (
    get_user_role() in ('super_utilisateur', 'admin')
    and (
      get_user_role() = 'admin'
      or validated_at is null
      or now() < validated_at + interval '3 hours'
    )
  )
  with check (
    get_user_role() in ('super_utilisateur', 'admin')
    and (
      get_user_role() = 'admin'
      or validated_at is null
      or now() < validated_at + interval '3 hours'
    )
  );

-- DELETE : admin seulement (pièce comptable) — D7
drop policy if exists "caisse delete (admin)" on public.caisse_sheets;
create policy "caisse delete (admin)"
  on public.caisse_sheets for delete to authenticated
  using (get_user_role() = 'admin');
```

Note sur la sémantique du verrou : la clause `using` de l'`UPDATE` est évaluée sur la ligne **existante**. Au moment où un `super_utilisateur` valide (pose `validated_at = now()`), l'ancienne ligne a encore `validated_at is null` → l'UPDATE est autorisé. Les corrections ultérieures passent tant que `now() < validated_at + 3h`. Passé ce délai, seul l'admin peut encore modifier (édition ou remise en brouillon = déverrouillage). Un `upsert` avec `onConflict:'report_date,shift'` déclenche insert OU update → les deux policies couvrent bien super/admin.

## Ordre d'exécution

1. Acter D1 (durée de grâce), D4 (colonnes coupures), D5 (contre-signature), D9 (clé).
2. Rédiger `supabase/caisse_sheets.sql` (table + trigger + RLS).
3. L'utilisateur exécute le script dans Supabase → SQL Editor.
4. Vérifier (lecture seule) : table créée, 4 policies, contrainte unique, condition temporelle présente dans la policy UPDATE.

## Critère de validation

- Script ré-exécutable sans erreur (second passage OK, grâce à `if not exists` / `drop policy if exists` / `create or replace`).
- `unique (report_date, shift)` présent (prérequis de l'`onConflict`).
- `created_by` et `validated_by` ne dépendent pas d'une valeur fournie par le client pour l'identité (`default auth.uid()` sur `created_by`).
- `select policyname, cmd, qual from pg_policies where tablename = 'caisse_sheets'` : la policy UPDATE contient bien `get_user_role() = 'admin' OR validated_at IS NULL OR now() < validated_at + '03:00:00'::interval` ; SELECT `using (true)`.
- Fonction trigger nommée `caisse_set_updated_at` (aucune collision avec les triggers des autres features).

## Contrôle /borg

Étape critique (CREATE TABLE, CREATE TRIGGER, RLS avec logique de verrou sur backend partagé). Audit post-exécution :
- Table `public.caisse_sheets` sans collision avec les tables existantes (`profiles`, `daily_reports`, `forecast_days`, `budget`, `email_recipients`, `hotel_config`, `audit_log`, `parking_reservations`, `affiche_templates`, `pdj_breakfasts`).
- Fonction trigger dédiée `caisse_set_updated_at` (n'écrase aucune fonction existante).
- Les 4 policies sont `to authenticated` ; SELECT `using (true)` ; INSERT/UPDATE/DELETE conditionnées par `get_user_role()`.
- La policy UPDATE bloque bien un `super_utilisateur` sur une feuille validée hors fenêtre, et laisse passer l'`admin` en toute circonstance : vérifier `using` ET `with check` identiques (sinon un UPDATE partiel pourrait passer la lecture mais échouer l'écriture, ou l'inverse).
- Le littéral de fenêtre (`interval '3 hours'`) correspond bien à la valeur actée en D1 et à la constante UI `GRACE_HOURS` de l'Étape 2.
- Aucune écriture sur les tables partagées ; seule la nouvelle table est créée, par l'utilisateur.
