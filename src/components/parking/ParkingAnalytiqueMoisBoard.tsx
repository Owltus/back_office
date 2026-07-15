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
import { fetchReservations } from '#/lib/parking/service.ts'
import { aggregateParkingDaily } from '#/lib/parking/analytics.ts'
import { fmtInt, fmtPct } from '#/lib/parking/format.ts'
import { MONTHS_LABELS } from '#/lib/repjour/constants.ts'

/*
 * Détail analytique d'un MOIS de parking, jour par jour — gabarit calqué sur
 * repjour/AnalytiqueMoisBoard et rapro/RaproMonthlyBoard.
 *
 * Charge en LECTURE toutes les réservations (fetchReservations, cache partagé
 * avec la vue annuelle), les agrège au jour le jour sur le mois demandé
 * (aggregateParkingDaily, occupation RÉELLE), puis rend : 4 cartes du mois,
 * tableau jour par jour et deux graphiques (occupation, arrivées). Aucune
 * écriture Supabase — uniquement des `select`. Aucun montant € (la table n'a
 * pas de tarif). `year` / `month` viennent des params de route.
 */

export function ParkingAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  // MÊME clé que la vue annuelle (`['parking','analytics']`) : toutes les
  // réservations sont lues une seule fois et partagées entre les deux vues (hit
  // de cache instantané au passage annuel → mois, et entre mois). L'agrégation
  // par jour est un calcul client négligeable, dérivé du cache.
  const { data: reservations = [], isPending: loading } = useQuery({
    queryKey: ['parking', 'analytics'],
    queryFn: fetchReservations,
  })

  const days = useMemo(
    () => aggregateParkingDaily(reservations, year, month),
    [reservations, year, month],
  )

  const summary = useMemo(() => {
    const count = days.length
    const avgOccupancy =
      count > 0 ? days.reduce((s, d) => s + d.occupancy, 0) / count : 0
    const arrivals = days.reduce((s, d) => s + d.arrivals, 0)
    const departures = days.reduce((s, d) => s + d.departures, 0)

    // Impayés : réservations dont l'arrivée tombe dans le mois, au statut
    // checkout (départ enregistré sans paiement).
    const prefix = `${year}-${String(month).padStart(2, '0')}-`
    const unpaid = reservations.filter(
      (r) => r.start_date.startsWith(prefix) && r.status === 'checkout',
    ).length

    return { avgOccupancy, arrivals, departures, unpaid }
  }, [days, reservations, year, month])

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        jour: d.day,
        occ: d.occupancy,
        arrivals: d.arrivals,
      })),
    [days],
  )

  const monthLabel = `${MONTHS_LABELS[month - 1] || ''} ${year}`

  return (
    <AnalytiqueShell
      title={monthLabel}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      skeleton={{
        cols: 4,
        charts: 2,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Cartes du mois */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Occupation moyenne"
          accent="#38bdf8"
          value={fmtPct(summary.avgOccupancy)}
        />
        <StatCard
          label="Arrivées"
          accent="#818cf8"
          value={fmtInt(summary.arrivals)}
        />
        <StatCard
          label="Départs"
          accent="#34d399"
          value={fmtInt(summary.departures)}
        />
        <StatCard
          label="Impayés"
          accent="#f87171"
          value={fmtInt(summary.unpaid)}
        />
      </AnalytiqueCardsGrid>

      {/* Tableau jour par jour */}
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
              <span className="hidden sm:inline">Occupées</span>
              <span className="sm:hidden">Occ.</span>
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              Arrivées
            </th>
            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
              Départs
            </th>
          </tr>
        }
      >
        <tbody>
          {days.map((d) => {
            const hasData = d.occupiedClient > 0
            return (
              <tr
                key={d.date}
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
                    to="/parking"
                    search={{ date: d.date }}
                    className="hover:text-primary hover:underline"
                  >
                    {d.day}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                  {fmtPct(d.occupancy)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                  {fmtInt(d.occupiedClient)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums text-muted-foreground">
                  {fmtInt(d.arrivals)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                  {fmtInt(d.departures)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
        <KpiLineChart
          title="Occupation du parking par jour"
          data={chartData}
          xKey="jour"
          realKey="occ"
          realName="Occupation"
          realDotRadius={2}
          yDomain={[0, 100]}
          tooltipFormatter={fmtPct}
        />
        <KpiLineChart
          title="Arrivées par jour"
          data={chartData}
          xKey="jour"
          realKey="arrivals"
          realName="Arrivées"
          realDotRadius={2}
          tooltipFormatter={fmtInt}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
