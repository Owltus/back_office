# Étape 8 — import-report : contrôles en observation d'abord

## Objectif

Lier chaque rapport à l'hôtel (Hotel Code 4401NACH) et borner ce qui entre. Tout ce qui pourrait refuser un vrai fichier commence en observation : le contrôle est seulement noté dans les journaux pendant 2 nuits.

## Contexte

Ne commencer qu'après un contrôle propre de la nuit du 18/11 (02:22-02:52), qui vérifie que le Worker e45fbffb a bien accepté les 4 e-mails du PMS.

Les 4 formats portent le bloc `Hotel Code,...` suivi de `4401NACH,...`. Les fixtures de test utilisent `9999DEMO`. Les exports manuels n'ont pas toujours ce bloc.

## Fichier(s) impacté(s)

- `supabase/functions/import-report/index.ts`, `pdj.ts`, `addon.ts`, `repjour.ts`
- tests Deno de ces fichiers

## Travail à réaliser

### 1. Hotel Code

Créer `hotelCodeOf(contenu)` (gère le BOM, le séparateur `,` ou `;`, et l'absence du bloc). Le comparer à `EXPECTED_HOTEL_CODE` :

- variable absente : pas de contrôle ;
- code absent du fichier : seulement noté dans les journaux ;
- code différent : noté dans les journaux tant que `HOTEL_CODE_ENFORCE` n'est pas `true`, refusé ensuite.

### 2. Nombre de pièces jointes

Plus de 4 CSV dans un e-mail : 422 avant tout import. Un vrai e-mail en a une seule.

### 3. Dates

- `pdj.ts` `serviceDateFromFilename` : n'accepter qu'une vraie date du calendrier.
- `repjour.ts` : même chose pour `REPORT DATE`.

### 4. Compteurs de l'Addon

`addon.ts:173-174` : nombre entier entre 0 et 1 000, recette finie et positive. Sinon, la ligne est sautée et notée dans les journaux.

### 5. Fraîcheur du Forecast

Lire `Generated Date/Time` dans l'en-tête et noter l'âge du fichier, sans refuser. Le fuseau de cette date n'est pas connu, d'où l'observation d'abord.

## Ordre d'exécution

1. Tests Deno (les cas qui doivent échouer aujourd'hui), puis code.
2. Essai de bout en bout en local : `scripts/import-essai.mjs` avec les fixtures `.eml`.
3. Avec l'accord de l'utilisateur, poser le secret `EXPECTED_HOTEL_CODE=4401NACH` en prod. Il faut `PROD_CONFIRME=1`.
4. Livraison en journée. Retour arrière : redéployer la version de l'étiquette `prod`.
5. Deux nuits : lire les journaux de `import-report` (code OK, âge du Forecast, lignes importées) et vérifier que l'e-mail du rapport est bien reçu.

## Critère de validation

- Deux nuits de suite : 4 imports réussis, « hotel code OK 4401NACH » à chaque fois, e-mail automatique reçu.

## Contrôle /borg

- Aucun refus possible d'un vrai fichier pendant l'observation.
- Le contrôle du secret en temps constant est inchangé.
