# Plan — Tooltips des cartes de synthèse (PDJ haut, RepJour bas)

## Contexte

Les cartes de synthèse (`StatTile`) de la page `/pdj` (rangée du haut) et de
la bande transverse en bas de `/repjour` (`DayCrossSummary`, blocs PDJ /
Parking / Rapprochement) n'ont aucune explication au survol. Le composant
`StatTile` (`src/components/shared/StatTile.tsx`) porte déjà une prop `hint`
optionnelle (tooltip au survol, `cursor-help`, `max-w-56 text-center`) et
l'exploite déjà sur les 4 cartes du HAUT de `/repjour` (`SummaryCards.tsx`) —
c'est le modèle de ton/format à reproduire, pas un nouveau mécanisme à
construire.

Décision utilisateur : traiter d'abord les 6 cartes du haut de `/pdj`, puis
les 12 cartes du bas de `/repjour` (3 blocs de 4), dans le même esprit.

## Angles à clarifier

- **D1 — Texte exact des 18 tooltips (proposition, à ajuster)** : les
  formulations ci-dessous (étapes 1 et 2) sont rédigées à partir des calculs
  réels du code (cf. rapports d'exploration), dans le ton déjà validé sur
  `SummaryCards.tsx` (1-2 phrases, définition puis clé de lecture optionnelle,
  vocabulaire métier, pas de jargon de code). Si un libellé ne convient pas
  une fois affiché, c'est un ajustement de texte simple, sans impact sur le
  reste du chantier.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-tooltips-pdj-haut.md](./1-tooltips-pdj-haut.md) | Tooltips des 6 cartes du haut de `/pdj` | — | P1 | 30 min | survol de chaque carte PDJ explicite | |
| 2 | [2-tooltips-repjour-bas.md](./2-tooltips-repjour-bas.md) | Tooltips des 12 cartes du bas de `/repjour` | — | P1 | 45 min | survol de chaque carte de la bande transverse explicite | |

## Ordre d'exécution

Les deux étapes sont indépendantes (fichiers distincts, aucune dépendance) —
exécutables dans l'ordre demandé par l'utilisateur (PDJ d'abord, RepJour
ensuite) ou en parallèle, sans différence de résultat.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|--------------------|--------------------|
| Composants (UI) | `components/pdj/BreakfastBoard.tsx`, `components/repjour/DayCrossSummary.tsx` | — |

| **Total** | **2 modifiés** | **0 nouveau** |
