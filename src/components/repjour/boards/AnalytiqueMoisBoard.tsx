import { useMemo } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
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
  const router = useRouter()

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
    <PageContainer fillHeight>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader
          title={`${monthLabel} ${year}`}
          actions={
            <Tip label="Retour à l'analytique">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => router.history.back()}
                aria-label="Retour à l'analytique"
              >
                <ArrowLeft />
              </Button>
            </Tip>
          }
        />

        {loading ? (
          <BoardSkeleton rows={12} />
        ) : (
          <>
            {/* Cartes résumé */}
            <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
              {(() => {
                const pct =
                  budget && budget.nuitees > 0
                    ? (summary.totalNuitees / budget.nuitees) * 100
                    : 0
                const over = pct > 100
                const max = over ? pct * 1.15 : 100
                const bar = (pct / max) * 100
                const goal = (100 / max) * 100
                return (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Nuitées
                    </p>
                    <div className="mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {fmt.nuitees(summary.totalNuitees)}
                      </span>
                      {budget && (
                        <span className="text-sm text-muted-foreground">
                          {' '}
                          / {fmt.nuitees(budget.nuitees)}
                        </span>
                      )}
                    </div>
                    {budget && (
                      <div className="relative mt-2 h-1.5 rounded-full bg-muted">
                        {over ? (
                          <>
                            <div
                              className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500 transition-all duration-700"
                              style={{ width: `${goal}%` }}
                            />
                            <div
                              className="absolute inset-y-0 rounded-r-full bg-amber-500 transition-all duration-700"
                              style={{
                                left: `${goal}%`,
                                width: `${bar - goal}%`,
                              }}
                            />
                          </>
                        ) : (
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-700"
                            style={{ width: `${bar}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Taux d'occupation moyen
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmt.pct(summary.avgTO)}
                  </span>
                </div>
                {budget && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Objectif {fmt.pct(budget.taux_occupation)}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Revenu moyen par chambre
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmt.eur(summary.avgRevPAR)}
                  </span>
                </div>
                {budget && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Objectif {fmt.eur(budget.revpar)}
                  </p>
                )}
              </div>

              {(() => {
                const pct =
                  budget && budget.room_revenue > 0
                    ? (summary.totalRevenue / budget.room_revenue) * 100
                    : 0
                const over = pct > 100
                const max = over ? pct * 1.15 : 100
                const bar = (pct / max) * 100
                const goal = (100 / max) * 100
                return (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Chiffre d'affaires
                    </p>
                    <div className="mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {fmt.eurInt(summary.totalRevenue)}
                      </span>
                      {budget && (
                        <span className="text-sm text-muted-foreground">
                          {' '}
                          / {fmt.eurInt(budget.room_revenue)}
                        </span>
                      )}
                    </div>
                    {budget && (
                      <div className="relative mt-2 h-1.5 rounded-full bg-muted">
                        {over ? (
                          <>
                            <div
                              className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500 transition-all duration-700"
                              style={{ width: `${goal}%` }}
                            />
                            <div
                              className="absolute inset-y-0 rounded-r-full bg-amber-500 transition-all duration-700"
                              style={{
                                left: `${goal}%`,
                                width: `${bar - goal}%`,
                              }}
                            />
                          </>
                        ) : (
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-700"
                            style={{ width: `${bar}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Tableau jour par jour (défile en interne, en-tête collant) */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
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
                  </thead>
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
                              hasData
                                ? 'text-foreground'
                                : 'text-muted-foreground'
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
                                <span className="sm:hidden">
                                  {compact(nuitees)}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">
                                —
                              </span>
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
                                <span className="hidden sm:inline">
                                  {fmt.pct(to)}
                                </span>
                                <span className="sm:hidden">
                                  {compactDec(to)}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">
                                —
                              </span>
                            )}
                          </td>
                          <td
                            className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${opacity}`}
                          >
                            {pm != null ? (
                              <>
                                <span className="hidden sm:inline">
                                  {fmt.eur(pm)}
                                </span>
                                <span className="sm:hidden">
                                  {compactDec(pm)}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">
                                —
                              </span>
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
                                <span className="sm:hidden">
                                  {compactDec(revpar)}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">
                                —
                              </span>
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
                              <span className="text-muted-foreground/50">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Graphiques */}
            <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
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
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
