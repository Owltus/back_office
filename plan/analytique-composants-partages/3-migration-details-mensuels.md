# Étape 3 — Migration des détails mensuels (enfants)

## Objectif

Réécrire les 5 détails mensuels sur le socle (`AnalytiqueShell`,
`AnalytiqueCardsGrid`/`StatCard`, `AnalytiqueTable`, `AnalytiqueCharts`,
`AnalytiqueBackButton`, `KpiLineChart` déplacé), et retirer le `PageContainer` en
double des routes Rapro (la coquille le fournit désormais). Comportement inchangé.

## Contexte

Comme les vues annuelles, les détails mensuels réécrivent le layout à la main. À
PRÉSERVER : bouton retour (via `AnalytiqueBackButton`), export PDF ELIOR du détail
Rapro (composé À CÔTÉ du bouton retour dans `actions`), liens jour (cellule « Jour »
= `<Link to="/<onglet>" search={{ date }}>`), tableau plein mois (tous les jours,
tirets grisés), coloration des écarts (caisse), et le nombre de graphiques (1 pour
Rapro, 2 ailleurs). Le détail mensuel Rapro n'a pas de branche `loading` : l'ajouter
via `isPending` du `useQuery`.

Particularité routes : `routes/rapro/analytique.$year.$month.tsx` (et
potentiellement `analytique.index.tsx`) enveloppent le board dans un `PageContainer`.
Puisque `AnalytiqueShell` fournit `PageContainer fillHeight`, retirer ce wrapper de
la route pour éviter un double conteneur (les autres onglets incluent déjà le
conteneur dans le board, pas dans la route).

## Fichier(s) impacté(s)

- `src/components/pdj/PdjAnalytiqueMoisBoard.tsx`
- `src/components/parking/ParkingAnalytiqueMoisBoard.tsx`
- `src/components/caisse/CaisseAnalytiqueMoisBoard.tsx`
- `src/components/rapro/RaproMonthlyBoard.tsx`
- `src/components/repjour/boards/AnalytiqueMoisBoard.tsx`
- `src/routes/rapro/analytique.index.tsx` (retrait du `PageContainer` en double)
- `src/routes/rapro/analytique.$year.$month.tsx` (retrait du `PageContainer` en double)

## Travail à réaliser

### 1. Remplacer la coquille par `AnalytiqueShell`

```tsx
return (
  <AnalytiqueShell
    title={`${monthLabel} ${year}`}
    actions={<AnalytiqueBackButton />}
    loading={loading}
    skeleton={{ cols: <n>, charts: <1 ou 2> }}
  >
    {/* cartes + tableau + graphes */}
  </AnalytiqueShell>
)
```

- Retirer `PageContainer`, `PageHeader`, `Tip`+`Button`+`ArrowLeft` du retour (le
  bouton retour vient de `AnalytiqueBackButton`), `BoardSkeleton`.
- Détail Rapro : `actions={<><AnalytiqueBackButton /><PrintButton onClick={exportPdf} disabled={busy} /></>}` ;
  ajouter `const { data, isPending: loading } = useQuery(...)` et la branche
  `loading`.

### 2. Cartes / Tableau / Graphiques

Idem étape 2 : `AnalytiqueCardsGrid` + `StatCard`, `AnalytiqueTable` (slots
head/body, tableau plein mois conservé, liens jour conservés dans la cellule Jour),
`AnalytiqueCharts` autour des `KpiLineChart` (`KpiLineChart` importé depuis
`#/components/analytique/`). Le détail Rapro ne met qu'UN `KpiLineChart` dans
`AnalytiqueCharts`.

### 3. Routes Rapro — retirer le `PageContainer` en double

Dans les deux routes Rapro analytique, remplacer
`<ProtectedRoute><PageContainer><RaproXxx /></PageContainer></ProtectedRoute>` par
`<ProtectedRoute><RaproXxx /></ProtectedRoute>` (le board fournit désormais la
coquille via `AnalytiqueShell`). Supprimer l'import `PageContainer` devenu inutile.

## Ordre d'exécution

1. PDJ, Parking, Caisse, repjour (déjà branchés loading).
2. Rapro (board + ajout branche loading + composition retour/PDF).
3. Routes Rapro (retrait du double `PageContainer`).

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm lint`.
- Les 5 détails mensuels rendent le même résultat qu'avant (bouton retour, PDF
  Rapro, tableau plein mois + scroll + en-tête collant, liens jour, écarts colorés,
  1/2 graphes), avec squelette de chargement (y compris Rapro désormais).
- Pas de double `PageContainer` sur les routes Rapro (une seule coquille).

## Contrôle /borg

Étape critique (> 5 fichiers, touche routes + boards). `/borg` indisponible → audit
manuel : vérifier l'absence de double conteneur Rapro (hauteur/scroll corrects), que
l'export PDF ELIOR et les liens jour fonctionnent toujours, et qu'aucune régression
de layout n'apparaît sur les 5 détails.
