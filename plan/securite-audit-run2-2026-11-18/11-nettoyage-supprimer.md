# Étape 11 — Retirer les entrées inutilisées

## Objectif

Réduire la surface de l'API : retirer des fonctions que plus aucun écran n'appelle, et la table `classeur_acces`, qui n'est plus lue depuis le 16/11.

## Fichier(s) impacté(s)

- `supabase/migrations/20261118170000_retrait_entrees_inutilisees.sql` (nouveau, `--supprimer`)
- `supabase/tests/05_planning.test.sql:266,272` (appel à 2 arguments)
- `supabase/tests/04_classeur_acces.test.sql`
- `supabase/seed/generer.ts` (puis régénérer `seed.sql`)
- `src/lib/classeur/test/simulateurSupabase.ts`
- CLAUDE.md

## Travail à réaliser

- `drop function` des deux côtés, public et private :
  - `planning_valider(date,bigint,integer,boolean)` ;
  - `planning_supprimer_horaire(bigint)` ;
  - `facturation_budget_line_delete` ;
  - `facturation_budget_line_upsert` ;
  - `facturation_ref_reimport_replace`.
- `drop table public.classeur_acces`, puis la colonne `classeur_classeurs.acces_tous` et son trigger.

## Critère de validation

- `pnpm test:db` est vert.
- `verif_classeur_acces.sql` est OK.
- À la livraison, `--supprimer` est utilisé avec l'accord explicite de l'utilisateur.

## Contrôle /borg

- Aucun appel restant dans `src/` (grep) aux fonctions retirées.
