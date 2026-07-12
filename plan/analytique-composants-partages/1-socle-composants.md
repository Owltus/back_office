# Étape 1 — Socle de composants analytique partagés

## Objectif

Créer le dossier `src/components/analytique/` et y définir les composants
réutilisables qui portent le LAYOUT commun des pages analytique (coquille,
tableau borné, cartes, graphiques, squelette, navigation d'année, bouton retour),
ainsi que déplacer `KpiLineChart`. Aucun board n'est encore modifié.

## Contexte

Le layout des 10 boards est identique (voir contexte de l'index). On l'isole ici
pour que les migrations (étapes 2 et 3) se contentent de fournir le CONTENU. Les
classes exactes proviennent des boards actuels (déjà validés) : ne rien inventer,
recopier les motifs en place. Primitives utilisées : `PageContainer`
(`components/shared/`), `PageHeader` (`components/shared/`), `StepNav` +
`useStepNavKeys` (`components/shared/`), `Skeleton` (`components/ui/skeleton.tsx`),
`Tip`, `Button`, `.no-scrollbar` (styles.css). Exports nommés, alias `#/` avec
extension, simple quotes, pas de point-virgule.

## Fichier(s) impacté(s)

- `src/components/analytique/AnalytiqueShell.tsx` (nouveau)
- `src/components/analytique/AnalytiqueTable.tsx` (nouveau)
- `src/components/analytique/AnalytiqueCards.tsx` (nouveau)
- `src/components/analytique/AnalytiqueCharts.tsx` (nouveau)
- `src/components/analytique/AnalytiqueSkeleton.tsx` (nouveau)
- `src/components/analytique/YearNav.tsx` (nouveau)
- `src/components/analytique/AnalytiqueBackButton.tsx` (nouveau)
- `src/components/analytique/KpiLineChart.tsx` (déplacé depuis `repjour/charts/`)
- `src/components/repjour/boards/*` qui importaient `KpiLineChart` (mise à jour du chemin d'import uniquement)

## Travail à réaliser

### 1. `AnalytiqueShell` — coquille de page

Possède `PageContainer fillHeight` + colonne flex bornée + `PageHeader` + branche
de chargement.

```tsx
export function AnalytiqueShell({
  title,
  actions,
  loading = false,
  skeleton,
  children,
}: {
  title: ReactNode
  actions?: ReactNode
  loading?: boolean
  skeleton?: { cols?: number; charts?: number; rows?: number }
  children: ReactNode
}) {
  return (
    <PageContainer fillHeight>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader title={title} actions={actions} />
        {loading ? <AnalytiqueSkeleton {...skeleton} /> : children}
      </div>
    </PageContainer>
  )
}
```

### 2. `AnalytiqueTable` — tableau borné à défilement interne

Slots `head` (contenu du `thead`) et `children` (`tbody`, plus `tfoot` éventuel).

```tsx
export function AnalytiqueTable({
  head,
  children,
}: {
  head: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">{head}</thead>
          {children}
        </table>
      </div>
    </div>
  )
}
```

Le board passe `head={<tr className="border-b border-border bg-muted">…</tr>}` et
place son `<tbody>` (et son `<tfoot>` pour Rapro) en children.

### 3. `AnalytiqueCards` — grille + carte

```tsx
export function AnalytiqueCardsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  children,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {sub}
      </div>
      {children}
    </div>
  )
}
```

`children` permet aux cartes repjour de conserver leur barre de progression budget
(passée en composition), sans casser le gabarit commun.

### 4. `AnalytiqueCharts` — grille des graphiques

```tsx
export function AnalytiqueCharts({ children }: { children: ReactNode }) {
  return (
    <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
  )
}
```

### 5. `AnalytiqueSkeleton` — reflet du layout (absorbe le plan squelette)

Fragment de 3 blocs aux MÊMES classes que le contenu réel (cartes `shrink-0`,
tableau `flex min-h-0 flex-1` + en-tête + lignes, graphiques `shrink-0`),
`aria-hidden`. Props `{ cols = 5, charts = 2, rows = 10 }`. (Reprendre le contenu
détaillé prévu dans `plan/squelette-chargement-analytique/1-composant-squelette.md`.)

### 6. `YearNav` + `useYearNav` — navigation d'année

```tsx
export function useYearNav({
  year,
  setYear,
  years,
  currentYear,
}: {
  year: number
  setYear: (updater: (y: number) => number) => void
  years: number[]
  currentYear: number
}) {
  const minYear = years[0] ?? currentYear
  const maxYear = years[years.length - 1] ?? currentYear
  const prevDisabled = year <= minYear
  const nextDisabled = year >= maxYear
  const goPrev = () => {
    if (year > minYear) setYear((y) => y - 1)
  }
  const goNext = () => {
    if (year < maxYear) setYear((y) => y + 1)
  }
  useStepNavKeys({
    onPrev: goPrev,
    onNext: goNext,
    onToday: () => setYear(() => currentYear),
    prevDisabled,
    nextDisabled,
  })
  return { goPrev, goNext, prevDisabled, nextDisabled }
}

export function YearNav(props: {
  year: number
  setYear: (updater: (y: number) => number) => void
  years: number[]
  currentYear: number
}) {
  const { goPrev, goNext, prevDisabled, nextDisabled } = useYearNav(props)
  return (
    <StepNav
      onPrev={goPrev}
      onNext={goNext}
      prevLabel="Année précédente"
      nextLabel="Année suivante"
      prevDisabled={prevDisabled}
      nextDisabled={nextDisabled}
    >
      <span className="w-12 text-center text-sm font-medium tabular-nums">
        {props.year}
      </span>
    </StepNav>
  )
}
```

Note : adapter la signature de `setYear` au besoin (les boards utilisent le setter
`useState`, compatible avec la forme fonctionnelle).

### 7. `AnalytiqueBackButton` — retour du détail mensuel

```tsx
export function AnalytiqueBackButton() {
  const router = useRouter()
  return (
    <Tip label="Retour à l'analytique">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => router.history.back()}
        aria-label="Retour à l'analytique"
      >
        <ArrowLeft />
      </Button>
    </Tip>
  )
}
```

Le détail mensuel Rapro compose ce bouton AVEC son `PrintButton` (export PDF) dans
les `actions`.

### 8. Déplacer `KpiLineChart`

Déplacer `src/components/repjour/charts/KpiLineChart.tsx` vers
`src/components/analytique/KpiLineChart.tsx` (contenu inchangé, y compris la
généralisation `projKey`/`budgetKey`/`realName`… déjà en place). Mettre à jour les
imports côté repjour (`AnalytiqueBoard`, `AnalytiqueMoisBoard`, et tout autre
consommateur) vers le nouveau chemin. Les autres boards pointeront directement sur
le nouveau chemin en étapes 2 et 3.

## Ordre d'exécution

1. Créer les 7 composants du socle.
2. Déplacer `KpiLineChart` + corriger les imports repjour existants.

## Critère de validation

- `npx tsc --noEmit` sans erreur (le socle compile ; repjour pointe vers le
  nouveau `KpiLineChart`).
- Aucun board (hors mise à jour d'import `KpiLineChart`) n'est encore modifié.
- Les composants reprennent EXACTEMENT les classes de layout des boards actuels.

## Contrôle /borg

Étape critique (> 5 fichiers, socle structurant + déplacement de fichier). `/borg`
indisponible → audit manuel : vérifier qu'aucune classe de layout n'a dérivé par
rapport aux boards actuels (comparaison des motifs), et que le déplacement de
`KpiLineChart` n'a laissé aucun import orphelin (`repjour/charts/KpiLineChart`).
