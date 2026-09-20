# Étape 6 — Charger les moteurs graphiques après la page, pas avant

## Objectif

Retirer **101 Ko compressés** du premier rendu de onze pages analytique et
**168 Ko** de celui de la galaxie de facturation, sans rien changer à ce qui
s'affiche au final.

## Contexte

Mesures du build réel (`pnpm build`, tailles `gzip -9`, majorants : Vercel sert en
brotli, compter 15 à 20 % de moins) :

| Bibliothèque | Statut | Où | Poids |
|---|---|---|---|
| `echarts` | **statique** | `GalaxyChart.tsx:2-5` | 504 582 o bruts / 168 467 gzip |
| `recharts` | **statique** | `KpiLineChart.tsx:10`, `KpiStackedBarChart.tsx:10` | 345 540 o bruts / 100 746 gzip |

Le reste du projet est exemplaire sur ce point, et il faut le dire : `jspdf`,
`pdf-lib`, `pdfjs-dist`, `three`, `cannon-es` et `tesseract.js` sont **tous**
chargés par `import()` dynamique au moment de l'usage. Ces deux-là sont les
exceptions.

Le coût n'est pas le téléchargement — quelques dixièmes de seconde — mais le fait
qu'il soit **sur le chemin critique** : les deux composants de graphique sont
importés statiquement par les onze boards analytique (caisse, parking, pdj, rapro,
repjour, en version annuelle et mensuelle), donc le board entier attend que le
moteur graphique soit téléchargé **et analysé** avant d'afficher quoi que ce soit —
y compris ses cartes de chiffres, qui n'ont besoin d'aucun graphique.

Détail aggravant pour la galaxie : `/facturation/galaxie` est déjà la route la plus
lourde du projet (**428 677 o gzip**, 23 chunks), et echarts en représente 39 %.

## Fichier(s) impacté(s)

- `src/components/analytique/KpiLineChart.tsx` (modifié)
- `src/components/analytique/KpiStackedBarChart.tsx` (modifié)
- `src/components/facturation/GalaxyChart.tsx` (modifié)

## Travail à réaliser

### 1. recharts — les deux composants de l'analytique partagée

Le projet n'utilise **aucun `React.lazy` ni `Suspense` aujourd'hui** (vérifié sur
431 fichiers). Cette étape en introduit le premier usage : le faire proprement, et
de façon locale, sans toucher au socle.

Le plus simple et le plus sûr est de scinder chaque composant en deux : une coquille
qui garde le nom exporté actuel et gère le chargement, et le rendu réel dans un
module voisin qui, lui, importe recharts.

```tsx
// KpiLineChart.tsx — recharts pèse 101 Ko compressés et était importé
// statiquement par les onze boards analytique : le tableau de chiffres attendait
// le moteur graphique pour s'afficher. Le graphique arrive désormais après.
const KpiLineChartInner = lazy(() =>
  import('./KpiLineChart.inner.tsx').then((m) => ({ default: m.KpiLineChartInner })),
)

export function KpiLineChart(props: KpiLineChartProps) {
  return (
    <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
      <KpiLineChartInner {...props} />
    </Suspense>
  )
}
```

⚠ Le repli doit avoir **exactement la hauteur du graphique final**, sinon la page
sautera quand il arrivera. Relire la hauteur réelle dans le composant plutôt que
de la deviner.

⚠ Le projet impose des **exports nommés** et l'alias `#/` **avec extension
explicite**. `React.lazy` attend un module à export par défaut : d'où le
`.then()` de réécriture ci-dessus. Ne pas introduire d'`export default`.

### 2. echarts — la galaxie

Même traitement pour `GalaxyChart.tsx`. Ici le gain est double, parce que
l'étape 7 va de toute façon rouvrir ce composant : faire le découpage maintenant
prépare le terrain.

### 3. Ne pas généraliser

L'audit a montré que le découpage par route fonctionne bien et qu'aucune autre
bibliothèque lourde ne fuit dans le chunk d'entrée. **Ne pas ajouter de
`manualChunks` dans `vite.config.ts`** : regrouper les vendors à la main ferait
empirer les choses dans cette configuration. Le problème n'était pas le bundler.

## Ordre d'exécution

1. `KpiLineChart.tsx` + module interne.
2. `KpiStackedBarChart.tsx` + module interne.
3. `GalaxyChart.tsx` + module interne.
4. `npx tsc --noEmit`
5. `pnpm test`
6. `pnpm lint`
7. `pnpm build` — et **comparer les tailles de chunks** avec le relevé de
   l'étape 1.

## Critère de validation

- Le chunk contenant recharts (`ChartTooltip-*.js` aujourd'hui) **n'apparaît plus**
  dans la fermeture statique des routes analytique : il est chargé à la demande.
  Vérifiable dans l'onglet Réseau, en deux salves distinctes.
- Le chunk `galaxie-*.js` perd ~504 Ko bruts.
- À l'ouverture d'une page analytique : les cartes de chiffres s'affichent
  **avant** le graphique, et l'emplacement du graphique est occupé par un squelette
  de la bonne hauteur — aucun saut de mise en page.
- Les graphiques rendent exactement comme avant, tooltips compris.
- `pnpm build` : le total gzip de `/facturation/galaxie` passe sous 300 Ko.
