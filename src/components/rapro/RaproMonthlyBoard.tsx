import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  monthlyRows,
} from '#/lib/rapro/monthly.ts'
import { printRaproMonthly } from '#/lib/rapro/pdf.ts'
import { cn } from '#/lib/utils.ts'

/**
 * Détail d'un MOIS : par jour, chambres nettoyées / refus / no-show + totaux du
 * mois. Export PDF (nettoyées, base de facturation ELIOR). Le mois vient des
 * params de route ; retour à la vue annuelle par le bouton chevron.
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
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
      <PageHeader
        title={`Rapprochement, ${monthLabel}`}
        actions={
          <>
            {/* Retour = flèche pleine ; les chevrons sont réservés au pas
                temporel, pour qu'on ne confonde pas les deux gestes. */}
            <Tip label="Retour au récap annuel">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => navigate({ to: '/rapro-mois' })}
                aria-label="Retour au récap annuel"
              >
                <ArrowLeft />
              </Button>
            </Tip>
            <PrintButton onClick={exportPdf} disabled={busy} />
          </>
        }
      />

      <div className="rapro-month">
        <div className="overflow-x-auto">
          <table className="rapro-month-table">
            <thead>
              <tr>
                <th>Jour</th>
                <th className="rapro-month-num">Nettoyées</th>
                <th className="rapro-month-num">Refus</th>
                <th className="rapro-month-num">No-show</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = parseDateStr(r.date)
                const lbl = d
                  ? format(d, 'EEE d', { locale: fr })
                  : String(r.day)
                return (
                  <tr key={r.date}>
                    <td>{lbl}</td>
                    <td
                      className={cn(
                        'rapro-month-num',
                        r.nettoyee === 0 && 'rapro-month-zero',
                      )}
                    >
                      {r.nettoyee}
                    </td>
                    <td
                      className={cn(
                        'rapro-month-num',
                        r.refus === 0 && 'rapro-month-zero',
                      )}
                    >
                      {r.refus}
                    </td>
                    <td
                      className={cn(
                        'rapro-month-num',
                        r.noshow === 0 && 'rapro-month-zero',
                      )}
                    >
                      {r.noshow}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total du mois</td>
                <td className="rapro-month-num">{totals.nettoyee}</td>
                <td className="rapro-month-num">{totals.refus}</td>
                <td className="rapro-month-num">{totals.noshow}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
