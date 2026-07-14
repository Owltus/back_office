# Étape 1 — Script SQL : colonne `qualifier`

## Objectif

Ajouter à `rapro_rooms` une 2ᵉ colonne `qualifier text` nullable (avec sa propre
contrainte CHECK) pour porter les sur-statuts, sans toucher la clé unique, le
trigger ni les lignes existantes. Retirer le script `rapro_rooms_add_statuses.sql`
devenu incompatible (il ajoutait `faux_noshow` dans `status`).

## Contexte

`supabase/rapro_rooms.sql` (référence, jamais rejouée) définit :
`status text not null default 'non_nettoyee' check (status in ('nettoyee',
'non_nettoyee', 'refus', 'noshow'))`, clé `unique (report_date, room)`, trigger
`rapro_rooms_stamp` (estampille `updated_at` + `created_by`). Le style maison est
« colonne text + `check (x in (...))` » (aucun `text[]`/jsonb de flags ailleurs).

Décision **D1** : colonne `qualifier` nullable. `NULL` = pas de sur-statut. Le
`status` (base) garde ses 4 valeurs d'origine — `faux_noshow` n'y entre plus,
donc **le CHECK de `status` reste inchangé** (pas besoin de l'élargir). Le script
`rapro_rooms_add_statuses.sql` (en attente, a priori NON exécuté) est abandonné.

## Fichier(s) impacté(s)

- `supabase/rapro_rooms_qualifier.sql` (nouveau)
- `supabase/rapro_rooms_add_statuses.sql` (supprimé)
- `supabase/rapro_rooms.sql` (référence seule — jamais rejouée)

## Travail à réaliser

### 1. Créer le script additif

```sql
-- =============================================================================
-- RAPRO — sur-statuts : colonne `qualifier` (dimension orthogonale au `status`)
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. SÛR EN PRODUCTION.
-- Additif, idempotent, NE MODIFIE AUCUNE LIGNE (qualifier NULL par défaut).
-- =============================================================================

alter table public.rapro_rooms
  add column if not exists qualifier text;   -- NULL = aucun sur-statut

alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_qualifier_check;
alter table public.rapro_rooms
  add constraint rapro_rooms_qualifier_check
  check (qualifier is null
         or qualifier in ('faux_noshow', 'depart_anticipe', 'delogement'));
```

### 2. Reclassement conditionnel (seulement si `add_statuses.sql` a été joué)

À n'exécuter QUE si des lignes `status = 'faux_noshow'` existent déjà en base
(sinon sauter). Reclasse le statut plat vers base + qualificatif AVANT tout
resserrement du CHECK de `status` :

```sql
-- update public.rapro_rooms
--   set status = 'nettoyee', qualifier = 'faux_noshow'
--   where status = 'faux_noshow';
```

### 3. Retirer le script obsolète

Supprimer `supabase/rapro_rooms_add_statuses.sql` (remplacé). S'il a déjà été
exécuté, le CHECK de `status` autorise encore `faux_noshow` — inoffensif tant
qu'aucune ligne ne l'utilise (après reclassement §2). Optionnellement, un script
peut le resserrer aux 4 valeurs de base, mais ce n'est pas requis.

## Ordre d'exécution

1. Acter D1 (colonne qualifier) et D5 (valeurs initiales du CHECK qualifier).
2. Rédiger `supabase/rapro_rooms_qualifier.sql`.
3. Supprimer `supabase/rapro_rooms_add_statuses.sql`.
4. L'utilisateur exécute le nouveau script (et le §2 seulement si nécessaire).
5. Contrôle : un upsert `{report_date, room, status:'nettoyee', qualifier:'faux_noshow'}`
   passe ; `qualifier:'xxx'` inconnu est rejeté.

## Critère de validation

- La colonne `qualifier` existe, nullable, avec CHECK `null | 'faux_noshow'`.
- Toutes les lignes existantes ont `qualifier = null` (aucune migration).
- Clé unique `(report_date, room)` et trigger inchangés.
- Script idempotent (ré-exécutable sans erreur).

## Contrôle /borg

Étape critique (schéma d'une table applicative + suppression d'un script).
Auditer :
- Le script ne contient AUCUN `drop table`/`truncate`/`delete` ; uniquement
  `add column if not exists` + swap de contrainte + éventuel `update` §2 borné par
  `where status = 'faux_noshow'`.
- Le CHECK de `status` n'est pas cassé ; le nouveau CHECK `qualifier` est bien
  `qualifier is null or qualifier in (...)` (autorise NULL).
- Aucune modification du trigger `rapro_rooms_stamp` ni des colonnes serveur
  (`created_by`, `updated_at`).
- Cohérence D6 : on ne joue pas à la fois `add_statuses.sql` ET le script
  qualifier (faux_noshow ne doit exister que dans UNE dimension).
