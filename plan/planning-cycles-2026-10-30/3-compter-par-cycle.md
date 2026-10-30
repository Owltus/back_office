# Étape 3 — Un shift posé compte pour le besoin de son cycle

## Objectif

Ne plus chercher quelqu'un pour un M3 quand un M6 est déjà posé sur le même
poste le même jour.

## Dépend de

Étape 1.

## Fichiers

- `src/lib/planning/cycles.ts` (nouveau) : `cycleDe(horaire | shift)`, une
  seule source (famille du code ; sans code, heure de début, comme
  `presence.ts`)
- `src/lib/planning/semaine.ts` (`correspondances`)
- tests de `semaine.ts`

## Travail

1. `correspondances` en deux passes : (a) comme aujourd'hui, code exact ;
   (b) les shifts encore libres sont rattachés aux places encore libres du
   MÊME poste, du MÊME jour et du MÊME cycle (D6). Épinglés d'abord, comme
   aujourd'hui ; un soutien ne prend qu'une place de soutien.
2. Le rattachement par cycle est marqué (`remplace: true`) pour l'affichage
   (« M6 au lieu de M3 », étape 7).
3. Un code « à part » (sans famille : direction, supervision) ne se rattache
   que par code exact.
4. Minimum par cycle : un middle ne compte dans aucun cycle (D11). Le court
   compte selon son heure de début, comme aujourd'hui.

## Phase de test /martin

Propriétés : un shift n'est rattaché qu'une fois ; une place n'a jamais plus
de shifts que son effectif ; le code exact gagne toujours sur le voisin ; sans
shift posé, résultat identique à aujourd'hui.

## Critère de validation

Les tests existants restent verts ; cas « M6 posé, besoin M3 » : aucune
place à pourvoir, aucun doublon proposé.
