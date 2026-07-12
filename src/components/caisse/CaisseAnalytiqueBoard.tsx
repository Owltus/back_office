import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
import { fetchSheets } from '#/lib/caisse/service.ts'
import { aggregateCaisseMonthly, yearsFromSheets } from '#/lib/caisse/analytics.ts'
import { fmtEcart, fmtEur } from '#/lib/caisse/format.ts'
import { EPSILON } from '#/lib/caisse/constants.ts'

/*
 * Vue analytique Caisse — gabarit calqué sur pdj/PdjAnalytiqueBoard.
 *
 * Charge en LECTURE toutes les feuilles de caisse (fetchSheets), en dérive les
 * années disponibles puis agrège l'année sélectionnée par mois
 * (aggregateCaisseMonthly). Rend : cartes de synthèse annuelle, tableau mois par
 * mois et deux graphiques (total encaissé, écart). Aucune écriture Supabase —
 * uniquement des `select`. Ouverte à tous les rôles connectés en lecture (garde
 * `ProtectedRoute` sur la route).
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

export function CaisseAnalytiqueBoard() {
  const navigate = useNavigate()
  const [year, setYear] = useState(currentYear)

  // Toutes les feuilles (lecture) : dérive les années ET l'agrégation. Une seule
  // requête mise en cache — le changement d'année filtre côté client.
  const { data: sheets = [], isPending: loading } = useQuery({
    queryKey: ['caisse', 'analytics'],
    queryFn: fetchSheets,
  })

  const years = useMemo(() => yearsFromSheets(sheets, currentYear), [sheets])

  // Si l'année sélectionnée n'est pas dans la liste chargée, se caler sur la
  // plus récente.
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])

  const months = useMemo(
    () => aggregateCaisseMonthly(sheets, year),
    [sheets, year],
  )

  const summary = useMemo(
    () => ({
      totalSheets: months.reduce((s, m) => s + m.sheets, 0),
      totalValidated: months.reduce((s, m) => s + m.validated, 0),
      totalEcart: months.reduce((s, m) => s + m.ecartTotal, 0),
      totalFundEcart: months.reduce((s, m) => s + m.fundEcart, 0),
      totalEncaisse: months.reduce((s, m) => s + m.encaisse, 0),
    }),
    [months],
  )

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        mois: MONTHS_SHORT[m.month - 1],
        encaisse: m.sheets > 0 ? m.encaisse : null,
        ecart: m.sheets > 0 ? m.ecartTotal : null,
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
                  Feuilles saisies
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.totalSheets)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {fmtInt(summary.totalValidated)} clôturée
                  {summary.totalValidated > 1 ? 's' : ''}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Écart total
                </p>
                <div className="mt-1">
                  <span
                    className={
                      summary.totalEcart >= EPSILON
                        ? 'text-2xl font-bold text-destructive'
                        : 'text-2xl font-bold text-foreground'
                    }
                  >
                    {fmtEur(summary.totalEcart)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  cumul des écarts de paiement
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Écart de fond
                </p>
                <div className="mt-1">
                  <span
                    className={
                      Math.abs(summary.totalFundEcart) >= EPSILON
                        ? 'text-2xl font-bold text-destructive'
                        : 'text-2xl font-bold text-foreground'
                    }
                  >
                    {fmtEcart(summary.totalFundEcart)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  cumul sur le fond de caisse
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total encaissé
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtEur(summary.totalEncaisse)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  réel compté, tous modes
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
                        Feuilles
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
                        <span className="hidden sm:inline">Total encaissé</span>
                        <span className="sm:hidden">Encaissé</span>
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
                        Écart
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                        Fond
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => {
                      const hasData = m.sheets > 0
                      const ecartOff = m.ecartTotal >= EPSILON
                      const fundOff = Math.abs(m.fundEcart) >= EPSILON
                      return (
                        <tr
                          key={m.month}
                          onClick={() =>
                            navigate({
                              to: '/caisse/analytique/$year/$month',
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
                                {fmtInt(m.sheets)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right text-xs font-medium tabular-nums text-foreground">
                                {fmtEur(m.encaisse)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums ${
                                  ecartOff ? 'text-destructive' : 'text-muted-foreground'
                                }`}
                              >
                                {fmtEur(m.ecartTotal)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums ${
                                  fundOff ? 'text-destructive' : 'text-muted-foreground'
                                }`}
                              >
                                {fmtEcart(m.fundEcart)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td
                                colSpan={2}
                                className="px-2 py-2 text-center text-xs text-muted-foreground/50"
                              >
                                —
                              </td>
                              <td className="px-2 py-2 text-right text-xs text-muted-foreground/50">
                                —
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-muted-foreground/50">
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
                title="Total encaissé par mois"
                data={chartData}
                xKey="mois"
                realKey="encaisse"
                realName="Encaissé"
                tooltipFormatter={fmtEur}
              />
              <KpiLineChart
                title="Écart par mois"
                data={chartData}
                xKey="mois"
                realKey="ecart"
                realName="Écart"
                tooltipFormatter={fmtEcart}
              />
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
