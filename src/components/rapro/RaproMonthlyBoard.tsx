import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
 * Récap mensuel ELIOR : nombre de chambres nettoyées jour par jour + total du
 * mois (facturable). Navigation par mois ; export PDF. Les données viennent de
 * rapro_rooms (status='nettoyee'), agrégées par jour.
 */
export function RaproMonthlyBoard() {
  const now = new Date()
  const [ym, setYm] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  })
  const { year, month } = ym
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

  // Pas de navigation dans le futur (mois courant = borne haute).
  const atLatest =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth() + 1)

  function step(delta: number) {
    setYm((cur) => {
      const m0 = cur.month - 1 + delta
      return {
        year: cur.year + Math.floor(m0 / 12),
        month: ((m0 % 12) + 12) % 12 + 1,
      }
    })
  }

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
        title={`Récap ménage — ${monthLabel}`}
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => step(-1)}
              aria-label="Mois précédent"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => step(1)}
              disabled={atLatest}
              aria-label="Mois suivant"
            >
              <ChevronRight />
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
