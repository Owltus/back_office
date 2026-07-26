import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import {
  RaproCatCells,
  RaproCatHead,
} from '#/components/rapro/RaproCatColumns.tsx'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import { CATEGORY_COLOR } from '#/lib/rapro/constants.ts'
import { capitalize } from '#/lib/utils.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  monthlyRows,
  vendues,
} from '#/lib/rapro/monthly.ts'

/**
 * Détail d'un MOIS — harmonisé sur le socle analytique partagé. 4 cartes de
 * synthèse (nettoyées / bloquées / refus + moyenne journalière), puis le détail
 * jour par jour et un graphique des nettoyées par jour. Export PDF (base de
 * facturation ELIOR). Le mois vient des params de route ; retour à la vue
 * annuelle par le chevron.
 */

export function RaproMonthlyBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const bounds = monthBounds(year, month)

  const { data: byDay, isPending: loading } = useQuery({
    queryKey: ['rapro', 'monthly-counts', year, month],
    queryFn: () => fetchStatusCountsByRange(bounds.from, bounds.to),
  })
  const { rows, totals } = monthlyRows(year, month, byDay ?? new Map())
  // Moyenne de chambres nettoyées par jour ACTIF (au moins une donnée) : diviser
  // par tous les jours du mois fausserait la moyenne (jours vides / à venir).
  const activeDays = rows.filter(
    (r) => r.nettoyee + r.bloquee + r.refus > 0,
  ).length
  const avgCleanedPerDay = activeDays
    ? Math.round(totals.nettoyee / activeDays)
    : 0

  const monthLabel = capitalize(
    format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: fr }),
  )

  // Recalcul direct : `rows` est reconstruit à chaque render (monthlyRows), un
  // useMemo sur `[rows]` n'aurait jamais mémoïsé.
  const chartData = rows.map((r) => ({
    jour: String(r.day),
    nettoyee: r.nettoyee,
  }))

  return (
    <AnalytiqueShell
      title={monthLabel}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      printTitle={`Rapprochement · ${monthLabel}`}
      skeleton={{
        cols: 4,
        charts: 1,
        cards: 5,
        cardCols: 5,
        cardLines: 2,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Synthèse du mois — même ordre que la vue annuelle : moyenne / jour, puis
          vendues (total) et les 3 totaux par catégorie. */}
      <AnalytiqueCardsGrid cols={5}>
        <StatCard
          label="Moyenne nettoyées / jour"
          accent="#94a3b8"
          value={<span style={{ color: '#94a3b8' }}>{avgCleanedPerDay}</span>}
        />
        <StatCard
          label="Vendues"
          accent="#818cf8"
          value={<span style={{ color: '#818cf8' }}>{vendues(totals)}</span>}
        />
        <StatCard
          label="Nettoyées"
          accent={CATEGORY_COLOR.nettoyee}
          value={
            <span style={{ color: CATEGORY_COLOR.nettoyee }}>
              {totals.nettoyee}
            </span>
          }
        />
        <StatCard
          label="Bloquées"
          accent={CATEGORY_COLOR.bloquee}
          value={
            <span style={{ color: CATEGORY_COLOR.bloquee }}>
              {totals.bloquee}
            </span>
          }
        />
        <StatCard
          label="Refus"
          accent={CATEGORY_COLOR.refus}
          value={
            <span style={{ color: CATEGORY_COLOR.refus }}>{totals.refus}</span>
          }
        />
      </AnalytiqueCardsGrid>

      {/* Tableau jour par jour */}
      <AnalytiqueTable head={<RaproCatHead firstLabel="Jour" />}>
        <tbody>
          {rows.map((r) => {
            const d = parseDateStr(r.date)
            const lbl = d ? format(d, 'EEE d', { locale: fr }) : String(r.day)
            return (
              <tr key={r.date} className="border-b border-border/50">
                <td className="whitespace-nowrap px-4 py-2 text-xs font-medium text-foreground">
                  <Link
                    to="/rapro"
                    search={{ date: r.date }}
                    className="hover:text-primary hover:underline"
                  >
                    {lbl}
                  </Link>
                </td>
                <RaproCatCells counts={r} />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphique unique, pleine largeur */}
      <AnalytiqueCharts cols={1}>
        <KpiLineChart
          title="Chambres nettoyées par jour"
          data={chartData}
          xKey="jour"
          realKey="nettoyee"
          realName="Nettoyées"
          realDotRadius={2}
          tooltipFormatter={(v) => String(v)}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
