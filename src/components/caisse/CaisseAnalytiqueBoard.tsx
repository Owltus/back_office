import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
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
import { fmtEcart, fmtEur } from '#/lib/caisse/format.ts'

/*
 * Vue analytique Caisse — gabarit calqué sur pdj/PdjAnalytiqueBoard.
 *
 * Charge en LECTURE toutes les feuilles de caisse (fetchSheets), en dérive les
 * années disponibles puis agrège l'année sélectionnée par mois
 * (aggregateCaisseMonthly). Rend : cartes de synthèse annuelle, tableau mois par
 * mois et deux graphiques (total encaissé, écart). Aucune écriture Supabase —
 * uniquement des `select`. Ouverte à tous les rôles connectés en lecture (garde
 * `ProtectedRoute` sur la route).
 */

const currentYear = new Date().getFullYear()

const MONTHS_SHORT = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
]

export function CaisseAnalytiqueBoard() {
  const navigate = useNavigate()
  const [year, setYear] = useState(currentYear)

  // Toutes les feuilles (lecture) : dérive les années ET l'agrégation. Une seule
  // requête mise en cache — le changement d'année filtre côté client.
  const { data: sheets = [], isPending: loading } = useQuery({
    queryKey: ['caisse', 'analytics'],
    queryFn: fetchSheets,
  })

  const years = useMemo(() => yearsFromSheets(sheets, currentYear), [sheets])

  // Si l'année sélectionnée n'est pas dans la liste chargée, se caler sur la
  // plus récente.
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])

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
        ecart: m.sheets > 0 ? m.ecartTotal : null,
      })),
    [months],
  )

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
      skeleton={{ cols: 4, charts: 2, rows: 12 }}
    >
      {/* Synthèse annuelle — cartes partagées avec le détail mensuel. */}
      <CaisseAnalytiqueCards summary={summary} />

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

      {/* Graphiques */}
      <AnalytiqueCharts>
        <KpiLineChart
          title="Total encaissé par mois"
          data={chartData}
          xKey="mois"
          realKey="encaisse"
          realName="Encaissé"
          tooltipFormatter={fmtEur}
        />
        <KpiLineChart
          title="Écart par mois"
          data={chartData}
          xKey="mois"
          realKey="ecart"
          realName="Écart"
          tooltipFormatter={fmtEcart}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
