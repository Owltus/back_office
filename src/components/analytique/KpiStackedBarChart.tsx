import { Suspense, lazy } from 'react'

import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'
import { CHART_HEIGHT } from '#/components/analytique/chartConstants.ts'
import type { KpiStackedBarChartProps } from '#/components/analytique/KpiStackedBarChart.render.tsx'

export type { KpiBarSegment } from '#/components/analytique/KpiStackedBarChart.render.tsx'

/*
 * Coquille de chargement différé du graphique en barres empilées.
 *
 * Même raison que `KpiLineChart.tsx` : recharts (100 765 octets compressés)
 * était sur le chemin critique des onze pages analytique. Voir l'en-tête de ce
 * fichier-là pour le détail.
 *
 * Le type `KpiBarSegment` est ré-exporté ici parce que plusieurs boards
 * l'importent depuis ce chemin (`PdjAnalytiqueBoard`, `RaproCatColumns`…) : un
 * type est effacé à la compilation, il ne tire donc aucun code.
 *
 * ⚠ Ce module ne doit JAMAIS importer `recharts`, ni rien qui en dépende.
 */
const KpiStackedBarChartRender = lazy(() =>
  import('#/components/analytique/KpiStackedBarChart.render.tsx').then((m) => ({
    default: m.KpiStackedBarChartRender,
  })),
)

/** Carte vide de la taille exacte du graphique, le temps qu'il arrive. */
function ChartFallback({
  title,
  compactMobile,
}: {
  title: string
  compactMobile?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4',
        compactMobile && 'max-sm:px-1',
      )}
    >
      <h3
        className={cn(
          'mb-3 text-sm font-medium text-muted-foreground',
          compactMobile && 'max-sm:hidden',
        )}
      >
        {title}
      </h3>
      <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
    </div>
  )
}

export function KpiStackedBarChart(props: KpiStackedBarChartProps) {
  return (
    <Suspense
      fallback={
        <ChartFallback
          title={props.title}
          compactMobile={props.compactMobile}
        />
      }
    >
      <KpiStackedBarChartRender {...props} />
    </Suspense>
  )
}
