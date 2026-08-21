# Étape 5 — Messages de clôture : remplacer `FUND_TARGET` fixe par le fond effectif

## Objectif

Corriger les endroits où l'écran référence encore la constante fixe `FUND_TARGET` (150 €) en dur dans un message affiché à l'utilisateur, alors que le fond attendu du jour peut désormais être différent (150 + cautions actives).

## Contexte

Relevé par l'exploration frontend : `src/components/caisse/CaisseBoard.tsx` référence `FUND_TARGET` littéralement à plusieurs endroits qui devraient utiliser la valeur EFFECTIVE du jour affiché (le fond effectif (`effectiveFundTarget(...)`, Étape 2), déjà recalculée à l'Étape 3) :
- Les messages de `closeIssues` (verdict de clôture) mentionnant le montant attendu du fond.
- Le sous-texte de la carte fond de caisse (« Fond de caisse 150 € »).
- `okReason` du `CloseSheetDialog` (verdict positif de clôture).

Sans ce correctif, un jour avec une caution active de 300 € afficherait encore « Fond de caisse 150 € » à l'écran alors que la cible réelle est 450 € — source de confusion exactement inverse à l'objectif du chantier.

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseBoard.tsx`

## Travail à réaliser

### 1. Localiser chaque référence à `FUND_TARGET` dans le JSX/logique d'affichage (pas dans `calc.ts`/`constants.ts`, qui restent la source de vérité du plancher) et les remplacer par le fond effectif (`effectiveFundTarget(...)`, Étape 2) (ou la valeur effective calculée à l'Étape 3 si le formulaire n'est pas encore hydraté).

### 2. Vérifier le format des messages : un message qui disait « Le fond n'a pas été compté. Il devrait être à 150 € » doit maintenant dire « Il devrait être à {fmtEurInt(effectiveTarget)} » — la présence d'une caution active devient lisible dans le message lui-même, pas seulement dans un chiffre isolé. Envisager d'ajouter, quand `effectiveTarget > FUND_TARGET`, une précision courte du type « (150 € + {n} caution(s) active(s)) » pour que l'hôtelier comprenne immédiatement l'écart sans avoir à consulter la liste des cautions.

## Ordre d'exécution

1. Grep `FUND_TARGET` dans `CaisseBoard.tsx` pour lister exhaustivement les occurrences à l'écran (hors import/calc).
2. Remplacer chacune, en vérifiant le texte résultant à l'écran (pas seulement le typecheck).

## Critère de validation

- Avec une caution active de 300 €, tous les messages visibles (carte fond, dialogue de clôture, sous-texte) affichent 450 €, jamais 150 €.
- Sans caution active, le comportement est strictement identique à aujourd'hui (150 € partout).
- `npx tsc --noEmit`
