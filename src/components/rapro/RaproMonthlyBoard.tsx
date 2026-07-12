import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { KpiLineChart } from '#/components/repjour/charts/KpiLineChart.tsx'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  monthlyRows,
} from '#/lib/rapro/monthly.ts'
import { printRaproMonthly } from '#/lib/rapro/pdf.ts'

/**
 * Détail d'un MOIS — harmonisé sur le gabarit analytique. Par jour : chambres
 * nettoyées / refus / no-show + totaux du mois, tableau au style gabarit et un
 * graphique des nettoyées par jour. Export PDF (base de facturation ELIOR). Le
 * mois vient des params de route ; retour à la vue annuelle par le chevron.
 */
export function RaproMonthlyBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const navigate = useNavigate()
  const bounds = monthBounds(year, month)

  const { data: byDay } = useQuery({
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
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6">
      <PageHeader
        title={monthLabel}
        actions={
          <>
            {/* Retour = flèche pleine ; les chevrons sont réservés au pas
                temporel, pour qu'on ne confonde pas les deux gestes. */}
            <Tip label="Retour au récap annuel">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => navigate({ to: '/rapro/analytique' })}
                aria-label="Retour au récap annuel"
              >
                <ArrowLeft />
              </Button>
            </Tip>
            <PrintButton onClick={exportPdf} disabled={busy} />
          </>
        }
      />

      {/* Tableau jour par jour */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Jour
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                  Nettoyées
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                  Refus
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                  No-show
                </th>
              </tr>
            </thead>
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
                      {r.nettoyee === 0 ? (
                        <span className="text-muted-foreground/40">0</span>
                      ) : (
                        r.nettoyee
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                      {r.refus === 0 ? (
                        <span className="text-muted-foreground/40">0</span>
                      ) : (
                        r.refus
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                      {r.noshow === 0 ? (
                        <span className="text-muted-foreground/40">0</span>
                      ) : (
                        r.noshow
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-medium">
                <td className="px-4 py-2 text-xs">Total du mois</td>
                <td className="px-3 py-2 text-center text-xs tabular-nums">
                  {totals.nettoyee}
                </td>
                <td className="px-3 py-2 text-center text-xs tabular-nums">
                  {totals.refus}
                </td>
                <td className="px-3 py-2 text-center text-xs tabular-nums">
                  {totals.noshow}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Graphique */}
      <div className="shrink-0">
        <KpiLineChart
          title="Chambres nettoyées par jour"
          data={chartData}
          xKey="jour"
          realKey="nettoyee"
          realName="Nettoyées"
          realDotRadius={2}
          tooltipFormatter={(v) => String(v)}
        />
      </div>
    </div>
  )
}
