import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
import {
  fetchBudgetYears,
  fetchYearAnalytics,
  fetchYearBudget,
} from '#/lib/repjour/services/daily.ts'
import { MONTHS_LABELS } from '#/lib/repjour/constants.ts'
import { fmt } from '#/lib/repjour/format.ts'

/*
 * Vue analytique annuelle — portée de la source AnalytiquePage.
 *
 * Charge en LECTURE (services/daily) l'agrégation mensuelle (réalisé / projeté /
 * forecast) + le budget de l'année, puis rend : cartes de synthèse annuelle,
 * tableau mois par mois (clic → détail du mois) et deux graphiques (CA/mois,
 * TO/mois).
 *
 * OMIS volontairement (réservé étape 7) : l'import Forecast par glisser-déposer
 * réservé à l'admin (drag-drop CSV → upsert forecast_days) présent dans la
 * source. Aucune écriture Supabase ici — uniquement des `select`. Tous les
 * rôles accèdent à cette vue en lecture.
 */

const currentYear = new Date().getFullYear()
const { compact, compactDec, compactEcart } = fmt

interface AnnualSummary {
  totalNuitees: number
  avgTO: number
  avgRevPAR: number
  totalRevenue: number
  budgetTotalNuitees: number
  budgetAvgTO: number
  budgetAvgRevPAR: number
  budgetTotalRevenue: number
}

export function AnalytiqueBoard() {
  const navigate = useNavigate()
  const [year, setYear] = useState(currentYear)

  // Liste des années disponibles (budget) — mise en cache par le QueryClient.
  const { data: years = [] } = useQuery({
    queryKey: ['repjour', 'budget-years'],
    queryFn: async () => {
      const yrs = await fetchBudgetYears()
      return yrs.length > 0 ? yrs : [currentYear]
    },
  })

  // Si l'année sélectionnée n'est pas dans la liste chargée, se caler sur la
  // plus récente (remplace l'ajustement fait autrefois au montage).
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])

  // Agrégation annuelle + budget de l'année. Grâce au cache, revenir sur une
  // année déjà consultée est instantané (plus de refetch systématique).
  const { data, isPending: loading } = useQuery({
    queryKey: ['repjour', 'year-analytics', year],
    queryFn: () =>
      Promise.all([fetchYearAnalytics(year), fetchYearBudget(year)]),
  })
  const analytics = data?.[0] ?? []
  const budgets = data?.[1] ?? []

  const summary: AnnualSummary = useMemo(() => {
    const mwd = analytics.filter((m) => m.daysWithData > 0)
    const count = mwd.length
    return {
      totalNuitees: mwd.reduce((s, m) => s + m.nuitees, 0),
      avgTO: count > 0 ? mwd.reduce((s, m) => s + m.to, 0) / count : 0,
      avgRevPAR: count > 0 ? mwd.reduce((s, m) => s + m.revpar, 0) / count : 0,
      totalRevenue: mwd.reduce((s, m) => s + m.revenue, 0),
      budgetTotalNuitees: budgets.reduce((s, b) => s + b.nuitees, 0),
      budgetAvgTO:
        budgets.length > 0
          ? budgets.reduce((s, b) => s + b.taux_occupation, 0) / budgets.length
          : 0,
      budgetAvgRevPAR:
        budgets.length > 0
          ? budgets.reduce((s, b) => s + b.revpar, 0) / budgets.length
          : 0,
      budgetTotalRevenue: budgets.reduce((s, b) => s + b.room_revenue, 0),
    }
  }, [analytics, budgets])

  const currentMonth = new Date().getMonth() + 1

  const chartData = useMemo(() => {
    const budgetMap = new Map(budgets.map((b) => [b.month, b]))

    // Dernier mois réalisé/projeté (pas forecast) pour la jonction de courbes.
    let lastRealMonth = 0
    for (const m of analytics) {
      if (m.source === 'realise' || m.source === 'projete')
        lastRealMonth = m.month
    }

    return analytics.map((m) => {
      const b = budgetMap.get(m.month)
      const hasData = m.source !== 'vide'
      const isReal = m.source === 'realise' || m.source === 'projete'
      return {
        mois: MONTHS_LABELS[m.month - 1]?.slice(0, 3),
        revenueReal: isReal && hasData ? m.revenue : null,
        revenueProj:
          m.source === 'forecast' && hasData
            ? m.revenue
            : isReal && m.month === lastRealMonth
              ? m.revenue
              : null,
        budgetRevenue: b?.room_revenue ?? 0,
        toReal: isReal && hasData ? m.to : null,
        toProj:
          m.source === 'forecast' && hasData
            ? m.to
            : isReal && m.month === lastRealMonth
              ? m.to
              : null,
        budgetTO: b?.taux_occupation ?? 0,
      }
    })
  }, [analytics, budgets])

  const budgetByMonth = useMemo(
    () => new Map(budgets.map((b) => [b.month, b])),
    [budgets],
  )

  const minYear = years[0] ?? currentYear
  const maxYear = years[years.length - 1] ?? currentYear
  const prevYearDisabled = year <= minYear
  const nextYearDisabled = year >= maxYear
  const goPrevYear = () => {
    if (year > minYear) setYear((y) => y - 1)
  }
  const goNextYear = () => {
    if (year < maxYear) setYear((y) => y + 1)
  }
  useStepNavKeys({
    onPrev: goPrevYear,
    onNext: goNextYear,
    onToday: () => setYear(currentYear),
    prevDisabled: prevYearDisabled,
    nextDisabled: nextYearDisabled,
  })

  return (
    <PageContainer fillHeight>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader
          title="Analytique"
          actions={
            <StepNav
              onPrev={goPrevYear}
              onNext={goNextYear}
              prevLabel="Année précédente"
              nextLabel="Année suivante"
              prevDisabled={prevYearDisabled}
              nextDisabled={nextYearDisabled}
            >
              <span className="w-12 text-center text-sm font-medium tabular-nums">
                {year}
              </span>
            </StepNav>
          }
        />

        {loading ? (
          <BoardSkeleton rows={12} />
        ) : (
          <>
            {/* Synthèse annuelle */}
            <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
              {(() => {
                const pctNuit =
                  summary.budgetTotalNuitees > 0
                    ? (summary.totalNuitees / summary.budgetTotalNuitees) * 100
                    : 0
                const overNuit = pctNuit > 100
                const maxNuit = overNuit ? pctNuit * 1.15 : 100
                const barNuit = (pctNuit / maxNuit) * 100
                const goalNuit = (100 / maxNuit) * 100
                return (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Nuitées
                    </p>
                    <div className="mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {fmt.nuitees(summary.totalNuitees)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {' '}
                        / {fmt.nuitees(summary.budgetTotalNuitees)}
                      </span>
                    </div>
                    <div className="relative mt-2 h-1.5 rounded-full bg-muted">
                      {overNuit ? (
                        <>
                          <div
                            className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500 transition-all duration-700"
                            style={{ width: `${goalNuit}%` }}
                          />
                          <div
                            className="absolute inset-y-0 rounded-r-full bg-amber-500 transition-all duration-700"
                            style={{
                              left: `${goalNuit}%`,
                              width: `${barNuit - goalNuit}%`,
                            }}
                          />
                        </>
                      ) : (
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-700"
                          style={{ width: `${barNuit}%` }}
                        />
                      )}
                      {overNuit && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 transition-all duration-700"
                          style={{ left: `${goalNuit}%` }}
                        >
                          <div className="h-3 w-0.5 bg-foreground/20" />
                        </div>
                      )}
                    </div>
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Objectif {fmt.pct(summary.budgetAvgTO)}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Revenu par chambre moyen
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmt.eur(summary.avgRevPAR)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Objectif {fmt.eur(summary.budgetAvgRevPAR)}
                </p>
              </div>

              {(() => {
                const pctCA =
                  summary.budgetTotalRevenue > 0
                    ? (summary.totalRevenue / summary.budgetTotalRevenue) * 100
                    : 0
                const overCA = pctCA > 100
                const maxCA = overCA ? pctCA * 1.15 : 100
                const barCA = (pctCA / maxCA) * 100
                const goalCA = (100 / maxCA) * 100
                return (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Chiffre d'affaires total
                    </p>
                    <div className="mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {fmt.eurInt(summary.totalRevenue)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {' '}
                        / {fmt.eurInt(summary.budgetTotalRevenue)}
                      </span>
                    </div>
                    <div className="relative mt-2 h-1.5 rounded-full bg-muted">
                      {overCA ? (
                        <>
                          <div
                            className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500 transition-all duration-700"
                            style={{ width: `${goalCA}%` }}
                          />
                          <div
                            className="absolute inset-y-0 rounded-r-full bg-amber-500 transition-all duration-700"
                            style={{
                              left: `${goalCA}%`,
                              width: `${barCA - goalCA}%`,
                            }}
                          />
                        </>
                      ) : (
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-all duration-700"
                          style={{ width: `${barCA}%` }}
                        />
                      )}
                      {overCA && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 transition-all duration-700"
                          style={{ left: `${goalCA}%` }}
                        >
                          <div className="h-3 w-0.5 bg-foreground/20" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Tableau mois par mois */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-muted">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Mois
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
                      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
                        RevPAR
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                        CA
                      </th>
                      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
                        Budget
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                        <span className="hidden sm:inline">Écart</span>
                        <span className="sm:hidden">+/-</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.map((m) => {
                      const b = budgetByMonth.get(m.month)
                      const hasData = m.source !== 'vide'
                      const ecart =
                        hasData && b ? m.revenue - b.room_revenue : 0
                      const isFuture =
                        (year === currentYear && m.month > currentMonth) ||
                        year > currentYear
                      return (
                        <tr
                          key={m.month}
                          onClick={() =>
                            navigate({
                              to: '/repjour/analytique/$year/$month',
                              params: {
                                year: String(year),
                                month: String(m.month),
                              },
                            })
                          }
                          className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
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
                            <span className="hidden sm:inline">
                              {MONTHS_LABELS[m.month - 1]}
                            </span>
                            <span className="sm:hidden">
                              {MONTHS_LABELS[m.month - 1]?.slice(0, 3)}
                            </span>
                          </td>
                          {hasData ? (
                            <>
                              <td
                                className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                <span className="hidden sm:inline">
                                  {fmt.nuitees(m.nuitees)}
                                </span>
                                <span className="sm:hidden">
                                  {compact(m.nuitees)}
                                </span>
                              </td>
                              <td
                                className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${
                                  m.hasOvercapacity
                                    ? 'font-bold text-destructive'
                                    : isFuture
                                      ? 'opacity-25'
                                      : ''
                                }`}
                              >
                                <span className="hidden sm:inline">
                                  {fmt.pct(m.to)}
                                </span>
                                <span className="sm:hidden">
                                  {compactDec(m.to)}
                                </span>
                              </td>
                              <td
                                className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                <span className="hidden sm:inline">
                                  {fmt.eur(m.pm)}
                                </span>
                                <span className="sm:hidden">
                                  {compactDec(m.pm)}
                                </span>
                              </td>
                              <td
                                className={`hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                {fmt.eur(m.revpar)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                <span className="hidden sm:inline">
                                  {fmt.eurInt(m.revenue)}
                                </span>
                                <span className="sm:hidden">
                                  {compact(m.revenue)}
                                </span>
                              </td>
                              <td
                                className={`hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                {b ? fmt.eurInt(b.room_revenue) : '—'}
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 text-center text-xs font-bold tabular-nums ${
                                  ecart >= 0
                                    ? 'text-emerald-500'
                                    : 'text-destructive'
                                } ${isFuture ? 'opacity-25' : ''}`}
                              >
                                <span className="hidden sm:inline">
                                  {b ? fmt.ecartEurInt(ecart) : '—'}
                                </span>
                                <span className="sm:hidden">
                                  {b ? compactEcart(ecart) : '—'}
                                </span>
                              </td>
                            </>
                          ) : (
                            <>
                              <td
                                colSpan={3}
                                className={`px-2 py-2 text-center text-xs text-muted-foreground/50 ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                —
                              </td>
                              <td
                                className={`hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                —
                              </td>
                              <td
                                className={`px-2 py-2 text-center text-xs text-muted-foreground/50 ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                —
                              </td>
                              <td
                                className={`hidden px-2 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                {b ? fmt.eurInt(b.room_revenue) : '—'}
                              </td>
                              <td
                                className={`px-3 py-2 text-center text-xs text-muted-foreground/50 ${
                                  isFuture ? 'opacity-25' : ''
                                }`}
                              >
                                —
                              </td>
                            </>
                          )}
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
                title="Chiffre d'affaires par mois"
                data={chartData}
                xKey="mois"
                realKey="revenueReal"
                projKey="revenueProj"
                budgetKey="budgetRevenue"
                projName="Projeté"
                yTickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tooltipFormatter={fmt.eurInt}
              />
              <KpiLineChart
                title="Taux d'occupation par mois"
                data={chartData}
                xKey="mois"
                realKey="toReal"
                projKey="toProj"
                budgetKey="budgetTO"
                projName="Projeté"
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
