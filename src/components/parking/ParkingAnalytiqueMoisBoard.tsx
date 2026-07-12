import { useMemo } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { BoardSkeleton } from '#/components/repjour/BoardSkeleton.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
import { fetchReservations } from '#/lib/parking/service.ts'
import { aggregateParkingDaily } from '#/lib/parking/analytics.ts'

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

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtInt = (n: number) => nf0.format(n)
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

export function ParkingAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const router = useRouter()

  // Toutes les réservations (une seule lecture, mise en cache et partagée avec
  // la vue annuelle). L'agrégation par jour se fait ensuite en mémoire.
  const { data: reservations = [], isPending: loading } = useQuery({
    queryKey: ['parking', 'analytics-month', year, month],
    queryFn: fetchReservations,
    enabled: Number.isFinite(year) && Number.isFinite(month),
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

  const monthLabel = `${MONTHS[month - 1] || ''} ${year}`

  return (
    <PageContainer fillHeight>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader
          title={monthLabel}
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
            {/* Cartes du mois */}
            <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Occupation moyenne
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtPct(summary.avgOccupancy)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Moyenne des jours du mois
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Arrivées
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.arrivals)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  sur le mois
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Départs
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.departures)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  sur le mois
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Impayés
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.unpaid)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  réservations non payées
                </p>
              </div>
            </div>

            {/* Tableau jour par jour */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
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
                  </thead>
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
                              hasData
                                ? 'text-foreground'
                                : 'text-muted-foreground'
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
                </table>
              </div>
            </div>

            {/* Graphiques */}
            <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
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
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
