/*
 * Infobulle personnalisée COMMUNE aux deux primitives de graphique du socle
 * (KpiStackedBarChart et KpiLineChart). Chaque ligne porte une PASTILLE de la
 * couleur de la série/segment (repère « légende »), son nom, et sa valeur alignée à
 * droite en chiffres tabulaires. En-tête via `labelFormatter` (libellé complet, ex.
 * « Fév » → « Février 2026 »). Les entrées sans valeur (null) sont masquées.
 * `active`/`payload`/`label` sont injectés par Recharts (via `content`), d'où leur
 * caractère optionnel. Theme-aware (tokens --card / --border / --foreground).
 *
 * `extraRows` : lignes d'INFOBULLE SEULEMENT, sans pastille — pour une métrique
 * utile en contexte (ex. le total de PDJ inclus derrière un empilement Servis/
 * Extra/Non servis) qui n'a PAS sa propre tranche dans le graphe. Calculées à
 * partir de la ligne de données complète (`payload[0].payload`, pas seulement les
 * séries dessinées), séparées visuellement par un filet.
 */

/** Une entrée de l'infobulle (sous-ensemble du payload Recharts qu'on exploite).
 * Pour un histogramme la couleur vient de `fill`, pour une courbe de `color`. */
export interface ChartTooltipEntry {
  name?: string
  value?: number | string | null
  color?: string
  fill?: string
  dataKey?: string | number
  /** Ligne de données complète derrière cette série — sert de source à `extraRows`. */
  payload?: Record<string, unknown>
}

export interface ChartTooltipExtraRow {
  name: string
  value: number | string | null
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  extraRows,
}: {
  active?: boolean
  payload?: ChartTooltipEntry[]
  label?: string | number
  labelFormatter?: (label: string) => string
  valueFormatter: (value: number) => string
  /** Lignes supplémentaires sans pastille, dérivées de la ligne de données
   * complète — pour une métrique de contexte qui n'a pas de tranche dans le
   * graphe (cf. commentaire de tête). */
  extraRows?: (row: Record<string, unknown>) => ChartTooltipExtraRow[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const rows = payload.filter((e) => e.value != null)
  const dataRow = payload[0]?.payload
  const extras = (
    extraRows && dataRow ? extraRows(dataRow) : []
  ).filter((e) => e.value != null)
  if (rows.length === 0 && extras.length === 0) return null
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
      {extras.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid var(--border)',
          }}
        >
          {extras.map((entry) => (
            <div
              key={entry.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                lineHeight: 1.6,
                color: 'var(--muted-foreground)',
              }}
            >
              <span>{entry.name}</span>
              <span
                style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}
              >
                {valueFormatter(Number(entry.value))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
