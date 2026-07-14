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
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      skeleton={{ cols: 4, charts: 2, rows: new Date(year, month, 0).getDate() }}
    >
      {/* Synthèse du mois */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Feuilles clôturées"
          accent="#818cf8"
          value={fmtInt(summary.totalSheets)}
        />
        <StatCard
          label="Total encaissé"
          accent="#34d399"
          value={fmtEur(summary.totalEncaisse)}
        />
        <StatCard
          label="Écart total"
          accent="#fbbf24"
          value={
            <span
              className={
                summary.totalEcart >= EPSILON ? 'text-destructive' : undefined
              }
            >
              {fmtEcart(summary.totalEcart)}
            </span>
          }
        />
        <StatCard
          label="Écart de fond"
          accent="#fb7185"
          value={
            <span
              className={
                Math.abs(summary.totalFundEcart) >= EPSILON
                  ? 'text-destructive'
                  : undefined
              }
            >
              {fmtEcart(summary.totalFundEcart)}
            </span>
          }
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
        }
      >
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
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
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
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
