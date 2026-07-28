import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/*
 * Histogramme empilé réutilisable (Recharts) — une barre par point sur l'axe X,
 * chaque barre découpée en segments EMPILÉS (proportionnels). Pendant « barres »
 * du KpiLineChart : même habillage thème (grille, axes, infobulle). Légende en bas
 * OPTIONNELLE (`showLegend`, masquée par défaut car l'infobulle porte déjà la
 * pastille de couleur de chaque segment). Client-only (monté sous des îlots
 * `ssr: false`). Place dans le socle partagé `components/analytique/`.
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
  /** Affiche la légende en bas (défaut : masquée — l'infobulle porte déjà les
   * pastilles de couleur). Activée sur les vues où la place le permet (ex. annuelle). */
  showLegend?: boolean
}

const AXIS = 'var(--muted-foreground)'
const GRID = 'var(--border)'

/** Une entrée de l'infobulle (sous-ensemble du payload Recharts qu'on exploite). */
interface TooltipEntry {
  name?: string
  value?: number | string | null
  color?: string
  fill?: string
  dataKey?: string | number
}

/**
 * Infobulle personnalisée : chaque ligne porte une PASTILLE de la couleur du
 * segment (repère « légende », sans quoi on ne sait plus qui est qui), son nom, et
 * sa valeur alignée à droite. En-tête via `labelFormatter` (libellé complet). Les
 * segments sans valeur (null) sont masqués. `active`/`payload`/`label` sont injectés
 * par Recharts (via `content`), d'où leur caractère optionnel.
 */
function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  labelFormatter?: (label: string) => string
  valueFormatter: (value: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  const rows = payload.filter((e) => e.value != null)
  if (rows.length === 0) return null
  const head = labelFormatter ? labelFormatter(String(label)) : String(label)
  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        color: 'var(--foreground)',
        fontSize: 12,
        padding: '8px 10px',
        minWidth: 170,
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 500 }}>{head}</div>
      {rows.map((entry) => (
        <div
          key={String(entry.dataKey)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            lineHeight: 1.6,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              flexShrink: 0,
              borderRadius: 2,
              backgroundColor: entry.color ?? entry.fill,
            }}
          />
          <span>{entry.name}</span>
          <span
            style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}
          >
            {valueFormatter(Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

export function KpiStackedBarChart({
  title,
  data,
  xKey,
  segments,
  yTickFormatter,
  tooltipFormatter,
  labelFormatter,
  showLegend = false,
}: KpiStackedBarChartProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: AXIS }}
            stroke={GRID}
          />
          <YAxis
            tickFormatter={yTickFormatter}
            tick={{ fontSize: 11, fill: AXIS }}
            stroke={GRID}
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
          {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {segments.map((seg) => (
            <Bar
              key={seg.key}
              dataKey={seg.key}
              name={seg.name}
              stackId="pdj"
              fill={seg.color}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
