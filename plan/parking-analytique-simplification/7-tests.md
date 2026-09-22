# Étape 7 — Tests métier réalignés

## Objectif

Remettre la suite de tests en accord avec le nouveau dénominateur et avec la
disparition de l'indicateur d'impayés, sans affaiblir la couverture du captage
qui, lui, reste en service.

## Contexte

Trois fichiers de test portent sur les notions touchées, et l'un d'eux contient
le test emblématique du chantier.

`src/lib/parking/analytics.test.ts` couvre les trois fonctions. Ses assertions
d'occupation sont écrites en dur avec le dénominateur 12 :
`toBeCloseTo((9 / (12 * 31)) * 100)` ligne 71-72 pour le mensuel,
`occupancy: (3 / 12) * 100` ligne 102-105 pour le journalier. La ligne 111-112
est la plus parlante : `expect(days[2].occupancy).toBeCloseTo((13 / 12) * 100)`
avec le commentaire « Places tampon prises → occupation > 100 % ». Ce test ne
devient pas faux par accident — il affirmait exactement la règle que le
chantier renverse. Il doit être réécrit en `(13 / 14) * 100`, soit 92,9 %, et
son commentaire doit dire la nouvelle règle : treize places prises sur
quatorze, le taux reste sous 100 %.

`src/lib/parking/analytics.property.test.ts` est entièrement consacré à
`captageIndex` (bornes dans [0, 100] ou null, monotonie croissante, mille
tirages chacun). Puisque le captage disparaît du code à l'étape 5 (angle D1,
option B), **ce fichier est supprimé**. C'est une perte de couverture assumée :
il ne testait qu'une fonction qui n'existe plus.

`src/lib/shared/analytics-month-guard.test.ts` construit un
`ParkingArrivalsRow` littéral (lignes 102-110) pour vérifier que
`aggregateParkingMonthly` échoue franchement sur un mois malformé. Comme
`ParkingArrivalsRow` conserve ses champs (étape 2), cette fixture reste valide
telle quelle. Vérifier tout de même qu'elle compile : un objet littéral typé
n'accepte pas de propriété surnuméraire.

## Fichier(s) impacté(s)

- `src/lib/parking/analytics.test.ts` (modifié)
- `src/lib/shared/analytics-month-guard.test.ts` (vérifié, modifié si nécessaire)
- `src/lib/parking/analytics.property.test.ts` (supprimé)

## Travail à réaliser

### 1. Réaligner les attendus d'occupation

Dans `analytics.test.ts` :

- lignes 71-72 — `(9 / (12 * 31)) * 100` devient `(9 / (14 * 31)) * 100`.
- lignes 102-105 — `occupancy: (3 / 12) * 100` devient `(3 / 14) * 100`.
  Attention : cette assertion est un `toEqual` sur l'objet entier ; les champs
  `occupiedClient` et `occupiedFree` y figurent et doivent rester, puisque
  l'étape 2 ne les supprime pas.
- lignes 107-110 — le jour vide, à vérifier plutôt qu'à modifier.

### 2. Réécrire le test emblématique

Lignes 111-112 :

```ts
// Treize places prises sur quatorze : le taux reste sous 100 %. Depuis le
// passage au denominateur de 14 places, il ne peut plus le depasser.
expect(days[2].occupancy).toBeCloseTo((13 / 14) * 100)
```

Envisager d'ajouter un cas à 14 places occupées, qui doit donner exactement
100 % : c'est la borne que le chantier vient poser, elle mérite un test.

### 3. Retirer les assertions d'impayés

Lignes 68 et voisines — `expect(aug.unpaid).toBe(1)` et toute assertion
portant sur `ParkingMonthStats.unpaid`. Les **fixtures** d'entrée
(`ParkingArrivalsRow` avec `unpaid: 1`, lignes 55-58 et 80-82) restent : elles
décrivent la ligne SQL, qui porte toujours la colonne.

Retirer aussi les assertions sur `clientNights` (ligne 65) et le bloc
`describe('captageIndex')` (lignes 21-50) ainsi que l'en-tête de documentation
qui le précède (lignes 14-19) : la fonction n'existe plus. Dans les `toEqual`
de `aggregateParkingDaily`, retirer le champ `occupiedClient` des objets
attendus.

### 4. Vérifier le garde-fou partagé

Lancer `analytics-month-guard.test.ts` et vérifier qu'il passe sans
modification. S'il échoue à la compilation sur une propriété surnuméraire,
c'est que l'étape 2 a retiré un champ de trop du type `ParkingArrivalsRow` :
corriger l'étape 2, pas le test.

## Ordre d'exécution

1. Réaligner les trois attendus d'occupation dans `analytics.test.ts`.
2. Réécrire le test des treize places et ajouter le cas à quatorze.
3. Retirer les assertions portant sur `unpaid`.
4. Supprimer `analytics.property.test.ts`.
5. `pnpm test` — la suite complète doit être verte.
6. `npx tsc --noEmit`.
7. Commit.

## Critère de validation

- `pnpm test` : suite complète au vert, aucun test ignoré ni commenté.
- `grep -n "12 \* 31\|/ 12" src/lib/parking/analytics.test.ts` ne renvoie plus
  aucune assertion d'occupation.
- Un test affirme qu'à quatorze places occupées le taux vaut exactement 100 %.
- `analytics.property.test.ts` n'existe plus, et aucun import ne le référence.
- `grep -rn "captageIndex" src/` ne renvoie plus rien du tout.
- Le nombre total de tests n'a pas diminué de plus que les assertions d'impayés
  retirées — le compte avant et après est connu et expliqué.
