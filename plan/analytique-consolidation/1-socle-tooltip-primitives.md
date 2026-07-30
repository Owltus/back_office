# Étape 1 — Socle : tooltip unifié + primitives cohérentes

## Objectif

Corriger l'asymétrie des infobulles (le point le plus visible pour l'utilisateur) en
extrayant un composant `ChartTooltip` commun aux deux graphes, et en donnant à
`KpiLineChart` un `labelFormatter` (comme l'a déjà `KpiStackedBarChart`). Au passage,
factoriser les constantes de graphe et corriger quelques détails internes du socle.

## Contexte

`KpiStackedBarChart.tsx:77-137` contient une infobulle personnalisée soignée (pastille
10×10, nom, valeur alignée `tabular-nums`, en-tête via `labelFormatter`, filtrage des
`null`). `KpiLineChart.tsx:101-112` utilise l'infobulle Recharts par défaut : pas de
`labelFormatter`, en-tête = valeur brute de l'axe X. Les deux doivent partager le même
rendu. Étape critique car elle touche des primitives utilisées par les 10 boards.

## Fichier(s) impacté(s)

- `src/components/analytique/ChartTooltip.tsx` (nouveau)
- `src/components/analytique/chartConstants.ts` (nouveau)
- `src/components/analytique/KpiLineChart.tsx`
- `src/components/analytique/KpiStackedBarChart.tsx`
- `src/components/analytique/AnalytiqueCards.tsx`
- `src/components/analytique/AnalytiqueSkeleton.tsx`

## Travail à réaliser

### 1. Extraire `ChartTooltip` (composant commun)

Sortir l'implémentation actuelle de `ChartTooltip` de `KpiStackedBarChart.tsx:77-137`
dans `src/components/analytique/ChartTooltip.tsx`, generique :

```tsx
export interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string | null; color?: string; fill?: string }>
  label?: string | number
  valueFormatter: (n: number) => string
  labelFormatter?: (label: string) => string
}
```

Comportement conservé à l'identique : garde `!active`, filtre des entrées `value == null`,
en-tête `labelFormatter(String(label))` sinon `String(label)`, conteneur theme-aware
(`var(--card)`/`var(--border)`/`var(--foreground)`, `minWidth:170`), lignes pastille +
nom + valeur alignée `tabular-nums`.

### 2. `KpiStackedBarChart` réutilise `ChartTooltip`

Remplacer le `ChartTooltip` local par l'import du composant commun. Aucun changement de
rendu attendu. Rendre `stackId` PARAMÉTRABLE (prop optionnelle `stackId = 'stack'`) au lieu
du `"pdj"` codé en dur (`KpiStackedBarChart.tsx:201`) — nommage trompeur puisqu'il sert
aussi rapro.

### 3. `KpiLineChart` : infobulle custom + `labelFormatter`

Ajouter la prop `labelFormatter?: (label: string) => string` à `KpiLineChartProps`.
Remplacer le `<Tooltip …>` par défaut (`KpiLineChart.tsx:101-112`) par
`<Tooltip content={<ChartTooltip valueFormatter={tooltipFormatter} labelFormatter={labelFormatter} />} cursor={…} />`.
Résultat : en-tête d'infobulle formatable (« Février 2026 » au lieu de « Fév ») et pastilles
maîtrisées, cohérent avec le bar chart.

### 4. `chartConstants.ts` : constantes de graphe partagées

Extraire les magic numbers dupliqués dans `KpiLineChart` et `KpiStackedBarChart` :

```ts
export const CHART_HEIGHT = 220
export const CHART_MARGIN = { top: 5, right: 0, left: -25, bottom: 0 }
```

Y déplacer aussi les couleurs axes/grille : le bar chart redéclare `AXIS`/`GRID`
(`KpiStackedBarChart.tsx:58-59`) au lieu de réutiliser `KPI_CHART_COLORS.axis/grid`
(`KpiLineChart.tsx:32-38`). Faire pointer les deux vers la même source.

### 5. `StatCard` : relayer `printHidden` et `className`

`AnalytiqueCards.tsx:39-71` : le wrapper masque `printHidden` et `className` de `StatTile`.
Les ajouter aux props relayées (utile pour l'impression et des accents ponctuels).

### 6. Grille de cartes/graphes : source unique de classes

Les chaînes de classes responsive existent en double entre `AnalytiqueCardsGrid`
(`AnalytiqueCards.tsx:28-32`) et `AnalytiqueSkeleton.tsx:40-45`, et entre `AnalytiqueCharts`
et le squelette. Extraire une petite fonction/const partagée (ex. `cardsGridClass(cols)`,
`chartsGridClass(cols)`) pour que le squelette ne dérive plus du vrai layout.

## Ordre d'exécution

1. `chartConstants.ts` puis `ChartTooltip.tsx`.
2. Rebrancher `KpiStackedBarChart` (import ChartTooltip + constantes + stackId param).
3. Enrichir `KpiLineChart` (labelFormatter + ChartTooltip + constantes).
4. `AnalytiqueCards` (StatCard props + classes partagées) et `AnalytiqueSkeleton`.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Les infobulles bar chart (pdj, rapro) rendent EXACTEMENT comme avant (non-régression).
- `KpiLineChart` accepte `labelFormatter` (utilisé à l'étape 4).
- Aucun `stackId="pdj"` ni magic number `220`/`{top:5…}` résiduel dans les 2 primitives.

## Contrôle /borg

Étape critique (primitives partagées par 10 boards) :
- Le `ChartTooltip` extrait est rigoureusement iso-comportement pour le bar chart (pastille,
  filtrage null, en-tête, alignement) — aucune régression visuelle.
- `KpiLineChart` : le passage à une infobulle custom ne casse pas les graphes multi-séries
  de repjour (réalisé/projeté/budget), ni la gestion `connectNulls={false}`.
- Aucune prop requise devenue manquante chez un consommateur (tous les appels aux 2 graphes
  compilent).
