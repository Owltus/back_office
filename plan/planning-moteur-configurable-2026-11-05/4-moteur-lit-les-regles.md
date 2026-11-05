# Étape 4 ⚠ — Le moteur lit les règles

## Objectif

Le générateur, le vérificateur et l'affichage lisent `RegleEtablissement` au lieu des constantes. Une règle désactivée disparaît des deux côtés (calcul et alertes).

## Dépend de

Étapes 2 et 3.

## Fichier(s) impacté(s)

- `src/lib/planning/generateur.ts`, `verificateur.ts`, `moment.ts`, `presence.ts`, `semaine.ts`, `etoile.ts`, `cycles.ts`
- `src/components/planning/equipe/brouillon.ts` (`etoilePossible`)
- La règle étoile en SQL (migration `20261102100000`) : la même définition, lue depuis la base

## Travail à réaliser

1. `momentPropose(horaire, regles)` : limites en argument.
2. Contrats : `journeesDuCalcul`, `journeeEtoile`, `etoileSacrifiee` lisent le modèle de contrat.
3. Repos et rythme : deux repos de suite, jours d'affilée, jour isolé : dur, souple ou absent selon le réglage.
4. Passations, relève, équipe du soir, personne seule, arrivée à l'ouverture : actives ou non, durées lues.
5. Nuit : plafond au nombre de personnes réglé (défaut 1).
6. Motifs reconnus par leur nature, plus par leur code (B7).
7. Relire `coutExtra` face à la décision « jamais d'extra par le calcul ».
8. Chaque règle a un test accepté ET refusé, comme les règles existantes.

## Critère de validation

- Empreinte `generateur.test.ts` 8874c146 inchangée avec les défauts.
- Banc de décembre (copie locale, en mémoire, hors dépôt) : mêmes places, trous, heures.
- Une règle désactivée : le calcul ne la paie plus ET le vérificateur ne la signale plus.

## Contrôle /borg

Relecture adverse : chercher une constante d'établissement encore lue en direct ; une règle lue d'un côté (calcul) et pas de l'autre (vérificateur).
