# Étape 3 — Pool de l'accueil dans le générateur

## Objectif

Le générateur place exactement N personnes par moment de l'accueil, répartit seul entre Réception et Club et choisit l'horaire (D1-D7, D11).

## Dépend de

1 (D8, D10).

## Fichier(s) impacté(s)

- `src/lib/planning/semaine.ts` : `preparerGeneration` l.1430-1663, `correspondances` l.708-788, `trousEntreEquipes` l.1459-1526, `analyser` l.1319-1336
- `src/lib/planning/generateur.ts` : `construire` l.665-760, `compatible` l.418-420, `coutConsigne` l.275, `pireCoutRemplir` l.296, `coutManqueMinimum` l.358, réduction l.805-873, `generer` l.1742
- `src/lib/planning/presence.ts` l.67 (`periodePresence`), `src/lib/planning/modele.ts` l.41 (`Creneau.presence` → liste), `src/lib/planning/cycles.ts` l.15-17, l.108

## Travail à réaliser

1. Créneaux candidats `p<jour>-<poste>-<horaire>` pour les postes de l'accueil (D12), à la place des `b…` de ces postes (D13 : besoins ignorés).
2. `Creneau.presence` devient une liste ; un middle compte `['matin', 'soir']` (D11).
3. Contrainte par moment : Σ = N avec manque (P1) et surplus (palier selon D8).
4. Soutien compté (D5), accompagné par poste et par moment (soutien ≤ autonomes du même poste qui chevauchent).
5. Extras placés en dernier (D7) : nouveau palier au-dessus du dépannage, exclusion `placementManuel` levée pour le pool seulement.
6. Trous sur l'accueil entier (D15).
7. Plus de remplaçants `r…` ni de second temps pour l'accueil ; réduction étendue aux candidats.
8. En-tête de `generateur.ts` réécrit (ordre de décision).

## Phase de test /martin

Propriétés : le compte du moment = N quand c'est possible ; jamais un soutien seul ; un middle compte deux fois ; ordre titulaire < dépannage < extra < vide par paliers ; temps de calcul mesuré sur 8 semaines réelles (budget à fixer : au plus 3 s par semaine).

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run src/lib/planning` verts.
- Tests de paliers (`ordreDecision.test.ts`) mis à jour, chaque nouvelle règle testée acceptée ET refusée.

## Contrôle /borg

Pas de règle HCR affaiblie (`regles.ts`), « un shift par jour » toujours garant d'un seul poste, postes à part inchangés (même texte LP sans accueil).
