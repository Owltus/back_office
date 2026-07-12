import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/*
 * Graphique KPI réutilisable (Recharts) — jusqu'à trois courbes : réalisé (plein),
 * projeté/forecast (gris) et budget (pointillé). Les courbes projetée et budget
 * sont optionnelles (1 à 3 séries selon l'onglet). Utilisé par TOUTES les pages
 * analytique (repjour, PDJ, Parking, Caisse, Rapro), d'où sa place dans le socle
 * partagé `components/analytique/`.
 *
 * Client-only : monté uniquement sous des îlots `ssr: false`, aucun risque SSR.
 *
 * Couleurs adaptées au thème DARK navy via les tokens shadcn `--chart-*` et de
 * thème (card / border / muted-foreground / destructive), lisibles en clair comme
 * en sombre :
 *   - réalisé  → var(--chart-1)          (indigo, courbe pleine)
 *   - projeté  → var(--muted-foreground) (gris neutre)
 *   - budget   → var(--destructive)      (rouge pointillé)
 *   - grille   → var(--border)
 *   - axes     → var(--muted-foreground)
 *   - tooltip  → fond var(--card) / bordure var(--border) / texte var(--foreground)
 */

export const KPI_CHART_COLORS = {
  real: 'var(--chart-1)',
  proj: 'var(--muted-foreground)',
  budget: 'var(--destructive)',
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)',
} as const

interface KpiLineChartProps {
  /** Titre affiché au-dessus du graphique. */
  title: string
  /** Données déjà mises en forme (une entrée par point sur l'axe X). */
  data: Array<Record<string, number | string | null>>
  /** Clé de l'axe X dans `data` (ex. 'mois' ou 'jour'). */
  xKey: string
  /** Clé de la courbe « réalisé ». */
  realKey: string
  /** Clé de la courbe « projeté / forecast » (optionnelle). */
  projKey?: string
  /** Clé de la courbe « budget » (optionnelle). */
  budgetKey?: string
  /** Libellé de la courbe réalisée (défaut « Réalisé »). */
  realName?: string
  /** Libellé de la courbe projetée : « Projeté » (annuel) ou « Forecast » (mensuel). */
  projName?: string
  /** Libellé de la courbe budget (défaut « Budget »). */
  budgetName?: string
  /** Rayon des points de la courbe réalisée (3 en annuel, 2 en mensuel). */
  realDotRadius?: number
  /** Domaine fixe de l'axe Y (ex. [0, 100] pour un taux d'occupation). */
  yDomain?: [number, number]
  /** Formateur des graduations Y (ex. milliers « 12k »). */
  yTickFormatter?: (value: number) => string
  /** Formateur des valeurs dans l'infobulle. */
  tooltipFormatter: (value: number) => string
}

export function KpiLineChart({
  title,
  data,
  xKey,
  realKey,
  projKey,
  budgetKey,
  realName = 'Réalisé',
  projName = 'Projeté',
  budgetName = 'Budget',
  realDotRadius = 3,
  yDomain,
  yTickFormatter,
  tooltipFormatter,
}: KpiLineChartProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={KPI_CHART_COLORS.grid} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: KPI_CHART_COLORS.axis }}
            stroke={KPI_CHART_COLORS.grid}
          />
          <YAxis
            domain={yDomain}
            tickFormatter={yTickFormatter}
            tick={{ fontSize: 11, fill: KPI_CHART_COLORS.axis }}
            stroke={KPI_CHART_COLORS.grid}
          />
          <Tooltip
            formatter={(value) => tooltipFormatter(Number(value))}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--foreground)',
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--foreground)' }}
            itemStyle={{ color: 'var(--foreground)' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey={realKey}
            name={realName}
            stroke={KPI_CHART_COLORS.real}
            strokeWidth={2}
            dot={{ r: realDotRadius }}
            connectNulls={false}
          />
          {projKey && (
            <Line
              type="monotone"
              dataKey={projKey}
              name={projName}
              stroke={KPI_CHART_COLORS.proj}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          )}
          {budgetKey && (
            <Line
              type="monotone"
              dataKey={budgetKey}
              name={budgetName}
              stroke={KPI_CHART_COLORS.budget}
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
