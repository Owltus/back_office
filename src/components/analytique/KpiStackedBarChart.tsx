import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartTooltip } from '#/components/analytique/ChartTooltip.tsx'
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_HEIGHT,
  CHART_MARGIN,
} from '#/components/analytique/chartConstants.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Histogramme empilé réutilisable (Recharts) — une barre par point sur l'axe X,
 * chaque barre découpée en segments EMPILÉS (proportionnels). Pendant « barres »
 * du KpiLineChart : même habillage thème (grille, axes, infobulle). PAS de légende
 * à l'écran (l'infobulle porte déjà la pastille de couleur) ; les items sont exposés
 * sur `data-legend` pour être reconstruits dans le PDF. Client-only (monté sous des
 * îlots `ssr: false`). Place dans le socle partagé `components/analytique/`.
 *
 * Les segments à `null` ne dessinent aucune tranche (ex. un mois/jour sans conso
 * saisie). Couleurs passées en clair par l'appelant (tokens `--chart-*`), lisibles
 * en light comme en dark.
 */

export interface KpiBarSegment {
  /** Clé du segment dans `data`. */
  key: string
  /** Libellé affiché (légende + infobulle). */
  name: string
  /** Couleur de remplissage (hex ou variable CSS). */
  color: string
}

interface KpiStackedBarChartProps {
  /** Titre affiché au-dessus du graphique. */
  title: string
  /** Données déjà mises en forme (une entrée par barre). */
  data: Array<Record<string, number | string | null>>
  /** Clé de l'axe X dans `data` (ex. 'mois' ou 'jour'). */
  xKey: string
  /** Segments empilés, du bas vers le haut. */
  segments: KpiBarSegment[]
  /** Formateur des graduations Y (ex. milliers « 12k »). */
  yTickFormatter?: (value: number) => string
  /** Formateur des valeurs dans l'infobulle. */
  tooltipFormatter: (value: number) => string
  /** Formateur du LIBELLÉ (en-tête) de l'infobulle. L'axe X reste abrégé, mais le
   * survol peut afficher le libellé complet (ex. « Fév » → « Février 2026 »). */
  labelFormatter?: (label: string) => string
  /** Ordre des items de légende (clés de segments) exposés au PDF via `data-legend`.
   * La légende n'est pas affichée à l'écran ; elle est reconstruite dans le document.
   * Sans cet ordre : ordre de `segments`. N'affecte pas l'empilement des barres. */
  legendOrder?: string[]
  /** Identifiant d'empilement Recharts (défaut 'stack'). Toutes les barres d'un même
   * graphe le partagent pour s'empiler. */
  stackId?: string
  /** Clic sur une barre/colonne → reçoit l'entrée de `data` correspondante (ex. pour
   * naviguer vers le détail). Le curseur passe en « pointer » quand fourni. */
  onBarClick?: (payload: Record<string, unknown>) => void
  /** Sous 640px, masque le titre et resserre la marge latérale de la carte pour
   * rendre le maximum de largeur au tracé — un écran de téléphone est trop
   * étroit pour se permettre le même confortable de marge que sur bureau.
   * Opt-in (défaut false) : ne change rien aux pages qui ne l'activent pas. */
  compactMobile?: boolean
}

export function KpiStackedBarChart({
  title,
  data,
  xKey,
  segments,
  yTickFormatter,
  tooltipFormatter,
  labelFormatter,
  legendOrder,
  stackId = 'stack',
  onBarClick,
  compactMobile = false,
}: KpiStackedBarChartProps) {
  // La légende n'est PAS affichée à l'écran (l'infobulle porte déjà les pastilles).
  // On expose ses items (nom + couleur token, dans l'ordre voulu) sur `data-legend`
  // pour que le générateur PDF la reconstruise (cf. lib/analytique/pdf.ts).
  const legendItems = legendOrder
    ? legendOrder
        .map((key) => segments.find((s) => s.key === key))
        .filter((s): s is KpiBarSegment => s != null)
    : segments
  const pdfLegend =
    legendItems.length > 0
      ? JSON.stringify(
          legendItems.map((s) => ({ name: s.name, color: s.color })),
        )
      : undefined
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4',
        compactMobile && 'max-sm:px-1',
      )}
      data-legend={pdfLegend}
    >
      <h3
        className={cn(
          'mb-3 text-sm font-medium text-muted-foreground',
          compactMobile && 'max-sm:hidden',
        )}
      >
        {title}
      </h3>
      <ResponsiveContainer
        width="100%"
        height={CHART_HEIGHT}
        className={onBarClick ? 'cursor-pointer' : undefined}
      >
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: CHART_AXIS }}
            stroke={CHART_GRID}
          />
          <YAxis
            tickFormatter={yTickFormatter}
            tick={{ fontSize: 11, fill: CHART_AXIS }}
            stroke={CHART_GRID}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted-foreground)', opacity: 0.12 }}
            content={
              <ChartTooltip
                labelFormatter={labelFormatter}
                valueFormatter={tooltipFormatter}
              />
            }
          />
          {segments.map((seg) => (
            <Bar
              key={seg.key}
              dataKey={seg.key}
              name={seg.name}
              stackId={stackId}
              fill={seg.color}
              onClick={
                onBarClick
                  ? (d: { payload?: Record<string, unknown> }) => {
                      if (d.payload) onBarClick(d.payload)
                    }
                  : undefined
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
