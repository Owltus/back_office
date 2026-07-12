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
import { fetchSheets } from '#/lib/caisse/service.ts'
import { aggregateCaisseDaily } from '#/lib/caisse/analytics.ts'
import { fmtEcart, fmtEur } from '#/lib/caisse/format.ts'
import { EPSILON } from '#/lib/caisse/constants.ts'

/*
 * Détail analytique Caisse d'un MOIS, jour par jour — gabarit calqué sur
 * repjour/AnalytiqueMoisBoard, alimenté par les feuilles de caisse (fetchSheets)
 * agrégées par jour (aggregateCaisseDaily). Rend : cartes de synthèse du mois,
 * tableau jour par jour et deux graphiques (encaissé, écart). Aucune écriture
 * Supabase — uniquement des `select`. `year` / `month` viennent des params de
 * route ; retour à la vue annuelle par la flèche.
 */

const MOIS = [
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

export function CaisseAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const router = useRouter()

  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  const { data: days = [], isPending: loading } = useQuery({
    queryKey: ['caisse', 'analytics-month', year, month],
    queryFn: async () => aggregateCaisseDaily(await fetchSheets(), year, month),
    enabled: Number.isFinite(year) && Number.isFinite(month),
  })

  // Index par numéro de jour pour peupler un tableau plein mois (1..lastDay),
  // les jours sans feuille restant en tirets grisés.
  const byDay = useMemo(() => {
    const map = new Map<number, (typeof days)[number]>()
    for (const d of days) map.set(d.day, d)
    return map
  }, [days])

  const dayNums = useMemo(
    () => Array.from({ length: lastDay }, (_, i) => i + 1),
    [lastDay],
  )

  const summary = useMemo(
    () => ({
      totalSheets: days.reduce((s, d) => s + d.sheets, 0),
      totalEncaisse: days.reduce((s, d) => s + d.encaisse, 0),
      totalEcart: days.reduce((s, d) => s + d.ecartTotal, 0),
      totalFundEcart: days.reduce((s, d) => s + d.fundEcart, 0),
    }),
    [days],
  )

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        jour: d.day,
        encaisse: d.encaisse,
        ecart: d.ecartTotal,
      })),
    [days],
  )

  const monthLabel = MOIS[month - 1] || ''

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
                  Feuilles saisies
                </p>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {fmtInt(summary.totalSheets)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {days.length} jour{days.length > 1 ? 's' : ''} saisi
                  {days.length > 1 ? 's' : ''}
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
                    {fmtEcart(summary.totalEcart)}
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
                        Feuilles
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
                        Encaissé
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
                    {dayNums.map((day) => {
                      const d = byDay.get(day)
                      const hasData = !!d
                      const dayName =
                        DAY_NAMES_SHORT[new Date(year, month - 1, day).getDay()]
                      const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
                      const ecartOff = d ? d.ecartTotal >= EPSILON : false
                      const fundOff = d ? Math.abs(d.fundEcart) >= EPSILON : false
                      return (
                        <tr
                          key={day}
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
                              to="/caisse"
                              search={{ date }}
                              className="hover:text-primary hover:underline"
                            >
                              {dayName} {day}
                            </Link>
                          </td>
                          {hasData ? (
                            <>
                              <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                                {fmtInt(d.sheets)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right text-xs font-medium tabular-nums text-foreground">
                                {fmtEur(d.encaisse)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums ${
                                  ecartOff ? 'text-destructive' : 'text-muted-foreground'
                                }`}
                              >
                                {fmtEur(d.ecartTotal)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums ${
                                  fundOff ? 'text-destructive' : 'text-muted-foreground'
                                }`}
                              >
                                {fmtEcart(d.fundEcart)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
                                —
                              </td>
                              <td className="px-2 py-2 text-right text-xs text-muted-foreground/50">
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
                title="Encaissé par jour"
                data={chartData}
                xKey="jour"
                realKey="encaisse"
                realName="Encaissé"
                realDotRadius={2}
                yTickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
                tooltipFormatter={fmtEur}
              />
              <KpiLineChart
                title="Écart par jour"
                data={chartData}
                xKey="jour"
                realKey="ecart"
                realName="Écart"
                realDotRadius={2}
                tooltipFormatter={fmtEcart}
              />
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
