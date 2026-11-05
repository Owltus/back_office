# Étape 2 ⚠ — Un seul objet « règles de l'établissement »

## Objectif

Réunir en UN endroit toutes les règles de l'hôtel aujourd'hui éparpillées en constantes, sans rien changer au calcul.

## Dépend de

Étape 1 (D1, D8, D9).

## Faits établis

- Les règles d'établissement vivent dans regles.ts:36-141, moment.ts:33, presence.ts:63 et 224-268, generateur.ts:1347 (un seul veilleur), 1738 (deux repos de suite), 387 (passation), semaine.ts:217 (`POSTE_ID_ACCUEIL`), semaine.ts:397 (codes de motifs).
- `Referentiel.reglages` est optionnel ; beaucoup de tests n'en ont pas.

## Fichier(s) impacté(s)

- `src/lib/planning/reglesEtablissement.ts` (nouveau)
- `src/lib/planning/types.ts`
- `src/lib/planning/regles.ts` (ne garde que la LOI)

## Travail à réaliser

1. Type `RegleEtablissement` : contrats (journées permises par contrat, journée étoile), repos et rythme (deux repos de suite : obligatoire ou souhaité ; jours d'affilée conseillés ; jour isolé), passations (relève en minutes, passation avec le veilleur : oui ou non, obligation ou préférence selon D8), moments (limites en minutes), accueil (personnes la nuit, apprenti seul selon D9), retour de congé, école.
2. `REGLES_PAR_DEFAUT` = les valeurs d'aujourd'hui, chiffre pour chiffre.
3. `lireRegles(referentiel)` : la SEULE fonction qui fabrique l'objet, avec repli sur les défauts.
4. Règles déduites, écrites en fonctions pures : jours d'un contrat = heures ÷ journées ; passation active seulement s'il existe un poste de nuit.
5. Corriger l'écart de la relève (30 / 0) et des limites de moments (21 h / 22 h) selon B4, B5.

## Critère de validation

- `npx vitest run src/lib/planning` : tout vert, empreinte `generateur.test.ts` inchangée.
- Aucune constante d'établissement n'est encore lue ailleurs que par `REGLES_PAR_DEFAUT` (vérifié par recherche).

## Contrôle /borg

Comparer chaque défaut à la constante qu'il remplace, une par une.
