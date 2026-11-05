# Étape 3 ⚠ — Ranger les règles en base

## Objectif

Stocker les règles de l'établissement, avec des défauts qui reproduisent l'hôtel. Ajouts seulement.

## Dépend de

Étape 2.

## Faits établis

- `planning_reglages` : une ligne (id 1), update réservé à la gestion (niveau 3). Une colonne ajoutée hérite de ce droit.
- `semaine_type` : seul `mode` est contrôlé par `private.planning_semaine_type_ok`.
- `service.ts` liste ses colonnes une par une : une colonne oubliée n'est jamais lue.

## Fichier(s) impacté(s)

- `supabase/migrations/<date>_planning_regles_etablissement.sql` (nouveau)
- `supabase/tests/05_planning.test.sql` (`plan(83)` à relever)
- `supabase/seed/generer.ts`
- `src/lib/planning/service.ts`

## Travail à réaliser

1. Colonnes de `planning_reglages` (`ALTER TABLE … ADD COLUMN … DEFAULT …`) : repos, rythme, passations, limites des moments, personnes la nuit.
2. Table `planning_modeles_contrat` (une ligne par type de contrat, clé `type_contrat`) : journées permises, étoile, placement manuel, droit au férié rattrapé. RLS : lecture niveau 1, écriture niveau 3, `planning_stamp`, `log_row_change`. Lignes insérées par la migration (accord `--avec-donnees` à la livraison).
3. `planning_semaine_type_ok` : accepter `duree_minutes` (60 à 780) si le jour est Travaille ou Libre (étape 6).
4. pgTAP : lecture OK, écriture niveau 2 refusée (0 ligne), gestion OK, checks en 23514.
5. `fetchReferentiel` et `enregistrerReglages` lisent et écrivent les nouvelles colonnes.

## Critère de validation

- `pnpm db:reset` (accord de l'utilisateur) puis pgTAP vert.
- Base locale : la page Planning affiche exactement le même planning qu'avant.

## Contrôle /borg

RLS de la nouvelle table, aucun `drop` ni `rename`, défauts identiques aux constantes.
