import { Suspense, lazy } from 'react'

import type { GalaxyChartProps } from '#/components/facturation/GalaxyChart.render.tsx'

/*
 * Coquille de chargement différé de la galaxie.
 *
 * Pourquoi (audit de chargement du 2026-09-20) : `echarts` était importé
 * statiquement ici, ce qui le soudait au chunk de la route
 * `/facturation/galaxie` — 504 582 octets bruts, 168 469 compressés, soit 39 %
 * de la route la plus lourde du projet. La page entière attendait le moteur
 * graphique, fonds et panneaux compris.
 *
 * Le décor de la page (nébuleuses en fond, panneau latéral) s'affiche désormais
 * tout de suite ; seul le graphe arrive après. Le repli reste dans la même
 * teinte sombre que la page pour ne pas trouer le fond étoilé.
 *
 * ⚠ Ce module ne doit JAMAIS importer `echarts`, ni rien qui en dépende.
 */
const GalaxyChartRender = lazy(() =>
  import('#/components/facturation/GalaxyChart.render.tsx').then((m) => ({
    default: m.GalaxyChartRender,
  })),
)

export function GalaxyChart(props: GalaxyChartProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-slate-400">
          Chargement de la galaxie…
        </div>
      }
    >
      <GalaxyChartRender {...props} />
    </Suspense>
  )
}
