import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  shareSub,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { useAnnualYear } from '#/components/analytique/useAnnualYear.ts'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import { fetchReservations } from '#/lib/parking/service.ts'
import {
  aggregateParkingMonthly,
  yearsFromReservations,
} from '#/lib/parking/analytics.ts'
import { fmtInt, fmtPct } from '#/lib/parking/format.ts'
import { MONTHS_LABELS, MONTHS_SHORT } from '#/lib/repjour/constants.ts'
import { ACCENT } from '#/components/analytique/accents.ts'

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

export function ParkingAnalytiqueBoard() {
  const navigate = useNavigate()

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

  // Année sélectionnée + recalage si absente de la liste (hook partagé).
  const { year, setYear } = useAnnualYear(years, currentYear)

  const months = useMemo(
    () => aggregateParkingMonthly(reservations, year),
    [reservations, year],
  )

  const summary = useMemo(() => {
    const active = months.filter((m) => m.reservations > 0)
    const count = active.length
    return {
      totalReservations: months.reduce((s, m) => s + m.reservations, 0),
      totalNights: months.reduce((s, m) => s + m.nights, 0),
      totalUnpaid: months.reduce((s, m) => s + m.unpaid, 0),
      avgOccupancy:
        count > 0 ? active.reduce((s, m) => s + m.occupancyRate, 0) / count : 0,
    }
  }, [months])

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        mois: MONTHS_SHORT[m.month - 1],
        occ: m.reservations > 0 ? m.occupancyRate : null,
      })),
    [months],
  )

  // En-tête d'infobulle du graphe : « Fév » → « Février 2026 ».
  const monthTooltipLabel = (label: string) => {
    const i = MONTHS_SHORT.indexOf(label)
    return i >= 0 ? `${MONTHS_LABELS[i]} ${year}` : label
  }

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
      printTitle={`Parking · ${year}`}
      skeleton={{ cols: 6, charts: 1, rows: 12 }}
    >
      {/* Synthèse annuelle */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Réservations"
          accent={ACCENT.indigo}
          value={fmtInt(summary.totalReservations)}
          hint="Nombre total de réservations de parking sur l'année."
        />
        <StatCard
          label="Taux d'occupation moyen"
          accent={ACCENT.cyan}
          value={fmtPct(summary.avgOccupancy)}
          hint="Places occupées en moyenne, rapportées aux places disponibles."
        />
        <StatCard
          label="Nuits totales"
          accent={ACCENT.green}
          value={fmtInt(summary.totalNights)}
          hint="Total des nuits de stationnement sur l'année."
        />
        <StatCard
          label="Impayés"
          accent={ACCENT.red}
          value={fmtInt(summary.totalUnpaid)}
          hint="Réservations parties sans paiement enregistré."
          sub={shareSub(
            summary.totalUnpaid,
            summary.totalReservations,
            'des réservations',
          )}
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

      {/* Graphique unique, pleine largeur : le taux d'occupation. */}
      <AnalytiqueCharts cols={1}>
        <KpiLineChart
          title="Taux d'occupation par mois"
          data={chartData}
          xKey="mois"
          realKey="occ"
          realName="Occupation"
          yDomain={[0, 100]}
          tooltipFormatter={fmtPct}
          labelFormatter={monthTooltipLabel}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
