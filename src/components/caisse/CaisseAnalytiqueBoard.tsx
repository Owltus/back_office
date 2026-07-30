import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { useAnnualYear } from '#/components/analytique/useAnnualYear.ts'
import { subText } from '#/components/analytique/AnalytiqueCards.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import {
  CaisseAnalytiqueCards,
  CaisseStatCells,
  CaisseStatsHead,
} from '#/components/caisse/CaisseAnalytiqueParts.tsx'
import { fetchSheets } from '#/lib/caisse/service.ts'
import {
  aggregateCaisseMonthly,
  summarize,
  yearsFromSheets,
} from '#/lib/caisse/analytics.ts'
import { fmtEur } from '#/lib/caisse/format.ts'
import { MONTHS_LABELS, MONTHS_SHORT } from '#/lib/repjour/constants.ts'

/*
 * Vue analytique Caisse — gabarit calqué sur pdj/PdjAnalytiqueBoard.
 *
 * Charge en LECTURE toutes les feuilles de caisse (fetchSheets), en dérive les
 * années disponibles puis agrège l'année sélectionnée par mois
 * (aggregateCaisseMonthly). Rend : cartes de synthèse annuelle, tableau mois par
 * mois et un graphique (total encaissé). Aucune écriture Supabase —
 * uniquement des `select`. Ouverte à tous les rôles connectés en lecture (garde
 * `ProtectedRoute` sur la route).
 */

const currentYear = new Date().getFullYear()

export function CaisseAnalytiqueBoard() {
  const navigate = useNavigate()

  // Toutes les feuilles (lecture) : dérive les années ET l'agrégation. Une seule
  // requête mise en cache — le changement d'année filtre côté client.
  const { data: sheets = [], isPending: loading } = useQuery({
    queryKey: ['caisse', 'analytics'],
    queryFn: fetchSheets,
  })

  const years = useMemo(() => yearsFromSheets(sheets, currentYear), [sheets])

  // Année sélectionnée + recalage si absente de la liste (hook partagé).
  const { year, setYear } = useAnnualYear(years, currentYear)

  const months = useMemo(
    () => aggregateCaisseMonthly(sheets, year),
    [sheets, year],
  )

  const summary = useMemo(() => summarize(months), [months])

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        mois: MONTHS_SHORT[m.month - 1],
        encaisse: m.sheets > 0 ? m.encaisse : null,
      })),
    [months],
  )

  // En-tête d'infobulle du graphe : « Fév » → « Février 2026 ».
  const monthTooltipLabel = (label: string) => {
    const i = MONTHS_SHORT.indexOf(label)
    return i >= 0 ? `${MONTHS_LABELS[i]} ${year}` : label
  }

  // 2e info de la carte Total encaissé : moyenne par mois encaissé.
  const activeMonths = months.filter((m) => m.sheets > 0).length
  const totalSub =
    activeMonths > 0
      ? subText(`moy. ${fmtEur(summary.encaisse / activeMonths)} / mois`)
      : undefined

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
      skeleton={{ cols: 6, charts: 1, rows: 12 }}
      printTitle={`Caisse · ${year}`}
    >
      {/* Synthèse annuelle — cartes partagées avec le détail mensuel. */}
      <CaisseAnalytiqueCards summary={summary} totalSub={totalSub} />

      {/* Tableau mois par mois */}
      <AnalytiqueTable head={<CaisseStatsHead firstLabel="Mois" />}>
        <tbody>
          {months.map((m) => {
            const hasData = m.sheets > 0
            return (
              <tr
                key={m.month}
                onClick={() =>
                  navigate({
                    to: '/caisse/analytique/$year/$month',
                    params: {
                      year: String(year),
                      month: String(m.month),
                    },
                  })
                }
                className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {MONTHS_SHORT[m.month - 1]}
                </td>
                <CaisseStatCells stats={hasData ? m : undefined} />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphique unique, pleine largeur */}
      <AnalytiqueCharts cols={1}>
        <KpiLineChart
          title="Total encaissé par mois"
          data={chartData}
          xKey="mois"
          realKey="encaisse"
          realName="Encaissé"
          yTickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
          }
          tooltipFormatter={fmtEur}
          labelFormatter={monthTooltipLabel}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
