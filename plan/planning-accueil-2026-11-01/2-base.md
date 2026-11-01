# Étape 2 — Chiffre exact en base

## Objectif

Une case du tableau de l'accueil = une ligne `planning_consignes` avec `minimum = maximum` (D14).

## Dépend de

1 (D9).

## Fichier(s) impacté(s)

- nouvelle migration `supabase/migrations/2026110110000_planning_accueil_exact.sql`
- `supabase/tests/05_planning.test.sql` l.286-311 (7 assertions consignes, `plan(60)`)
- `supabase/seed/generer.ts` l.2442 (`PL_BESOINS`), l.2665-2683 (postes)

## Travail à réaliser

1. `UPDATE public.planning_consignes` : aligner `maximum` et `minimum` sur le chiffre retenu (D9). Écriture de contenu : livraison avec `--avec-donnees`, accord explicite.
2. `ALTER TABLE … ADD CONSTRAINT planning_consignes_exact CHECK (maximum = minimum)` (après l'alignement, donc validée).
3. Seed : `presence = true` sur Réception et Club, quelques consignes exactes, besoins Réception et Club retirés de `PL_BESOINS`.
4. pgTAP : `(5,'matin',3,4)` refusé (23514), `(5,'matin',3,3)` accepté, `maximum` null refusé.

## Phase de test /martin

Matrice min = max / min ≠ max / null en transaction annulée ; RLS des quatre opérations inchangée.

## Critère de validation

- `supabase migration up --local` passe ; `supabase test db` vert.
- Aucune ligne `minimum <> maximum` en local.

## Contrôle /borg

Contrainte validée, RLS et grants inchangés, `planning_consignes_unique` intact, aucune autre table touchée.
