import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  fetchStatusCountsByRange,
  monthBounds,
  sumCounts,
} from '#/lib/rapro/monthly.ts'

/*
 * Récap ménage ANNUEL — calqué sur l'analytique RepJour. Vue année : KPI de
 * synthèse + tableau mois par mois (nettoyées / refus / no-show), chaque ligne
 * ouvre le détail du mois (/rapro-mois/$year/$month). Un fetch borné par mois.
 */

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

function monthLabel(year: number, m: number): string {
  const l = format(new Date(year, m - 1, 1), 'MMMM', { locale: fr })
  return l.charAt(0).toUpperCase() + l.slice(1)
}

export function RaproAnalytiqueBoard() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  const monthQueries = useQueries({
    queries: MONTHS.map((m) => {
      const b = monthBounds(year, m)
      return {
        queryKey: ['rapro', 'monthly-counts', year, m],
        queryFn: () => fetchStatusCountsByRange(b.from, b.to),
      }
    }),
  })
  const totals = MONTHS.map((_, i) =>
    sumCounts(monthQueries[i]?.data ?? new Map()),
  )
  const yearNettoyee = totals.reduce((s, t) => s + t.nettoyee, 0)
  const yearRefus = totals.reduce((s, t) => s + t.refus, 0)
  const yearNoshow = totals.reduce((s, t) => s + t.noshow, 0)
  const monthsWithData = totals.filter(
    (t) => t.nettoyee + t.refus + t.noshow > 0,
  ).length
  const avgNettoyee =
    monthsWithData > 0 ? Math.round(yearNettoyee / monthsWithData) : 0

  const currentMonth = now.getMonth() + 1
  const atLatestYear = year >= now.getFullYear()

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          Rapprochement, récap {year}
        </h1>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Année précédente"
          >
            <ChevronLeft />
          </Button>
          <span className="w-12 text-center text-sm font-medium tabular-nums">
            {year}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setYear((y) => y + 1)}
            disabled={atLatestYear}
            aria-label="Année suivante"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* KPI de synthèse annuelle */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Nettoyées sur l'année
          </p>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">
            {yearNettoyee}
          </span>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Moyenne par mois
          </p>
          <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">
            {avgNettoyee}
          </span>
        </div>
      </div>

      {/* Tableau mois par mois (clic = détail du mois) */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Mois
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Nettoyées
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Refus
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  No-show
                </th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m, i) => {
                const t = totals[i]
                const isFuture =
                  year > now.getFullYear() ||
                  (year === now.getFullYear() && m > currentMonth)
                return (
                  <tr
                    key={m}
                    onClick={() =>
                      navigate({
                        to: '/rapro-mois/$year/$month',
                        params: { year: String(year), month: String(m) },
                      })
                    }
                    className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                      isFuture ? 'opacity-40' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs font-medium text-foreground">
                      {monthLabel(year, m)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium tabular-nums">
                      {t.nettoyee}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {t.refus}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {t.noshow}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-medium">
                <td className="px-4 py-2 text-xs">Total {year}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {yearNettoyee}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {yearRefus}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {yearNoshow}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
