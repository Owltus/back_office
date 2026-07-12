import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
import { fetchReservations } from '#/lib/parking/service.ts'
import {
  aggregateParkingMonthly,
  yearsFromReservations,
} from '#/lib/parking/analytics.ts'

/*
 * Vue analytique Parking — gabarit calqué sur pdj/PdjAnalytiqueBoard.
 *
 * Charge en LECTURE toutes les réservations (fetchReservations), les agrège par
 * mois pour l'année sélectionnée (aggregateParkingMonthly), puis rend : cartes
 * de synthèse annuelle, tableau mois par mois et deux graphiques (occupation,
 * réservations). Aucune écriture Supabase — uniquement des `select`. Aucun
 * montant € (la table n'a pas de tarif). Ouvert à tous les rôles connectés en
 * lecture (garde `ProtectedRoute` sur la route).
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
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const fmtInt = (n: number) => nf0.format(n)
const fmtDec = (n: number) => nf1.format(n)
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

export function ParkingAnalytiqueBoard() {
  const navigate = useNavigate()
  const [year, setYear] = useState(currentYear)

  // Toutes les réservations (une seule lecture, mise en cache). L'agrégation par
  // année se fait ensuite en mémoire — pas de nouvelle requête par année.
  const { data: reservations = [], isPending: loading } = useQuery({
    queryKey: ['parking', 'analytics'],
    queryFn: fetchReservations,
  })

  const years = useMemo(
    () => yearsFromReservations(reservations, currentYear),
    [reservations],
  )

  // Si l'année sélectionnée n'est pas dans la liste chargée, se caler sur la
  // plus récente.
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])

  const months = useMemo(
    () => aggregateParkingMonthly(reservations, year),
    [reservations, year],
  )

  const summary = useMemo(() => {
    const active = months.filter((m) => m.reservations > 0)
    const count = active.length
    const totalReservations = months.reduce((s, m) => s + m.reservations, 0)
    const totalNights = months.reduce((s, m) => s + m.nights, 0)
    return {
      totalReservations,
      totalNights,
      totalUnpaid: months.reduce((s, m) => s + m.unpaid, 0),
      avgNights: totalReservations > 0 ? totalNights / totalReservations : 0,
      avgOccupancy:
        count > 0
          ? active.reduce((s, m) => s + m.occupancyRate, 0) / count
          : 0,
    }
  }, [months])

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        mois: MONTHS_SHORT[m.month - 1],
        occ: m.reservations > 0 ? m.occupancyRate : null,
        resas: m.reservations > 0 ? m.reservations : null,
        payees: m.reservations > 0 ? m.paid : null,
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
                  Réservations
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.totalReservations)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {fmtDec(summary.avgNights)} nuits en moyenne
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
                  Moyenne des mois renseignés
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nuits totales
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.totalNights)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  places-nuits sur l'année
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Impayés
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.totalUnpaid)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  réservations non payées
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
                        Résas
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                        <span className="hidden sm:inline">Occupation</span>
                        <span className="sm:hidden">Occ.</span>
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                        Nuits
                      </th>
                      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
                        Payées
                      </th>
                      <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
                        Réservées
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                        Impayées
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => {
                      const hasData = m.reservations > 0
                      return (
                        <tr
                          key={m.month}
                          onClick={() =>
                            navigate({
                              to: '/parking/analytique/$year/$month',
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
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-foreground">
                                {fmtInt(m.reservations)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtPct(m.occupancyRate)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtInt(m.nights)}
                              </td>
                              <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                                {fmtInt(m.paid)}
                              </td>
                              <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                                {fmtInt(m.reserved)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                                {fmtInt(m.unpaid)}
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
                              <td className="hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
                                —
                              </td>
                              <td className="px-3 py-2 text-center text-xs text-muted-foreground/50">
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
                title="Taux d'occupation par mois"
                data={chartData}
                xKey="mois"
                realKey="occ"
                realName="Occupation"
                yDomain={[0, 100]}
                tooltipFormatter={fmtPct}
              />
              <KpiLineChart
                title="Réservations par mois"
                data={chartData}
                xKey="mois"
                realKey="resas"
                projKey="payees"
                realName="Réservations"
                projName="Payées"
                tooltipFormatter={fmtInt}
              />
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
