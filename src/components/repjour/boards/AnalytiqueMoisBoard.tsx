import { useMemo } from 'react'
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
import { fetchUnifiedDays } from '#/lib/repjour/services/data.ts'
import { fetchBudget } from '#/lib/repjour/services/daily.ts'
import {
  DAY_NAMES,
  MONTHS_LABELS,
  TOTAL_ROOMS,
} from '#/lib/repjour/constants.ts'
import { fmt } from '#/lib/repjour/format.ts'

/*
 * Détail analytique d'un mois, jour par jour — porté de AnalytiqueMoisPage.
 *
 * Charge en LECTURE la vue unifiée du mois (rapports réalisés + prévisions via
 * fetchUnifiedDays) et le budget du mois (fetchBudget), puis rend : cartes de
 * synthèse, tableau jour par jour et deux graphiques (CA/jour, TO/jour).
 *
 * `year` / `month` sont fournis par la route (params $year/$month). Aucune
 * écriture Supabase — uniquement des `select`.
 */

interface MonthSummary {
  totalNuitees: number
  totalRevenue: number
  avgTO: number
  avgRevPAR: number
}

const { compact, compactDec } = fmt

export function AnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  // Vue unifiée du mois + budget. Mise en cache : naviguer entre les mois puis
  // revenir est instantané (plus de refetch systématique).
  const { data, isPending: loading } = useQuery({
    queryKey: ['repjour', 'month-detail', year, month],
    queryFn: () =>
      Promise.all([
        fetchUnifiedDays({ year, month }),
        fetchBudget(year, month),
      ]),
    enabled: Number.isFinite(year) && Number.isFinite(month),
  })
  const rows = data?.[0] ?? []
  const budget = data?.[1] ?? null

  const now = new Date()
  const currentDay =
    now.getFullYear() === year && now.getMonth() + 1 === month
      ? now.getDate()
      : 999

  const summary: MonthSummary = useMemo(() => {
    let totalNuitees = 0
    let totalRevenue = 0
    let toSum = 0
    let revparSum = 0
    let count = 0

    for (const row of rows) {
      const r = row.report
      const f = row.forecast
      if (r) {
        totalNuitees += r.rj_nuitees
        totalRevenue += r.rj_room_revenue
        toSum += r.rj_to
        revparSum += r.rj_revpar
        count++
      } else if (f) {
        totalNuitees += f.occ
        totalRevenue += f.rev_ttc
        toSum += f.occ_percent
        revparSum += f.rev_ttc / TOTAL_ROOMS
        count++
      }
    }

    return {
      totalNuitees,
      totalRevenue,
      avgTO: count > 0 ? toSum / count : 0,
      avgRevPAR: count > 0 ? revparSum / count : 0,
    }
  }, [rows])

  const chartData = useMemo(() => {
    const daysInMonth = rows.length
    const dailyBudgetRevenue =
      budget && daysInMonth > 0 ? budget.room_revenue / daysInMonth : 0
    const dailyBudgetTO = budget ? budget.taux_occupation : 0

    // Dernier jour avec rapport pour la jonction réalisé/forecast.
    let lastReportDay = 0
    for (const row of rows) {
      if (row.report) {
        const d = new Date(row.date + 'T00:00:00').getDate()
        if (d > lastReportDay) lastReportDay = d
      }
    }

    return rows.map((row) => {
      const day = new Date(row.date + 'T00:00:00').getDate()
      const r = row.report
      const f = row.forecast
      const hasReport = !!r
      const hasForecast = !!f

      return {
        jour: day,
        revenueReal: hasReport ? r.rj_room_revenue : null,
        revenueProj:
          !hasReport && hasForecast
            ? f.rev_ttc
            : hasReport && day === lastReportDay
              ? r.rj_room_revenue
              : null,
        budgetRevenue: dailyBudgetRevenue,
        toReal: hasReport ? r.rj_to : null,
        toProj:
          !hasReport && hasForecast
            ? f.occ_percent
            : hasReport && day === lastReportDay
              ? r.rj_to
              : null,
        budgetTO: dailyBudgetTO,
      }
    })
  }, [rows, budget])

  const monthLabel = MONTHS_LABELS[month - 1] || ''

  return (
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      skeleton={{ cols: 5, charts: 2, rows: new Date(year, month, 0).getDate() }}
    >
      {/* Cartes résumé — réalisé / objectif en FRACTION (barre horizontale) quand
          un budget existe pour le mois ; sinon valeur seule. */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Nuitées"
          accent="#818cf8"
          value={fmt.nuitees(summary.totalNuitees)}
          reference={budget ? fmt.nuitees(budget.nuitees) : undefined}
        />
        <StatCard
          label="Taux d'occupation moyen"
          accent="#38bdf8"
          value={fmt.pct(summary.avgTO)}
          reference={budget ? fmt.pct(budget.taux_occupation) : undefined}
        />
        <StatCard
          label="Revenu moyen par chambre"
          accent="#34d399"
          value={fmt.eur(summary.avgRevPAR)}
          reference={budget ? fmt.eur(budget.revpar) : undefined}
        />
        <StatCard
          label="Chiffre d'affaires"
          accent="#fbbf24"
          value={fmt.eurInt(summary.totalRevenue)}
          reference={budget ? fmt.eurInt(budget.room_revenue) : undefined}
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
              <span className="hidden sm:inline">Nuitées</span>
              <span className="sm:hidden">Nuit.</span>
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              TO
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              PM
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              RevPAR
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              CA
            </th>
          </tr>
        }
      >
        <tbody>
          {rows.map((row) => {
            const r = row.report
            const f = row.forecast
            const hasData = !!r || !!f
            const d = new Date(row.date + 'T00:00:00')
            const dayNum = d.getDate()
            const dayName = DAY_NAMES[d.getDay()]
            const isFuture = dayNum > currentDay

            const nuitees = r ? r.rj_nuitees : f ? f.occ : null
            const to = r ? r.rj_to : f ? f.occ_percent : null
            const pm = r
              ? r.rj_pm
              : f && f.occ > 0
                ? f.rev_ttc / f.occ
                : null
            const revpar = r
              ? r.rj_revpar
              : f
                ? f.rev_ttc / TOTAL_ROOMS
                : null
            const ca = r ? r.rj_room_revenue : f ? f.rev_ttc : null

            const opacity = isFuture && !r ? 'opacity-25' : ''

            return (
              <tr
                key={row.date}
                className={`border-b border-border/50 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {dayName} {dayNum}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${opacity}`}
                >
                  {nuitees != null ? (
                    <>
                      <span className="hidden sm:inline">
                        {fmt.nuitees(nuitees)}
                      </span>
                      <span className="sm:hidden">{compact(nuitees)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${
                    to != null && to > 100
                      ? 'font-bold text-destructive'
                      : opacity
                  }`}
                >
                  {to != null ? (
                    <>
                      <span className="hidden sm:inline">{fmt.pct(to)}</span>
                      <span className="sm:hidden">{compactDec(to)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${opacity}`}
                >
                  {pm != null ? (
                    <>
                      <span className="hidden sm:inline">{fmt.eur(pm)}</span>
                      <span className="sm:hidden">{compactDec(pm)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${opacity}`}
                >
                  {revpar != null ? (
                    <>
                      <span className="hidden sm:inline">
                        {fmt.eur(revpar)}
                      </span>
                      <span className="sm:hidden">{compactDec(revpar)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${opacity}`}
                >
                  {ca != null ? (
                    <>
                      <span className="hidden sm:inline">
                        {fmt.eurInt(ca)}
                      </span>
                      <span className="sm:hidden">{compact(ca)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
        <KpiLineChart
          title="Chiffre d'affaires par jour"
          data={chartData}
          xKey="jour"
          realKey="revenueReal"
          projKey="revenueProj"
          budgetKey="budgetRevenue"
          projName="Forecast"
          realDotRadius={2}
          yTickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tooltipFormatter={fmt.eurInt}
        />
        <KpiLineChart
          title="Taux d'occupation par jour"
          data={chartData}
          xKey="jour"
          realKey="toReal"
          projKey="toProj"
          budgetKey="budgetTO"
          projName="Forecast"
          realDotRadius={2}
          yDomain={[0, 100]}
          tooltipFormatter={fmt.pct}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
