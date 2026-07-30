import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { ForecastImportButton } from '#/components/repjour/ForecastImportButton.tsx'
import {
  RepjourAnalytiqueCards,
  RepjourStatCells,
  RepjourStatsHead,
} from '#/components/repjour/boards/RepjourAnalytiqueParts.tsx'
import { subText } from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { useAnnualYear } from '#/components/analytique/useAnnualYear.ts'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import {
  fetchBudgetYears,
  fetchYearAnalytics,
  fetchYearBudget,
} from '#/lib/repjour/services/daily.ts'
import { MONTHS_LABELS, MONTHS_SHORT, TOTAL_ROOMS } from '#/lib/repjour/constants.ts'
import { fmt } from '#/lib/repjour/format.ts'

/*
 * Vue analytique annuelle — portée de la source AnalytiquePage.
 *
 * Charge en LECTURE (services/daily) l'agrégation mensuelle (réalisé / projeté /
 * forecast) + le budget de l'année, puis rend : cartes de synthèse annuelle,
 * tableau mois par mois (clic → détail du mois) et deux graphiques (CA/mois,
 * TO/mois).
 *
 * IMPORT FORECAST (admin) : un bouton à côté de l'impression permet de déposer un
 * CSV « Forecast By Date Range » couvrant une plage libre (plusieurs mois / l'année)
 * → upsert `forecast_days` via `ForecastImportButton` (parse/validation multi-mois
 * réutilisés, commit en masse `importForecastDays`). C'est la SEULE écriture de la
 * vue ; tout le reste est en lecture. Les non-admins n'ont pas le bouton mais lisent
 * la vue.
 */

const currentYear = new Date().getFullYear()

interface AnnualSummary {
  totalNuitees: number
  avgTO: number
  avgRevPAR: number
  totalRevenue: number
}

export function AnalytiqueBoard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Liste des années disponibles (budget) — mise en cache par le QueryClient.
  const { data: years = [] } = useQuery({
    queryKey: ['repjour', 'budget-years'],
    queryFn: async () => {
      const yrs = await fetchBudgetYears()
      return yrs.length > 0 ? yrs : [currentYear]
    },
  })

  // Année sélectionnée + recalage si absente de la liste (hook partagé).
  const { year, setYear } = useAnnualYear(years, currentYear)

  // Agrégation annuelle + budget de l'année. Le cache affiche instantanément,
  // mais on REFETCH à chaque ouverture (`refetchOnMount: 'always'`) : après un
  // import de rapports (fait ailleurs, sur le dashboard), la vue annuelle doit
  // refléter les nouveaux mois sans dépendre d'une invalidation qui aurait pu ne
  // pas la couvrir. Rafraîchissement en arrière-plan, sans écran de chargement.
  const { data, isPending: loading } = useQuery({
    queryKey: ['repjour', 'year-analytics', year],
    queryFn: () =>
      Promise.all([fetchYearAnalytics(year), fetchYearBudget(year)]),
    refetchOnMount: 'always',
  })
  const analytics = data?.[0] ?? []
  const budgets = data?.[1] ?? []

  // Mois PASSÉS ou EN COURS uniquement (on exclut les mois futurs — purement
  // prévisionnels — pour ne pas gonfler les cartes avec du forecast), et portant
  // des données. Alimente les CARTES ; le tableau, lui, affiche tous les mois.
  const coveredMonths = useMemo(() => {
    const cm = new Date().getMonth() + 1
    return analytics.filter(
      (m) =>
        m.daysWithData > 0 &&
        (year < currentYear || (year === currentYear && m.month <= cm)),
    )
  }, [analytics, year])

  const summary: AnnualSummary = useMemo(() => {
    const totalNuitees = coveredMonths.reduce((s, m) => s + m.nuitees, 0)
    const totalRevenue = coveredMonths.reduce((s, m) => s + m.revenue, 0)
    // TO et RevPAR annuels PONDÉRÉS par la capacité (80 ch. × jours des mois
    // couverts) — PAS une moyenne simple des taux mensuels (un mois de 28 j ne
    // pèse pas comme un mois de 31 j). = réalisé/projeté total ÷ capacité totale.
    const capacity =
      TOTAL_ROOMS *
      coveredMonths.reduce((s, m) => s + new Date(year, m.month, 0).getDate(), 0)
    return {
      totalNuitees,
      totalRevenue,
      avgTO: capacity > 0 ? (totalNuitees / capacity) * 100 : 0,
      avgRevPAR: capacity > 0 ? totalRevenue / capacity : 0,
    }
  }, [coveredMonths, year])

  // Cadence mensuelle (2e info des cartes Nuitées / CA) : total rapporté aux mois
  // couverts. « moy. X / mois ».
  const activeMonths = coveredMonths.length
  const nuiteesSub =
    activeMonths > 0
      ? subText(
          `moy. ${fmt.nuitees(Math.round(summary.totalNuitees / activeMonths))} / mois`,
        )
      : undefined
  const caSub =
    activeMonths > 0
      ? subText(`moy. ${fmt.keur(summary.totalRevenue / activeMonths)} / mois`)
      : undefined

  const currentMonth = new Date().getMonth() + 1

  const budgetByMonth = useMemo(
    () => new Map(budgets.map((b) => [b.month, b])),
    [budgets],
  )

  const chartData = useMemo(() => {
    // Dernier mois réalisé/projeté (pas forecast) pour la jonction de courbes.
    let lastRealMonth = 0
    for (const m of analytics) {
      if (m.source === 'realise' || m.source === 'projete')
        lastRealMonth = m.month
    }

    return analytics.map((m) => {
      const b = budgetByMonth.get(m.month)
      const hasData = m.source !== 'vide'
      const isReal = m.source === 'realise' || m.source === 'projete'
      return {
        mois: MONTHS_SHORT[m.month - 1],
        revenueReal: isReal && hasData ? m.revenue : null,
        revenueProj:
          m.source === 'forecast' && hasData
            ? m.revenue
            : isReal && m.month === lastRealMonth
              ? m.revenue
              : null,
        budgetRevenue: b?.room_revenue ?? 0,
        toReal: isReal && hasData ? m.to : null,
        toProj:
          m.source === 'forecast' && hasData
            ? m.to
            : isReal && m.month === lastRealMonth
              ? m.to
              : null,
        budgetTO: b?.taux_occupation ?? 0,
      }
    })
  }, [analytics, budgetByMonth])

  // En-tête d'infobulle des graphes : « Fév » → « Février 2026 » (plus lisible au
  // survol que l'abréviation de l'axe).
  const monthTooltipLabel = (label: string) => {
    const i = MONTHS_SHORT.indexOf(label)
    return i >= 0 ? `${MONTHS_LABELS[i]} ${year}` : label
  }

  return (
    <AnalytiqueShell
      title="Analytique"
      actions={
        <>
          {/* Import Forecast (admin) accolé à l'impression : dépôt d'un CSV
              couvrant une plage libre (plusieurs mois / l'année) → upsert
              forecast_days. Invalide toutes les années pour refléter l'ajout. */}
          <ForecastImportButton
            onImported={() =>
              queryClient.invalidateQueries({
                queryKey: ['repjour', 'year-analytics'],
              })
            }
          />
          <YearNav
            year={year}
            setYear={setYear}
            years={years}
            currentYear={currentYear}
          />
        </>
      }
      loading={loading}
      printTitle={`RepJour · ${year}`}
      skeleton={{ cols: 7, charts: 2, rows: 12 }}
    >
      {/* Synthèse annuelle — cartes partagées avec le détail mensuel : valeur =
          total (ou taux), 2e info = cadence « moy. X / mois ». */}
      <RepjourAnalytiqueCards
        summary={summary}
        coverage="mois en cours et passés"
        nuiteesSub={nuiteesSub}
        caSub={caSub}
      />

      {/* Tableau mois par mois — en-tête et cellules partagés avec le détail
          mensuel (colonnes strictement identiques, seule « Mois » diffère). */}
      <AnalytiqueTable head={<RepjourStatsHead firstLabel="Mois" />}>
        <tbody>
          {analytics.map((m) => {
            const b = budgetByMonth.get(m.month)
            const hasData = m.source !== 'vide'
            const isFuture =
              (year === currentYear && m.month > currentMonth) ||
              year > currentYear
            return (
              <tr
                key={m.month}
                onClick={() =>
                  navigate({
                    to: '/repjour/analytique/$year/$month',
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
                  <span className="hidden sm:inline">
                    {MONTHS_LABELS[m.month - 1]}
                  </span>
                  <span className="sm:hidden">
                    {MONTHS_SHORT[m.month - 1]}
                  </span>
                </td>
                <RepjourStatCells
                  nuitees={hasData ? m.nuitees : null}
                  to={hasData ? m.to : null}
                  pm={hasData ? m.pm : null}
                  revpar={hasData ? m.revpar : null}
                  ca={hasData ? m.revenue : null}
                  budget={b ? b.room_revenue : null}
                  ecart={hasData && b ? m.revenue - b.room_revenue : null}
                  future={isFuture}
                  overcapacity={m.hasOvercapacity}
                />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
        <KpiLineChart
          title="Chiffre d'affaires par mois"
          data={chartData}
          xKey="mois"
          realKey="revenueReal"
          projKey="revenueProj"
          budgetKey="budgetRevenue"
          projName="Projeté"
          yTickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tooltipFormatter={fmt.eurInt}
          labelFormatter={monthTooltipLabel}
        />
        <KpiLineChart
          title="Taux d'occupation par mois"
          data={chartData}
          xKey="mois"
          realKey="toReal"
          projKey="toProj"
          budgetKey="budgetTO"
          projName="Projeté"
          yDomain={[0, 100]}
          tooltipFormatter={fmt.pct}
          labelFormatter={monthTooltipLabel}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
