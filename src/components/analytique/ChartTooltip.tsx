/*
 * Infobulle personnalisée COMMUNE aux deux primitives de graphique du socle
 * (KpiStackedBarChart et KpiLineChart). Chaque ligne porte une PASTILLE de la
 * couleur de la série/segment (repère « légende »), son nom, et sa valeur alignée à
 * droite en chiffres tabulaires. En-tête via `labelFormatter` (libellé complet, ex.
 * « Fév » → « Février 2026 »). Les entrées sans valeur (null) sont masquées.
 * `active`/`payload`/`label` sont injectés par Recharts (via `content`), d'où leur
 * caractère optionnel. Theme-aware (tokens --card / --border / --foreground).
 */

/** Une entrée de l'infobulle (sous-ensemble du payload Recharts qu'on exploite).
 * Pour un histogramme la couleur vient de `fill`, pour une courbe de `color`. */
export interface ChartTooltipEntry {
  name?: string
  value?: number | string | null
  color?: string
  fill?: string
  dataKey?: string | number
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean
  payload?: ChartTooltipEntry[]
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
          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
            {valueFormatter(Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  )
}
