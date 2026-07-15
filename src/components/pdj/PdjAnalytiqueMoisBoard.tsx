import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import { fetchRange } from '#/lib/pdj/service.ts'
import { aggregatePdjDaily } from '#/lib/pdj/analytics.ts'
import { fmtInt, fmtPct } from '#/lib/pdj/format.ts'
import { MONTHS_LABELS } from '#/lib/repjour/constants.ts'

/*
 * Détail analytique PDJ d'un mois, jour par jour — calqué sur le gabarit
 * repjour/AnalytiqueMoisBoard et harmonisé avec PdjAnalytiqueBoard (vue annuelle).
 *
 * Charge en LECTURE les lignes du mois (fetchRange), les agrège par jour
 * (aggregatePdjDaily), puis rend : cartes de synthèse du mois, tableau jour par
 * jour et deux graphiques (PDJ servis/inclus/potentiel, occupation). `year` /
 * `month` viennent de la route (params $year/$month). Aucune écriture Supabase
 * — uniquement des `select`.
 */

const DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export function PdjAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  // Lignes du mois → agrégation par jour. Cache par (année, mois) : naviguer
  // puis revenir est instantané.
  const { data: stats = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics-month', year, month],
    queryFn: () =>
      fetchRange(
        `${year}-${mm}-01`,
        `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
      ).then((rows) => aggregatePdjDaily(rows, year, month)),
    enabled: Number.isFinite(year) && Number.isFinite(month),
  })

  // Index par numéro de jour pour peupler un tableau plein mois (1..lastDay),
  // les jours sans donnée restant en tirets grisés.
  const byDay = useMemo(() => {
    const map = new Map<number, (typeof stats)[number]>()
    for (const s of stats) map.set(s.day, s)
    return map
  }, [stats])

  const days = useMemo(
    () => Array.from({ length: lastDay }, (_, i) => i + 1),
    [lastDay],
  )

  const summary = useMemo(() => {
    const count = stats.length
    return {
      coveredDays: count,
      totalServed: stats.reduce((s, d) => s + d.served, 0),
      totalPotential: stats.reduce((s, d) => s + d.potential, 0),
      avgOccupancy:
        count > 0 ? stats.reduce((s, d) => s + d.occupancy, 0) / count : 0,
    }
  }, [stats])

  const chartData = useMemo(
    () =>
      days.map((day) => {
        const s = byDay.get(day)
        return {
          jour: String(day),
          servis: s ? s.served : null,
          inclus: s ? s.included : null,
          potentiel: s ? s.potential : null,
          occ: s ? s.occupancy : null,
        }
      }),
    [days, byDay],
  )

  const monthLabel = MONTHS_LABELS[month - 1] || ''

  return (
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      skeleton={{
        cols: 5,
        charts: 2,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Synthèse du mois */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Jours couverts"
          accent="#818cf8"
          value={fmtInt(summary.coveredDays)}
        />
        <StatCard
          label="Taux d'occupation moyen"
          accent="#38bdf8"
          value={fmtPct(summary.avgOccupancy)}
        />
        <StatCard
          label="PDJ servis"
          accent="#34d399"
          value={fmtInt(summary.totalServed)}
        />
        <StatCard
          label="Potentiel non inclus"
          accent="#fbbf24"
          value={fmtInt(summary.totalPotential)}
        />
      </AnalytiqueCardsGrid>

      {/* Tableau jour par jour (défile en interne, en-tête collant) */}
      <AnalytiqueTable
        head={
          <tr className="border-b border-border bg-muted">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Jour
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              <span className="hidden sm:inline">Occupation</span>
              <span className="sm:hidden">Occ.</span>
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              Clients
            </th>
            <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
              Inclus
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              Servis
            </th>
            <th className="hidden px-3 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
              Potentiel
            </th>
          </tr>
        }
      >
        <tbody>
          {days.map((day) => {
            const s = byDay.get(day)
            const hasData = !!s
            const dayName =
              DAY_NAMES_SHORT[new Date(year, month - 1, day).getDay()]
            const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
            return (
              <tr
                key={day}
                className={`border-b border-border/50 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <Link
                    to="/pdj"
                    search={{ date }}
                    className="hover:text-primary hover:underline"
                  >
                    {dayName} {day}
                  </Link>
                </td>
                {hasData ? (
                  <>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                      {fmtPct(s.occupancy)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                      {fmtInt(s.guests)}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                      {fmtInt(s.included)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-foreground">
                      {fmtInt(s.served)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell">
                      {fmtInt(s.potential)}
                    </td>
                  </>
                ) : (
                  <>
                    <td
                      colSpan={3}
                      className="px-2 py-2 text-center text-xs text-muted-foreground/50"
                    >
                      —
                    </td>
                    <td className="hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
                      —
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
                      —
                    </td>
                    <td className="hidden px-3 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
                      —
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
        <KpiLineChart
          title="Petits-déjeuners par jour"
          data={chartData}
          xKey="jour"
          realKey="servis"
          projKey="inclus"
          budgetKey="potentiel"
          realName="Servis"
          projName="Inclus"
          budgetName="Potentiel"
          realDotRadius={2}
          tooltipFormatter={fmtInt}
        />
        <KpiLineChart
          title="Taux d'occupation par jour"
          data={chartData}
          xKey="jour"
          realKey="occ"
          realName="Occupation"
          realDotRadius={2}
          yDomain={[0, 100]}
          tooltipFormatter={fmtPct}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
