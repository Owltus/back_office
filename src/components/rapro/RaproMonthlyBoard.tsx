import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import { CATEGORY_COLOR as CAT_COLOR } from '#/lib/rapro/constants.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  monthlyRows,
} from '#/lib/rapro/monthly.ts'
import { printRaproMonthly } from '#/lib/rapro/pdf.ts'

/**
 * Détail d'un MOIS — harmonisé sur le socle analytique partagé. Par jour :
 * chambres nettoyées / bloquées / refus / no-show + totaux du mois, tableau au
 * style socle et un graphique des nettoyées par jour. Export PDF (base de
 * facturation ELIOR). Le mois vient des params de route ; retour à la vue
 * annuelle par le chevron.
 */

/** Compteur au code couleur ; un zéro reste discret (grisé). */
function coloredCount(n: number, color: string) {
  return n === 0 ? (
    <span className="text-muted-foreground/40">0</span>
  ) : (
    <span style={{ color }}>{n}</span>
  )
}
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

  const rawLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', {
    locale: fr,
  })
  const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)

  const chartData = useMemo(
    () => rows.map((r) => ({ jour: String(r.day), nettoyee: r.nettoyee })),
    [rows],
  )

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
        cols: 4,
        charts: 1,
        cards: 0,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Tableau jour par jour */}
      <AnalytiqueTable
        head={
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
              Jour
            </th>
            <th
              className="px-3 py-2 text-center text-xs font-medium"
              style={{ color: CAT_COLOR.nettoyee }}
            >
              Nettoyée
            </th>
            <th
              className="px-3 py-2 text-center text-xs font-medium"
              style={{ color: CAT_COLOR.bloquee }}
            >
              Bloquée
            </th>
            <th
              className="px-3 py-2 text-center text-xs font-medium"
              style={{ color: CAT_COLOR.refus }}
            >
              Refus
            </th>
            <th
              className="px-3 py-2 text-center text-xs font-medium"
              style={{ color: CAT_COLOR.noshow }}
            >
              No-show
            </th>
          </tr>
        }
      >
        <tbody>
          {rows.map((r) => {
            const d = parseDateStr(r.date)
            const lbl = d
              ? format(d, 'EEE d', { locale: fr })
              : String(r.day)
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
                <td className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium tabular-nums">
                  {coloredCount(r.nettoyee, CAT_COLOR.nettoyee)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
                  {coloredCount(r.bloquee, CAT_COLOR.bloquee)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
                  {coloredCount(r.refus, CAT_COLOR.refus)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
                  {coloredCount(r.noshow, CAT_COLOR.noshow)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/50 font-medium">
            <td className="px-4 py-2 text-xs">Total du mois</td>
            <td className="px-3 py-2 text-center text-xs tabular-nums">
              {coloredCount(totals.nettoyee, CAT_COLOR.nettoyee)}
            </td>
            <td className="px-3 py-2 text-center text-xs tabular-nums">
              {coloredCount(totals.bloquee, CAT_COLOR.bloquee)}
            </td>
            <td className="px-3 py-2 text-center text-xs tabular-nums">
              {coloredCount(totals.refus, CAT_COLOR.refus)}
            </td>
            <td className="px-3 py-2 text-center text-xs tabular-nums">
              {coloredCount(totals.noshow, CAT_COLOR.noshow)}
            </td>
          </tr>
        </tfoot>
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
