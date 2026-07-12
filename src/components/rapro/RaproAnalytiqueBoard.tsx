import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
import { fetchOldestDay } from '#/lib/rapro/service.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  sumCounts,
} from '#/lib/rapro/monthly.ts'

/*
 * Récap ménage ANNUEL — harmonisé sur le gabarit analytique (repjour / PDJ).
 * Vue année : sélecteur d'année, 4 cartes de synthèse, tableau mois par mois
 * (nettoyées / refus / no-show, clic → détail du mois) et deux graphiques. Un
 * fetch borné par mois (12 lectures mises en cache). Aucune écriture.
 */

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

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

const currentYear = new Date().getFullYear()

function monthLabel(year: number, m: number): string {
  const l = format(new Date(year, m - 1, 1), 'MMMM', { locale: fr })
  return l.charAt(0).toUpperCase() + l.slice(1)
}

export function RaproAnalytiqueBoard() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(currentYear)

  // Années disponibles (du plus ancien jour saisi à l'année courante) pour le
  // menu déroulant, comme sur l'analytique repjour / PDJ.
  const { data: oldest } = useQuery({
    queryKey: ['rapro', 'oldest'],
    queryFn: fetchOldestDay,
  })
  const years = useMemo(() => {
    const start = oldest ? Number(oldest.slice(0, 4)) : currentYear
    const list: number[] = []
    for (let y = start; y <= currentYear; y++) list.push(y)
    return list.length > 0 ? list : [currentYear]
  }, [oldest])

  const monthQueries = useQueries({
    queries: MONTHS.map((m) => {
      const b = monthBounds(year, m)
      return {
        queryKey: ['rapro', 'monthly-counts', year, m],
        queryFn: () => fetchStatusCountsByRange(b.from, b.to),
      }
    }),
  })
  const loading = monthQueries.some((q) => q.isPending)

  const totals = MONTHS.map((_, i) =>
    sumCounts(monthQueries[i]?.data ?? new Map()),
  )
  const yearNettoyee = totals.reduce((s, t) => s + t.nettoyee, 0)
  const yearRefus = totals.reduce((s, t) => s + t.refus, 0)
  const yearNoshow = totals.reduce((s, t) => s + t.noshow, 0)
  const monthsWithData = totals.filter(
    (t) => t.nettoyee + t.refus + t.noshow > 0,
  ).length
  const avgNettoyee =
    monthsWithData > 0 ? Math.round(yearNettoyee / monthsWithData) : 0

  const currentMonth = now.getMonth() + 1
  const isFutureMonth = (m: number) =>
    year > currentYear || (year === currentYear && m > currentMonth)

  const chartData = useMemo(
    () =>
      MONTHS.map((m, i) => {
        const t = totals[i]
        const future = isFutureMonth(m)
        return {
          mois: MONTHS_SHORT[m - 1],
          nettoyee: future ? null : t.nettoyee,
          refus: future ? null : t.refus,
          noshow: future ? null : t.noshow,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totals, year],
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
                Nettoyées sur l'année
              </p>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">
                {yearNettoyee}
              </span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Moyenne par mois
              </p>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">
                {avgNettoyee}
              </span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Refus sur l'année
              </p>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">
                {yearRefus}
              </span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                No-shows sur l'année
              </p>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">
                {yearNoshow}
              </span>
            </div>
          </div>

          {/* Tableau mois par mois (clic = détail du mois) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-muted">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      Mois
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      Nettoyées
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      Refus
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      No-show
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((m, i) => {
                    const t = totals[i]
                    const future = isFutureMonth(m)
                    return (
                      <tr
                        key={m}
                        onClick={() =>
                          navigate({
                            to: '/rapro/analytique/$year/$month',
                            params: { year: String(year), month: String(m) },
                          })
                        }
                        className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                          future ? 'opacity-40' : ''
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-2 text-xs font-medium text-foreground">
                          {monthLabel(year, m)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium tabular-nums">
                          {t.nettoyee}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                          {t.refus}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                          {t.noshow}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/50 font-medium">
                    <td className="px-4 py-2 text-xs">Total {year}</td>
                    <td className="px-3 py-2 text-center text-xs tabular-nums">
                      {yearNettoyee}
                    </td>
                    <td className="px-3 py-2 text-center text-xs tabular-nums">
                      {yearRefus}
                    </td>
                    <td className="px-3 py-2 text-center text-xs tabular-nums">
                      {yearNoshow}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Graphiques */}
          <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <KpiLineChart
              title="Chambres nettoyées par mois"
              data={chartData}
              xKey="mois"
              realKey="nettoyee"
              realName="Nettoyées"
              tooltipFormatter={(v) => String(v)}
            />
            <KpiLineChart
              title="Refus et no-shows par mois"
              data={chartData}
              xKey="mois"
              realKey="refus"
              projKey="noshow"
              realName="Refus"
              projName="No-show"
              tooltipFormatter={(v) => String(v)}
            />
          </div>
        </>
      )}
    </div>
  )
}
