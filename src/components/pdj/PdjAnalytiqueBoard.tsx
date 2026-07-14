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
import { fetchRange, fetchServiceDates } from '#/lib/pdj/service.ts'
import { aggregatePdjMonthly, yearsFromDates } from '#/lib/pdj/analytics.ts'

/*
 * Vue analytique PDJ — gabarit calqué sur repjour/AnalytiqueBoard.
 *
 * Charge en LECTURE les lignes de l'année sélectionnée (fetchRange), les agrège
 * par mois (aggregatePdjMonthly), puis rend : cartes de synthèse annuelle,
 * tableau mois par mois et deux graphiques (PDJ servis/inclus/potentiel,
 * occupation). Aucune écriture Supabase — uniquement des `select`. Ouvert à
 * tous les rôles connectés en lecture (garde `ProtectedRoute` sur la route).
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
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

export function PdjAnalytiqueBoard() {
  const navigate = useNavigate()
  const [year, setYear] = useState(currentYear)

  // Années disponibles (dérivées des jours de service en base).
  const { data: dates = [] } = useQuery({
    queryKey: ['pdj', 'dates'],
    queryFn: fetchServiceDates,
  })
  const years = useMemo(() => yearsFromDates(dates, currentYear), [dates])

  // Si l'année sélectionnée n'est pas dans la liste chargée, se caler sur la
  // plus récente.
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])

  // Lignes de l'année → agrégation mensuelle. Cache par année (retour instantané).
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics', year],
    queryFn: () => fetchRange(`${year}-01-01`, `${year}-12-31`),
  })

  const months = useMemo(() => aggregatePdjMonthly(rows, year), [rows, year])

  const summary = useMemo(() => {
    const active = months.filter((m) => m.days > 0)
    const count = active.length
    return {
      totalDays: months.reduce((s, m) => s + m.days, 0),
      totalGuests: months.reduce((s, m) => s + m.guests, 0),
      totalServed: months.reduce((s, m) => s + m.served, 0),
      totalIncluded: months.reduce((s, m) => s + m.included, 0),
      avgOccupancy:
        count > 0
          ? active.reduce((s, m) => s + m.avgOccupancy, 0) / count
          : 0,
    }
  }, [months])

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        mois: MONTHS_SHORT[m.month - 1],
        servis: m.days > 0 ? m.served : null,
        inclus: m.days > 0 ? m.included : null,
        potentiel: m.days > 0 ? m.potential : null,
        occ: m.days > 0 ? m.avgOccupancy : null,
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
      skeleton={{ cols: 6, charts: 2, rows: 12 }}
    >
      {/* Synthèse annuelle — libellé + valeur seuls (comme l'analytique
          rapprochement). Le détail vit dans le tableau. */}
      <AnalytiqueCardsGrid>
        <StatCard
          label="Taux d'occupation"
          accent="#38bdf8"
          value={fmtPct(summary.avgOccupancy)}
        />
        <StatCard
          label="Nombre de clients"
          accent="#818cf8"
          value={fmtInt(summary.totalGuests)}
        />
        <StatCard
          label="Clients inclus"
          accent="#34d399"
          value={fmtInt(summary.totalIncluded)}
        />
        <StatCard
          label="Potentiel non inclus"
          accent="#fbbf24"
          value={fmtInt(Math.max(0, summary.totalGuests - summary.totalIncluded))}
        />
      </AnalytiqueCardsGrid>

      {/* Tableau mois par mois */}
      <AnalytiqueTable
        head={
          <tr className="border-b border-border bg-muted">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Mois
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              Jours
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              <span className="hidden sm:inline">Occupation</span>
              <span className="sm:hidden">Occ.</span>
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              Clients
            </th>
            <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
              Inclus
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              Servis
            </th>
            <th className="hidden px-3 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
              Potentiel
            </th>
          </tr>
        }
      >
        <tbody>
          {months.map((m) => {
            const hasData = m.days > 0
            return (
              <tr
                key={m.month}
                onClick={() =>
                  navigate({
                    to: '/pdj/analytique/$year/$month',
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
                      {fmtInt(m.days)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                      {fmtPct(m.avgOccupancy)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                      {fmtInt(m.guests)}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                      {fmtInt(m.included)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums text-foreground">
                      {fmtInt(m.served)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground sm:table-cell">
                      {fmtInt(m.potential)}
                    </td>
                  </>
                ) : (
                  <>
                    <td
                      colSpan={4}
                      className="px-2 py-2 text-center text-xs text-muted-foreground/50"
                    >
                      —
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
                      —
                    </td>
                    <td className="hidden px-3 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
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
          title="Petits-déjeuners par mois"
          data={chartData}
          xKey="mois"
          realKey="servis"
          projKey="inclus"
          budgetKey="potentiel"
          realName="Servis"
          projName="Inclus"
          budgetName="Potentiel"
          tooltipFormatter={fmtInt}
        />
        <KpiLineChart
          title="Taux d'occupation par mois"
          data={chartData}
          xKey="mois"
          realKey="occ"
          realName="Occupation"
          yDomain={[0, 100]}
          tooltipFormatter={fmtPct}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
