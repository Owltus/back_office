import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import {
  CaisseAnalytiqueCards,
  CaisseStatCells,
  CaisseStatsHead,
} from '#/components/caisse/CaisseAnalytiqueParts.tsx'
import { fetchSheets } from '#/lib/caisse/service.ts'
import { aggregateCaisseDaily, summarize } from '#/lib/caisse/analytics.ts'
import { fmtEcart, fmtEur } from '#/lib/caisse/format.ts'
import { MONTHS_LABELS } from '#/lib/repjour/constants.ts'

/*
 * Détail analytique Caisse d'un MOIS, jour par jour — gabarit calqué sur
 * repjour/AnalytiqueMoisBoard, alimenté par les feuilles de caisse (fetchSheets)
 * agrégées par jour (aggregateCaisseDaily). Rend : cartes de synthèse du mois,
 * tableau jour par jour et deux graphiques (encaissé, écart). Aucune écriture
 * Supabase — uniquement des `select`. `year` / `month` viennent des params de
 * route ; retour à la vue annuelle par la flèche.
 */

const DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export function CaisseAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  // MÊME clé que la vue annuelle (`['caisse','analytics']`) : les feuilles sont
  // lues une seule fois et partagées entre les deux vues (hit de cache instantané
  // au passage annuel → mois, et entre mois). L'agrégation par jour est un calcul
  // client négligeable, dérivé du cache.
  const { data: sheets = [], isPending: loading } = useQuery({
    queryKey: ['caisse', 'analytics'],
    queryFn: fetchSheets,
  })
  const days = useMemo(
    () => aggregateCaisseDaily(sheets, year, month),
    [sheets, year, month],
  )

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

  const summary = useMemo(() => summarize(days), [days])

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        jour: d.day,
        encaisse: d.encaisse,
        ecart: d.ecartTotal,
      })),
    [days],
  )

  const monthLabel = MONTHS_LABELS[month - 1] || ''

  return (
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      skeleton={{
        cols: 4,
        charts: 2,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Synthèse du mois — cartes partagées avec la vue annuelle. */}
      <CaisseAnalytiqueCards summary={summary} />

      {/* Tableau jour par jour */}
      <AnalytiqueTable head={<CaisseStatsHead firstLabel="Jour" />}>
        <tbody>
          {dayNums.map((day) => {
            const d = byDay.get(day)
            const hasData = !!d
            const dayName =
              DAY_NAMES_SHORT[new Date(year, month - 1, day).getDay()]
            const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
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
                <CaisseStatCells stats={d} />
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
