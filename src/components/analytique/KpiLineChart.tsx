import { Suspense, lazy } from 'react'

import { Skeleton } from '#/components/ui/skeleton.tsx'
import { CHART_HEIGHT } from '#/components/analytique/chartConstants.ts'
import type { KpiLineChartProps } from '#/components/analytique/KpiLineChart.render.tsx'

/*
 * Coquille de chargement différé du graphique en courbes.
 *
 * Pourquoi (audit de chargement du 2026-09-20) : recharts pèse 345 540 octets
 * bruts, 100 765 compressés, et il était importé STATIQUEMENT par ce composant,
 * lui-même importé statiquement par les ONZE boards analytique (repjour, PDJ,
 * parking, rapro, caisse, en version annuelle et mensuelle). Le tableau de
 * chiffres attendait donc le téléchargement ET l'analyse du moteur graphique
 * pour s'afficher — alors qu'il n'en a aucun besoin.
 *
 * Le moteur arrive désormais après la page. Le repli occupe EXACTEMENT la place
 * du graphique final (même carte, même titre, même `CHART_HEIGHT`) : aucun saut
 * de mise en page quand il se substitue au squelette.
 *
 * ⚠ Ce module ne doit JAMAIS importer `recharts`, ni rien qui en dépende, sous
 * peine d'annuler tout le bénéfice. Le `.then()` de réécriture existe parce que
 * `React.lazy` attend un export par défaut et que le projet n'en utilise aucun.
 */
const KpiLineChartRender = lazy(() =>
  import('#/components/analytique/KpiLineChart.render.tsx').then((m) => ({
    default: m.KpiLineChartRender,
  })),
)

/** Carte vide de la taille exacte du graphique, le temps qu'il arrive. */
function ChartFallback({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h3>
      <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
    </div>
  )
}

export function KpiLineChart(props: KpiLineChartProps) {
  return (
    <Suspense fallback={<ChartFallback title={props.title} />}>
      <KpiLineChartRender {...props} />
    </Suspense>
  )
}
