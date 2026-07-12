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
import { fetchRange } from '#/lib/pdj/service.ts'
import { aggregatePdjDaily } from '#/lib/pdj/analytics.ts'

/*
 * Détail analytique PDJ d'un mois, jour par jour — calqué sur le gabarit
 * repjour/AnalytiqueMoisBoard et harmonisé avec PdjAnalytiqueBoard (vue annuelle).
 *
 * Charge en LECTURE les lignes du mois (fetchRange), les agrège par jour
 * (aggregatePdjDaily), puis rend : cartes de synthèse du mois, tableau jour par
 * jour et deux graphiques (PDJ servis/inclus/potentiel, occupation). `year` /
 * `month` viennent de la route (params $year/$month). Aucune écriture Supabase
 * — uniquement des `select`.
 */

const MONTHS_LABELS = [
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

const DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtInt = (n: number) => nf0.format(n)
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

export function PdjAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const router = useRouter()

  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  // Lignes du mois → agrégation par jour. Cache par (année, mois) : naviguer
  // puis revenir est instantané.
  const { data: stats = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics-month', year, month],
    queryFn: () =>
      fetchRange(
        `${year}-${mm}-01`,
        `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
      ).then((rows) => aggregatePdjDaily(rows, year, month)),
    enabled: Number.isFinite(year) && Number.isFinite(month),
  })

  // Index par numéro de jour pour peupler un tableau plein mois (1..lastDay),
  // les jours sans donnée restant en tirets grisés.
  const byDay = useMemo(() => {
    const map = new Map<number, (typeof stats)[number]>()
    for (const s of stats) map.set(s.day, s)
    return map
  }, [stats])

  const days = useMemo(
    () => Array.from({ length: lastDay }, (_, i) => i + 1),
    [lastDay],
  )

  const summary = useMemo(() => {
    const count = stats.length
    return {
      coveredDays: count,
      totalGuests: stats.reduce((s, d) => s + d.guests, 0),
      totalServed: stats.reduce((s, d) => s + d.served, 0),
      totalIncluded: stats.reduce((s, d) => s + d.included, 0),
      totalPotential: stats.reduce((s, d) => s + d.potential, 0),
      avgOccupancy:
        count > 0 ? stats.reduce((s, d) => s + d.occupancy, 0) / count : 0,
    }
  }, [stats])

  const chartData = useMemo(
    () =>
      days.map((day) => {
        const s = byDay.get(day)
        return {
          jour: String(day),
          servis: s ? s.served : null,
          inclus: s ? s.included : null,
          potentiel: s ? s.potential : null,
          occ: s ? s.occupancy : null,
        }
      }),
    [days, byDay],
  )

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
            {/* Synthèse du mois */}
            <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Jours couverts
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.coveredDays)}
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
                    {fmtInt(summary.totalPotential)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  clients sans PDJ inclus
                </p>
              </div>
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
                    {days.map((day) => {
                      const s = byDay.get(day)
                      const hasData = !!s
                      const dayName =
                        DAY_NAMES_SHORT[new Date(year, month - 1, day).getDay()]
                      const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
                      return (
                        <tr
                          key={day}
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
                              to="/pdj"
                              search={{ date }}
                              className="hover:text-primary hover:underline"
                            >
                              {dayName} {day}
                            </Link>
                          </td>
                          {hasData ? (
                            <>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtPct(s.occupancy)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtInt(s.guests)}
                              </td>
                              <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                                {fmtInt(s.included)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-foreground">
                                {fmtInt(s.served)}
                              </td>
                              <td className="hidden whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell">
                                {fmtInt(s.potential)}
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
                title="Petits-déjeuners par jour"
                data={chartData}
                xKey="jour"
                realKey="servis"
                projKey="inclus"
                budgetKey="potentiel"
                realName="Servis"
                projName="Inclus"
                budgetName="Potentiel"
                realDotRadius={2}
                tooltipFormatter={fmtInt}
              />
              <KpiLineChart
                title="Taux d'occupation par jour"
                data={chartData}
                xKey="jour"
                realKey="occ"
                realName="Occupation"
                realDotRadius={2}
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
