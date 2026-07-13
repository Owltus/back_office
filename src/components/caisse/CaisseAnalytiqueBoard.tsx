import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import { fetchSheets } from '#/lib/caisse/service.ts'
import { aggregateCaisseMonthly, yearsFromSheets } from '#/lib/caisse/analytics.ts'
import { fmtEcart, fmtEur } from '#/lib/caisse/format.ts'
import { EPSILON } from '#/lib/caisse/constants.ts'

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

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtInt = (n: number) => nf0.format(n)

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

  const summary = useMemo(
    () => ({
      totalSheets: months.reduce((s, m) => s + m.sheets, 0),
      totalValidated: months.reduce((s, m) => s + m.validated, 0),
      totalEcart: months.reduce((s, m) => s + m.ecartTotal, 0),
      totalFundEcart: months.reduce((s, m) => s + m.fundEcart, 0),
      totalEncaisse: months.reduce((s, m) => s + m.encaisse, 0),
    }),
    [months],
  )

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
      {/* Synthèse annuelle */}
      <AnalytiqueCardsGrid>
        <StatCard label="Feuilles saisies" value={fmtInt(summary.totalSheets)}>
          <p className="mt-2 text-xs text-muted-foreground">
            {fmtInt(summary.totalValidated)} clôturée
            {summary.totalValidated > 1 ? 's' : ''}
          </p>
        </StatCard>

        <StatCard
          label="Écart total"
          value={
            <span
              className={
                summary.totalEcart >= EPSILON ? 'text-destructive' : undefined
              }
            >
              {fmtEur(summary.totalEcart)}
            </span>
          }
        >
          <p className="mt-2 text-xs text-muted-foreground">
            cumul des écarts de paiement
          </p>
        </StatCard>

        <StatCard
          label="Écart de fond"
          value={
            <span
              className={
                Math.abs(summary.totalFundEcart) >= EPSILON
                  ? 'text-destructive'
                  : undefined
              }
            >
              {fmtEcart(summary.totalFundEcart)}
            </span>
          }
        >
          <p className="mt-2 text-xs text-muted-foreground">
            cumul sur le fond de caisse
          </p>
        </StatCard>

        <StatCard label="Total encaissé" value={fmtEur(summary.totalEncaisse)}>
          <p className="mt-2 text-xs text-muted-foreground">
            réel compté, tous modes
          </p>
        </StatCard>
      </AnalytiqueCardsGrid>

      {/* Tableau mois par mois */}
      <AnalytiqueTable
        head={
          <tr className="border-b border-border bg-muted">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Mois
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              Feuilles
            </th>
            <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              <span className="hidden sm:inline">Total encaissé</span>
              <span className="sm:hidden">Encaissé</span>
            </th>
            <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              Écart
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Fond
            </th>
          </tr>
        }
      >
        <tbody>
          {months.map((m) => {
            const hasData = m.sheets > 0
            const ecartOff = m.ecartTotal >= EPSILON
            const fundOff = Math.abs(m.fundEcart) >= EPSILON
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
                {hasData ? (
                  <>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                      {fmtInt(m.sheets)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-xs font-medium tabular-nums text-foreground">
                      {fmtEur(m.encaisse)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums ${
                        ecartOff ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {fmtEur(m.ecartTotal)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums ${
                        fundOff ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {fmtEcart(m.fundEcart)}
                    </td>
                  </>
                ) : (
                  <>
                    <td
                      colSpan={2}
                      className="px-2 py-2 text-center text-xs text-muted-foreground/50"
                    >
                      —
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground/50">
                      —
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground/50">
                      —
                    </td>
                  </>
                )}
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
