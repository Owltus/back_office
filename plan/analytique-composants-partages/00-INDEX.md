# Plan — Composants partagés des pages analytique

## Contexte

Les 10 pages analytique (5 vues annuelles « parentes » + 5 détails mensuels
« enfants ») partagent aujourd'hui la MÊME structure, mais réécrite à la main dans
chaque board : le wrapper `PageContainer fillHeight` + colonne flex bornée, le
`PageHeader`, la branche de chargement, la grille de 4 cartes (`shrink-0`), le
tableau borné à défilement interne (`flex min-h-0 flex-1` + en-tête collant +
`no-scrollbar`), et la grille de graphiques (`shrink-0`). S'y ajoutent des motifs
répétés : la navigation d'année par flèches (`StepNav` + `useStepNavKeys`), le
bouton retour du détail mensuel, et le squelette de chargement.

Conséquence : chaque évolution de mise en page (hauteur, scroll, en-tête collant,
squelette, nav) doit être répétée dans 10 fichiers, avec un risque d'incohérence et
d'oubli. L'objectif est d'EXTRAIRE ces éléments dans un petit socle de composants
réutilisables, pour que les pages parentes et enfants s'appuient sur les mêmes
briques — une modification de layout se fait alors UNE fois, et la cohérence est
garantie par construction. Chantier purement front (aucune donnée, aucune
écriture) ; les spécificités métier de chaque tableau (colonnes, lignes cliquables,
liens jour, barres de budget, écarts colorés, total Rapro, export PDF) restent dans
les boards via des slots.

## Angles à clarifier

- **D1 — Niveau d'abstraction.** **Option A retenue (recommandée)** : un socle de
  composants « coquille + slots » (`AnalytiqueShell`, `AnalytiqueTable`,
  `AnalytiqueCardsGrid`/`StatCard`, `AnalytiqueCharts`, `YearNav`,
  `AnalytiqueSkeleton`), où la coquille possède le LAYOUT et chaque board fournit
  le CONTENU (cartes, thead/tbody, graphiques). Souplesse maximale, préserve
  toutes les spécificités par onglet. Option B : un unique board générique piloté
  par configuration (colonnes, métriques, graphes en objets). Rejetée : elle
  lutterait contre les spécificités (occupation parking, écarts caisse, budget
  repjour, lignes cliquables, liens jour) et deviendrait un god-component fragile.
- **D2 — Emplacement.** **Option A retenue (recommandée)** : un nouveau dossier
  `src/components/analytique/` pour le socle partagé ; les boards par onglet
  RESTENT dans leur dossier de feature (convention du projet) et importent le
  socle. Option B : déplacer aussi les boards — écarte la convention par feature,
  non retenu.
- **D3 — `KpiLineChart`.** **Option A retenue (recommandée)** : déplacer
  `components/repjour/charts/KpiLineChart.tsx` vers `components/analytique/`
  (il sert désormais les 5 onglets, plus seulement repjour) et mettre à jour les
  imports. Option B : le laisser sous repjour (couplage inter-feature qui persiste).
- **D4 — Plan squelette précédent.** Le plan `plan/squelette-chargement-analytique/`
  (non exécuté) est ABSORBÉ ici : `AnalytiqueSkeleton` devient un composant du
  socle. **Recommandation** : exécuter CE plan et considérer le plan squelette
  comme remplacé (à archiver/supprimer après accord).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-composants.md](./1-socle-composants.md) | Socle | — | P0 | 2h | Dossier `components/analytique/` : shell, table, cards, charts, skeleton, YearNav | ⚠ |
| 2 | [2-migration-vues-annuelles.md](./2-migration-vues-annuelles.md) | Parentes | 1 | P1 | 2h | 5 vues annuelles migrées sur le socle |  |
| 3 | [3-migration-details-mensuels.md](./3-migration-details-mensuels.md) | Enfants | 1 | P1 | 2h | 5 détails mensuels migrés + routes Rapro dé-doublées | ⚠ |
| 4 | [4-validation.md](./4-validation.md) | Validation | 1,2,3 | P1 | 1h | tsc + build + parcours visuel des 10 pages | ⚠ |

## Ordre d'exécution

- Étape 1 d'abord : créer le socle de composants (aucun board ne change encore).
- Étapes 2 et 3 ensuite : migrer les vues annuelles puis les détails mensuels sur
  le socle. Parallélisables entre elles une fois le socle figé (fichiers
  disjoints), mais l'étape 3 ajuste en plus les routes Rapro qui enveloppent
  actuellement un second `PageContainer` (à retirer puisque `AnalytiqueShell` le
  fournit).
- Étape 4 : validation automatisée + parcours visuel des 10 pages (aucune
  régression de layout, de nav, de liens ni de chargement).

## Architecture cible

```
src/components/
├── analytique/                      ← NOUVEAU socle partagé
│   ├── AnalytiqueShell.tsx          ← PageContainer fillHeight + colonne flex + PageHeader + loading
│   ├── AnalytiqueTable.tsx          ← conteneur borné + en-tête collant + no-scrollbar (slots head/body)
│   ├── AnalytiqueCards.tsx          ← AnalytiqueCardsGrid + StatCard (children libre pour barres budget)
│   ├── AnalytiqueCharts.tsx         ← grille shrink-0 des graphiques
│   ├── AnalytiqueSkeleton.tsx       ← reflet du layout (absorbe le plan squelette)
│   ├── YearNav.tsx                  ← StepNav année + useYearNav (bornes + clavier + Alt)
│   ├── AnalytiqueBackButton.tsx     ← bouton retour (détail mensuel)
│   └── KpiLineChart.tsx             ← DEPLACE depuis repjour/charts/
├── pdj/PdjAnalytiqueBoard.tsx       ← n'exprime plus que cartes + colonnes + graphes
├── pdj/PdjAnalytiqueMoisBoard.tsx
├── parking/… caisse/… rapro/… repjour/boards/…   (idem, allégés)
└── repjour/BoardSkeleton.tsx        ← conservé (dashboard, hors analytique)
```

Board type après migration (schéma) :

```tsx
<AnalytiqueShell title="Analytique" actions={<YearNav … />} loading={loading} skeleton={{ cols, charts }}>
  <AnalytiqueCardsGrid>{/* StatCard × 4, contenu propre au board */}</AnalytiqueCardsGrid>
  <AnalytiqueTable head={<tr …>…</tr>}>{/* tbody (+ tfoot) propre au board */}</AnalytiqueTable>
  <AnalytiqueCharts>{/* 1 ou 2 KpiLineChart */}</AnalytiqueCharts>
</AnalytiqueShell>
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Socle partagé | `repjour/charts/KpiLineChart.tsx` (déplacé) + imports repjour | `analytique/AnalytiqueShell.tsx`, `AnalytiqueTable.tsx`, `AnalytiqueCards.tsx`, `AnalytiqueCharts.tsx`, `AnalytiqueSkeleton.tsx`, `YearNav.tsx`, `AnalytiqueBackButton.tsx`, `analytique/KpiLineChart.tsx` |
| Vues annuelles | `pdj/PdjAnalytiqueBoard.tsx`, `parking/ParkingAnalytiqueBoard.tsx`, `caisse/CaisseAnalytiqueBoard.tsx`, `rapro/RaproAnalytiqueBoard.tsx`, `repjour/boards/AnalytiqueBoard.tsx` | — |
| Détails mensuels | `pdj/PdjAnalytiqueMoisBoard.tsx`, `parking/ParkingAnalytiqueMoisBoard.tsx`, `caisse/CaisseAnalytiqueMoisBoard.tsx`, `rapro/RaproMonthlyBoard.tsx`, `repjour/boards/AnalytiqueMoisBoard.tsx` | — |
| Routes | `routes/rapro/analytique.index.tsx`, `routes/rapro/analytique.$year.$month.tsx` (retrait du `PageContainer` en double) | — |
| **Total** | **~13 modifiés** | **~8 nouveaux** |
