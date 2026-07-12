# Étape 2 — Migration des vues annuelles (parentes)

## Objectif

Réécrire les 5 vues annuelles pour qu'elles s'appuient sur le socle
(`AnalytiqueShell`, `AnalytiqueCardsGrid`/`StatCard`, `AnalytiqueTable`,
`AnalytiqueCharts`, `YearNav`, `KpiLineChart` déplacé), en ne conservant dans
chaque board que la logique de données et le CONTENU (cartes, colonnes/lignes,
graphes). Comportement inchangé.

## Contexte

Chaque vue annuelle contient aujourd'hui, en dur : le wrapper flex borné, le
`PageHeader` avec la nav d'année, la branche `loading` (`BoardSkeleton`), la grille
de cartes, le tableau borné (en-tête collant + `no-scrollbar`) et la grille de
graphes. Tout cela est désormais fourni par le socle. À PRÉSERVER : lignes
cliquables vers le détail du mois (`navigate` vers `…/$year/$month`), coloration
des écarts (repjour, caisse), opacité des mois futurs, `tfoot` Total (Rapro),
formats et libellés.

## Fichier(s) impacté(s)

- `src/components/pdj/PdjAnalytiqueBoard.tsx`
- `src/components/parking/ParkingAnalytiqueBoard.tsx`
- `src/components/caisse/CaisseAnalytiqueBoard.tsx`
- `src/components/rapro/RaproAnalytiqueBoard.tsx`
- `src/components/repjour/boards/AnalytiqueBoard.tsx`

## Travail à réaliser

### 1. Remplacer la coquille par `AnalytiqueShell`

Pour chaque board, remplacer `PageContainer` + wrapper flex + `PageHeader` +
branche `loading` par :

```tsx
return (
  <AnalytiqueShell
    title="Analytique"
    actions={<YearNav year={year} setYear={setYear} years={years} currentYear={currentYear} />}
    loading={loading}
    skeleton={{ cols: <n>, charts: 2 }}
  >
    {/* cartes + tableau + graphes */}
  </AnalytiqueShell>
)
```

Retirer les imports/logique désormais internalisés : `PageContainer`, `PageHeader`,
`BoardSkeleton`, `StepNav`, `useStepNavKeys`, et le bloc `useYearNav` local (bornes
+ `goPrev`/`goNext` + `useStepNavKeys`) — remplacé par `<YearNav />`. Conserver
`year`/`setYear`/`years`/`currentYear` et l'effet de recalage d'année existant.

### 2. Cartes via `AnalytiqueCardsGrid` + `StatCard`

Remplacer la grille de cartes manuelle par `<AnalytiqueCardsGrid>` contenant des
`<StatCard label value sub? >`. Pour repjour, passer la barre de progression budget
en `children` du `StatCard`.

### 3. Tableau via `AnalytiqueTable`

```tsx
<AnalytiqueTable
  head={
    <tr className="border-b border-border bg-muted">
      {/* mêmes <th> qu'aujourd'hui */}
    </tr>
  }
>
  <tbody>{/* mêmes lignes, y compris onClick de navigation vers le mois */}</tbody>
  {/* <tfoot> pour Rapro uniquement */}
</AnalytiqueTable>
```

### 4. Graphiques via `AnalytiqueCharts`

Envelopper les `KpiLineChart` existants dans `<AnalytiqueCharts>` ; importer
`KpiLineChart` depuis `#/components/analytique/KpiLineChart.tsx`.

### 5. Imports

Tous les composants du socle depuis `#/components/analytique/…`. Supprimer les
imports devenus inutiles.

## Ordre d'exécution

1. PDJ (pilote), vérifier le rendu.
2. Parking, Caisse, Rapro, repjour.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm lint`.
- Les 5 vues annuelles rendent le même résultat qu'avant (cartes, tableau borné +
  scroll + en-tête collant, nav d'année par flèches + clavier + Alt, clic sur un
  mois → détail).
- Plus aucun `PageContainer`/`PageHeader`/`BoardSkeleton`/`StepNav` en dur dans ces
  boards ; layout entièrement fourni par le socle.
