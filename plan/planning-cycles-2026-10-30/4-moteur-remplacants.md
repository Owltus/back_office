# Étape 4 — Le moteur joue avec les codes

## Objectif

Quand le code imposé ne peut pas être tenu, essayer les autres codes permis
du même cycle ; tenir le minimum par cycle plus fermement ; préférer un
chevauchement de relève.

## Dépend de

Étape 3.

## Fichiers

- `src/lib/planning/semaine.ts` (`preparerGeneration`, `traduire`)
- `src/lib/planning/generateur.ts`, `modele.ts`, `regles.ts`
- `src/lib/planning/verificateur.ts`

## Travail

### 1. Remplaçants

Pour chaque place d'un besoin à code (créneau `b…`), des créneaux candidats
`r…` : les autres codes permis du poste (`codesPermis`), de la même famille
(D12), rattachés à la MÊME place. Contrainte : la place est tenue par le code
imposé OU un remplaçant, jamais plus que l'effectif au total. Variables
seulement pour les personnes compatibles (rôle, fiche, code fixé, repos de
11 h, présence max), comme aujourd'hui.

### 2. Coûts, dans l'ordre de décision existant

- Remplaçant : coût par shift (D5), au-dessus du confort, sous les contrats
  et SOUS la part fixe d'un dépannage (D13) : titulaire code exact <
  titulaire remplaçant < dépannage code exact < dépannage remplaçant < place
  vide (`coutPlaceVide`). Un test de paliers fige cet ordre.
- Minimum par cycle : la variable de manque passe au niveau P1 (D7), dérivée
  comme `coutPlaceVide` ; nuit ajoutée (étape 2), comptée sur les postes qui
  ont des codes de nuit (D15). Le maximum reste en P2. Une adjointe ne compte
  que posée sur un poste compté (D14).
- Relève : bonus faible (P5) quand l'équipe qui arrive commence avant le
  départ de celle qui part, sur le même poste (D4).

### 3. Traduction

`traduire` rend un remplaçant comme un shift proposé sur la place, avec son
code réel et `remplace: true`.

### 4. Vérificateur

Recompte places et minimums par cycle sans le générateur ; oracle des tests.

## Phase de test /martin

- Personne ne peut faire M3 (repos de 11 h), quelqu'un peut faire M6 : M6 est
  posé, marqué remplaçant.
- M3 possible : M3 est posé, jamais un remplaçant.
- Aucun code du matin possible : la place reste vide (étape 5).
- Minimum du matin non tenu alors qu'une personne doit encore des heures sur
  un autre jour : le matin passe d'abord (paliers).
- Sans remplaçant possible ni minimum : même résultat qu'aujourd'hui sur les
  semaines de test.
- La coupure de 11 h n'est jamais choisie (D8).
- Ordre D13 : quatre semaines construites pour que chaque palier soit le
  seul possible, puis deux paliers possibles à la fois : le plus haut gagne.
- Aucun code ajouté : tout shift proposé a un code de `codesPermis`.

## Critère de validation

Tests de paliers à jour ; temps d'une semaine réelle ≤ 10 s (étape 8).

## Contrôle /borg

Une règle changée = `regles.ts` + `generateur.ts` + `verificateur.ts` + un
test accepté et refusé ; `coutPlaceVide` relu.
