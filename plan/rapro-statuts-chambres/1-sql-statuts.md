# Étape 1 — Script DB additif (CHECK + défaut)

## Objectif

Rendre les deux nouveaux statuts `bloque` et `faux_noshow` insérables dans
`rapro_rooms`, en élargissant la contrainte `CHECK` de la colonne `status`, sans
toucher les données existantes ni relancer le script de création de table. Le
script est fourni pour exécution par l'utilisateur.

## Contexte

La colonne de statut est définie dans `supabase/rapro_rooms.sql` (lignes 15-16) :

```sql
status text not null default 'non_nettoyee'
  check (status in ('nettoyee', 'non_nettoyee', 'refus', 'noshow')),
```

Ce fichier commence par `drop table if exists public.rapro_rooms cascade;` : le
rejouer en production DÉTRUIRAIT les données. On crée donc un script SÉPARÉ, sur
le modèle strict de `supabase/security_hardening_triggers.sql` (additif,
idempotent, aucune réécriture de ligne). Comme le nouveau jeu de valeurs est un
sur-ensemble de l'ancien, la validation de la contrainte ne rejette aucune ligne
existante : pas de migration de données. Le trigger `rapro_rooms_stamp`
n'affecte pas `status` — rien à modifier de ce côté.

Décision **D5 tranchée** : on ne touche PAS le DEFAULT SQL (il reste
`non_nettoyee`). Le défaut affiché `nettoyee` est géré côté application (D2 =
découplage). Le script ci-dessous se limite donc à l'élargissement du `CHECK`.

## Fichier(s) impacté(s)

- `supabase/rapro_rooms_add_statuses.sql` (nouveau)
- `supabase/rapro_rooms.sql` (référence seule — jamais rejoué)

## Travail à réaliser

### 1. Créer le script additif

```sql
-- =============================================================================
-- RAPRO — élargissement des statuts de chambre (bloque, faux_noshow)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. SÛR EN PRODUCTION.
--
-- Pourquoi ce fichier séparé : rapro_rooms.sql commence par `drop table …
-- cascade` (DDL de premier déploiement). Ce script-ci est additif, idempotent,
-- et NE MODIFIE AUCUNE LIGNE EXISTANTE. Le nouveau jeu de valeurs est un
-- sur-ensemble de l'ancien → aucune ligne actuelle ne viole la contrainte,
-- donc aucune migration de données.
-- =============================================================================

alter table public.rapro_rooms
  drop constraint if exists rapro_rooms_status_check;

alter table public.rapro_rooms
  add constraint rapro_rooms_status_check
  check (status in ('nettoyee', 'non_nettoyee', 'refus', 'noshow', 'bloque', 'faux_noshow'));
```

### 2. Vérifier le nom réel de la contrainte

Le nom `rapro_rooms_status_check` est celui généré par convention Postgres pour
un CHECK inline sur `status`, mais il doit être confirmé côté prod avant
exécution :

```sql
select conname from pg_constraint
where conrelid = 'public.rapro_rooms'::regclass and contype = 'c';
```

Si le nom diffère, adapter le `drop constraint if exists` en conséquence.

## Ordre d'exécution

1. Rédiger `supabase/rapro_rooms_add_statuses.sql` (CHECK seul, pas de DEFAULT).
2. L'utilisateur vérifie le nom de contrainte (requête `pg_constraint`).
3. L'utilisateur exécute le script dans Supabase → SQL Editor.
4. Contrôle : un `insert … status = 'bloque'` ne lève plus l'erreur de CHECK.

## Critère de validation

- Le script est idempotent (ré-exécutable sans erreur ni effet de bord).
- Après exécution, une écriture avec `status = 'bloque'` ou `'faux_noshow'` est
  acceptée ; toute autre valeur reste rejetée.
- Aucune ligne existante modifiée (vérifiable : `count(*)` et statuts inchangés).

## Contrôle /borg

Étape critique (ALTER de contrainte CHECK sur base partagée). Auditer :
- Le script ne contient AUCUN `drop table`, `truncate`, `update … where`,
  `delete` — uniquement `drop constraint if exists` + `add constraint`.
- Le nouveau `check` est bien un sur-ensemble de l'ancien (les 4 valeurs
  historiques sont toutes conservées) → pas de risque de rejet des lignes en base.
- Aucune modification du trigger `rapro_rooms_stamp` ni des colonnes estampillées
  serveur (`created_by`, `updated_at`).
- Le fichier `rapro_rooms.sql` d'origine n'est pas modifié.
