# Étape 6 — Analytique et graphiques Recharts (lecture)

## Objectif

Porter les vues analytiques (annuelle et mensuelle jour par jour) avec leurs quatre graphiques Recharts, en lecture seule, montés côté client. Compléter `services/daily.ts` avec les fonctions d'agrégation analytique.

## Contexte

Deux pages source utilisent Recharts : `AnalytiquePage` (CA par mois, TO par mois) et `AnalytiqueMoisPage` (CA par jour, TO par jour). Les quatre graphiques sont des `LineChart` à trois courbes (réalisé plein, projeté gris, budget pointillé). Recharts est ajouté à l'étape 1. Avec `ssr: false` sur l'îlot (D1=A), le risque de crash SSR disparaît ; en repli (D1=B), les graphiques seraient montés derrière une garde client.

## Fichier(s) impacté(s)

- `src/routes/repjour/analytique.index.tsx` (nouveau — vue annuelle)
- `src/routes/repjour/analytique.$year.$month.tsx` (nouveau — vue mensuelle, params `:year/:month`)
- `src/components/repjour/boards/AnalytiqueBoard.tsx`, `AnalytiqueMoisBoard.tsx` (nouveaux)
- `src/components/repjour/charts/KpiLineChart.tsx` (nouveau — composant graphique réutilisable)
- `src/lib/repjour/services/daily.ts` (modification : `fetchYearAnalytics`, `fetchYearBudget`, `fetchBudgetYears`)
- `src/routeTree.gen.ts` (régénéré)
- Sources fork : `src/pages/AnalytiquePage.tsx`, `src/pages/AnalytiqueMoisPage.tsx`

## Travail à réaliser

### 1. Services analytiques

Compléter `services/daily.ts` avec `fetchYearAnalytics` (agrège `daily_reports` + `forecast_days` par mois avec priorité réalisé complet → projeté → forecast → vide), `fetchYearBudget`, `fetchBudgetYears`. Lecture seule.

### 2. Graphique réutilisable

`charts/KpiLineChart.tsx` : `LineChart` (`ResponsiveContainer`, `CartesianGrid`, `XAxis`/`YAxis`, `Tooltip`, `Legend`, trois `Line`). Adapter les couleurs en dur au dark (grille `#f0f0f0` → gris foncé, tooltip stylé sur fond `card`, courbes lisibles sur navy — D15). Reporter la règle `.recharts-wrapper *:focus { outline:none }` (étape 3). Paramétrer par les données et les formateurs (`fmt.eurInt`, `fmt.pct`).

### 3. Boards analytiques

`AnalytiqueBoard` (tableau mensuel + 2 graphiques ; clic sur une ligne mois → `navigate` vers `analytique/$year/$month` via navigation typée TanStack) et `AnalytiqueMoisBoard` (tableau jour par jour + 2 graphiques ; retour via `router.history.back()`). Gating : tous rôles en lecture (l'import forecast drag-drop admin de la source est reporté à l'étape 7).

### 4. Câblage des routes

`analytique.index.tsx` et `analytique.$year.$month.tsx`, chacune enveloppée par `ProtectedRoute` (tous rôles), `Route.useParams()` pour year/month.

## Ordre d'exécution

1. Services analytiques.
2. `KpiLineChart`.
3. Boards + routes.
4. Régénérer le routeTree, typecheck, test visuel.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm build` passe (pas de crash SSR sur recharts).
- Les vues annuelle et mensuelle affichent les données réelles ; navigation mois ↔ détail fonctionnelle.
- Graphiques lisibles en dark navy (courbes, grille, tooltip, légende).
- Aucune écriture atteignable depuis ces vues.
