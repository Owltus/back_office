import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft } from 'lucide-react'

import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Button } from '#/components/ui/button.tsx'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import {
  fetchCleanedByRange,
  monthBounds,
  monthlyRows,
} from '#/lib/rapro/monthly.ts'
import { printRaproMonthly } from '#/lib/rapro/pdf.ts'
import { cn } from '#/lib/utils.ts'

/**
 * Détail d'un MOIS : nombre de chambres nettoyées jour par jour + total du mois
 * (facturable ELIOR), export PDF. Le mois vient des params de route ; retour à la
 * vue annuelle par le bouton chevron.
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
    queryKey: ['rapro', 'monthly', year, month],
    queryFn: () => fetchCleanedByRange(bounds.from, bounds.to),
  })
  const { rows, total } = monthlyRows(year, month, byDay ?? new Map())

  const rawLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', {
    locale: fr,
  })
  const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)

  const [busy, setBusy] = useState(false)
  async function exportPdf() {
    setBusy(true)
    try {
      await printRaproMonthly(
        { title: monthLabel, rows, total },
        `Recap_ELIOR_${year}-${String(month).padStart(2, '0')}`,
      )
    } catch {
      // Silencieux : l'impression est un confort, pas un flux critique.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader
        title={`Ménage, ${monthLabel}`}
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => navigate({ to: '/rapro-mois' })}
              aria-label="Retour au récap annuel"
            >
              <ChevronLeft />
            </Button>
            <PrintButton onClick={exportPdf} disabled={busy} />
          </>
        }
      />

      <div className="rapro-month">
        <table className="rapro-month-table">
          <thead>
            <tr>
              <th>Jour</th>
              <th className="rapro-month-num">Chambres nettoyées</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = parseDateStr(r.date)
              const lbl = d ? format(d, 'EEE d', { locale: fr }) : String(r.day)
              return (
                <tr key={r.date}>
                  <td>{lbl}</td>
                  <td
                    className={cn(
                      'rapro-month-num',
                      r.cleaned === 0 && 'rapro-month-zero',
                    )}
                  >
                    {r.cleaned}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total du mois</td>
              <td className="rapro-month-num">{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
