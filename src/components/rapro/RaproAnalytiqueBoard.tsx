import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import {
  RaproCatCells,
  RaproCatHead,
} from '#/components/rapro/RaproCatColumns.tsx'
import { fetchOldestDay } from '#/lib/rapro/service.ts'
import { CATEGORY_COLOR as CAT_COLOR } from '#/lib/rapro/constants.ts'
import { capitalize } from '#/lib/utils.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  sumCounts,
} from '#/lib/rapro/monthly.ts'

/*
 * Récap ménage ANNUEL — harmonisé sur le socle analytique partagé (repjour / PDJ).
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
  return capitalize(format(new Date(year, m - 1, 1), 'MMMM', { locale: fr }))
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
  const yearTotals = totals.reduce(
    (a, t) => ({
      nettoyee: a.nettoyee + t.nettoyee,
      bloquee: a.bloquee + t.bloquee,
      refus: a.refus + t.refus,
      noshow: a.noshow + t.noshow,
    }),
    { nettoyee: 0, bloquee: 0, refus: 0, noshow: 0 },
  )

  const currentMonth = now.getMonth() + 1
  const isFutureMonth = (m: number) =>
    year > currentYear || (year === currentYear && m > currentMonth)

  // Séries des graphiques. Recalcul direct (12 points) : `totals` est reconstruit
  // à chaque render, un useMemo n'aurait rien mémoïsé (deps toujours neuves).
  const chartData = MONTHS.map((m, i) => {
    const t = totals[i]
    const future = isFutureMonth(m)
    return {
      mois: MONTHS_SHORT[m - 1],
      nettoyee: future ? null : t.nettoyee,
      refus: future ? null : t.refus,
      noshow: future ? null : t.noshow,
    }
  })

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
      skeleton={{ cols: 4, charts: 2, cardLines: 2, rows: 13 }}
    >
      {/* Synthèse annuelle — 4 catégories, code couleur de la grille rapprochement */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Nettoyées sur l'année"
          accent={CAT_COLOR.nettoyee}
          value={
            <span style={{ color: CAT_COLOR.nettoyee }}>
              {yearTotals.nettoyee}
            </span>
          }
        />
        <StatCard
          label="Bloquées sur l'année"
          accent={CAT_COLOR.bloquee}
          value={
            <span style={{ color: CAT_COLOR.bloquee }}>
              {yearTotals.bloquee}
            </span>
          }
        />
        <StatCard
          label="Refus sur l'année"
          accent={CAT_COLOR.refus}
          value={
            <span style={{ color: CAT_COLOR.refus }}>{yearTotals.refus}</span>
          }
        />
        <StatCard
          label="No-shows sur l'année"
          accent={CAT_COLOR.noshow}
          value={
            <span style={{ color: CAT_COLOR.noshow }}>{yearTotals.noshow}</span>
          }
        />
      </AnalytiqueCardsGrid>

      {/* Tableau mois par mois (clic = détail du mois) */}
      <AnalytiqueTable head={<RaproCatHead firstLabel="Mois" />}>
        <tbody>
          {MONTHS.map((m, i) => {
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
                <RaproCatCells counts={totals[i]} />
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/50 font-medium">
            <td className="px-4 py-2 text-xs">Total {year}</td>
            <RaproCatCells counts={yearTotals} />
          </tr>
        </tfoot>
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
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
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
