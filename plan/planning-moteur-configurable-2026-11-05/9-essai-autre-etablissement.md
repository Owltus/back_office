# Étape 9 ⚠ — Essai sur un autre établissement

## Objectif

Prouver que le moteur marche pour un établissement qui n'est pas l'hôtel, et que l'hôtel n'a pas bougé.

## Dépend de

Étapes 4 à 8.

## Travail à réaliser

1. Banc de l'hôtel (copie locale, en mémoire, hors dépôt, supprimé après) : 18 semaines de l'été et décembre, avant et après le chantier, sur plusieurs graines. Attendu : identique.
2. Second établissement FICTIF dans les tests (`lib/planning/test/`) : par exemple un hôtel sans nuit, contrats de 35 h en 5 × 7 h, un seul repos de suite souhaité. Attendu : 0 infraction, règles réglées respectées, aucune règle de l'hôtel appliquée.
3. Recherche finale : aucune constante d'établissement lue hors de `REGLES_PAR_DEFAUT`.
4. CLAUDE.md et PRD mis à jour.

## Critère de validation

- `npx vitest run src/lib/planning src/components/planning` vert, pgTAP vert.
- Tableau avant → après dans le bilan de l'index.

## Contrôle /borg

Audit global : loi jamais réglable, droits de la nouvelle table, défauts identiques, aucune donnée réelle dans le dépôt.
