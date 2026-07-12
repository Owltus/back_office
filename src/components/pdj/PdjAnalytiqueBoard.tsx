import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
import { fetchRange, fetchServiceDates } from '#/lib/pdj/service.ts'
import { aggregatePdjMonthly, yearsFromDates } from '#/lib/pdj/analytics.ts'

/*
 * Vue analytique PDJ — gabarit calqué sur repjour/AnalytiqueBoard.
 *
 * Charge en LECTURE les lignes de l'année sélectionnée (fetchRange), les agrège
 * par mois (aggregatePdjMonthly), puis rend : cartes de synthèse annuelle,
 * tableau mois par mois et deux graphiques (PDJ servis/inclus/potentiel,
 * occupation). Aucune écriture Supabase — uniquement des `select`. Ouvert à
 * tous les rôles connectés en lecture (garde `ProtectedRoute` sur la route).
 */

const currentYear = new Date().getFullYear()

const MONTHS_SHORT = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
]

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtInt = (n: number) => nf0.format(n)
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

export function PdjAnalytiqueBoard() {
  const navigate = useNavigate()
  const [year, setYear] = useState(currentYear)

  // Années disponibles (dérivées des jours de service en base).
  const { data: dates = [] } = useQuery({
    queryKey: ['pdj', 'dates'],
    queryFn: fetchServiceDates,
  })
  const years = useMemo(() => yearsFromDates(dates, currentYear), [dates])

  // Si l'année sélectionnée n'est pas dans la liste chargée, se caler sur la
  // plus récente.
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])

  // Lignes de l'année → agrégation mensuelle. Cache par année (retour instantané).
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics', year],
    queryFn: () => fetchRange(`${year}-01-01`, `${year}-12-31`),
  })

  const months = useMemo(() => aggregatePdjMonthly(rows, year), [rows, year])

  const summary = useMemo(() => {
    const active = months.filter((m) => m.days > 0)
    const count = active.length
    return {
      totalDays: months.reduce((s, m) => s + m.days, 0),
      totalGuests: months.reduce((s, m) => s + m.guests, 0),
      totalServed: months.reduce((s, m) => s + m.served, 0),
      totalIncluded: months.reduce((s, m) => s + m.included, 0),
      avgOccupancy:
        count > 0
          ? active.reduce((s, m) => s + m.avgOccupancy, 0) / count
          : 0,
    }
  }, [months])

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        mois: MONTHS_SHORT[m.month - 1],
        servis: m.days > 0 ? m.served : null,
        inclus: m.days > 0 ? m.included : null,
        potentiel: m.days > 0 ? m.potential : null,
        occ: m.days > 0 ? m.avgOccupancy : null,
      })),
    [months],
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
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Jours couverts
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.totalDays)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {fmtInt(summary.totalGuests)} clients cumulés
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Taux d'occupation moyen
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtPct(summary.avgOccupancy)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Moyenne des jours renseignés
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  PDJ servis
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.totalServed)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {' '}
                    / {fmtInt(summary.totalIncluded)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  servis / inclus
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Potentiel non inclus
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(Math.max(0, summary.totalGuests - summary.totalIncluded))}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  clients sans PDJ inclus
                </p>
              </div>
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
                        Jours
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
                  </thead>
                  <tbody>
                    {months.map((m) => {
                      const hasData = m.days > 0
                      return (
                        <tr
                          key={m.month}
                          onClick={() =>
                            navigate({
                              to: '/pdj/analytique/$year/$month',
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
                            {MONTHS_SHORT[m.month - 1]}
                          </td>
                          {hasData ? (
                            <>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtInt(m.days)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtPct(m.avgOccupancy)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtInt(m.guests)}
                              </td>
                              <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                                {fmtInt(m.included)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-foreground">
                                {fmtInt(m.served)}
                              </td>
                              <td className="hidden whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell">
                                {fmtInt(m.potential)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td
                                colSpan={4}
                                className="px-2 py-2 text-center text-xs text-muted-foreground/50"
                              >
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
                </table>
              </div>
            </div>

            {/* Graphiques */}
            <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
              <KpiLineChart
                title="Petits-déjeuners par mois"
                data={chartData}
                xKey="mois"
                realKey="servis"
                projKey="inclus"
                budgetKey="potentiel"
                realName="Servis"
                projName="Inclus"
                budgetName="Potentiel"
                tooltipFormatter={fmtInt}
              />
              <KpiLineChart
                title="Taux d'occupation par mois"
                data={chartData}
                xKey="mois"
                realKey="occ"
                realName="Occupation"
                yDomain={[0, 100]}
                tooltipFormatter={fmtPct}
              />
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
