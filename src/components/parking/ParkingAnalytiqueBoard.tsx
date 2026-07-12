import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
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

  return (
    <AnalytiqueShell
      title="Analytique"
      actions={
        <YearNav
          year={year}
          setYear={setYear}
          years={years}
          currentYear={currentYear}
        />
      }
      loading={loading}
      skeleton={{ cols: 6, charts: 2 }}
    >
      {/* Synthèse annuelle */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Réservations"
          value={fmtInt(summary.totalReservations)}
          sub={
            <p className="mt-2 text-xs text-muted-foreground">
              {fmtDec(summary.avgNights)} nuits en moyenne
            </p>
          }
        />
        <StatCard
          label="Taux d'occupation moyen"
          value={fmtPct(summary.avgOccupancy)}
          sub={
            <p className="mt-2 text-xs text-muted-foreground">
              Moyenne des mois renseignés
            </p>
          }
        />
        <StatCard
          label="Nuits totales"
          value={fmtInt(summary.totalNights)}
          sub={
            <p className="mt-2 text-xs text-muted-foreground">
              places-nuits sur l'année
            </p>
          }
        />
        <StatCard
          label="Impayés"
          value={fmtInt(summary.totalUnpaid)}
          sub={
            <p className="mt-2 text-xs text-muted-foreground">
              réservations non payées
            </p>
          }
        />
      </AnalytiqueCardsGrid>

      {/* Tableau mois par mois */}
      <AnalytiqueTable
        head={
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
        }
      >
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
                    hasData ? 'text-foreground' : 'text-muted-foreground'
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
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
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
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
