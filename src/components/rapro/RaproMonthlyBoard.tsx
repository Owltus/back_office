import { useState } from 'react'
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
import { PrintButton } from '#/components/shared/PrintButton.tsx'
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
} from '#/lib/rapro/monthly.ts'
import { printRaproMonthly } from '#/lib/rapro/pdf.ts'

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

  const [busy, setBusy] = useState(false)
  async function exportPdf() {
    setBusy(true)
    try {
      await printRaproMonthly(
        {
          title: monthLabel,
          rows: rows.map((r) => ({
            date: r.date,
            day: r.day,
            cleaned: r.nettoyee,
          })),
          total: totals.nettoyee,
        },
        `Recap_ELIOR_${year}-${String(month).padStart(2, '0')}`,
      )
    } catch {
      // Silencieux : l'impression est un confort, pas un flux critique.
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnalytiqueShell
      title={monthLabel}
      actions={
        <>
          <AnalytiqueBackButton />
          <PrintButton onClick={exportPdf} disabled={busy} />
        </>
      }
      loading={loading}
      skeleton={{
        cols: 3,
        charts: 1,
        cards: 4,
        cardLines: 2,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Synthèse du mois — 3 totaux + moyenne journalière, mêmes couleurs. */}
      <AnalytiqueCardsGrid>
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
        <StatCard
          label="Moyenne nettoyées / jour"
          accent="#818cf8"
          value={<span style={{ color: '#818cf8' }}>{avgCleanedPerDay}</span>}
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

      {/* Graphique */}
      <AnalytiqueCharts>
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
