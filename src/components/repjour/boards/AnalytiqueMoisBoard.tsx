import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  RepjourAnalytiqueCards,
  RepjourStatCells,
  RepjourStatsHead,
} from '#/components/repjour/boards/RepjourAnalytiqueParts.tsx'
import { subText } from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import { fetchUnifiedDays } from '#/lib/repjour/services/data.ts'
import { fetchBudget } from '#/lib/repjour/services/daily.ts'
import {
  DAY_NAMES,
  MONTHS_LABELS,
  TOTAL_ROOMS,
} from '#/lib/repjour/constants.ts'
import { fmt } from '#/lib/repjour/format.ts'

/*
 * Détail analytique d'un mois, jour par jour — porté de AnalytiqueMoisPage.
 *
 * Charge en LECTURE la vue unifiée du mois (rapports réalisés + prévisions via
 * fetchUnifiedDays) et le budget du mois (fetchBudget), puis rend : cartes de
 * synthèse, tableau jour par jour et deux graphiques (CA/jour, TO/jour).
 *
 * `year` / `month` sont fournis par la route (params $year/$month). Aucune
 * écriture Supabase — uniquement des `select`.
 */

interface MonthSummary {
  totalNuitees: number
  totalRevenue: number
  avgTO: number
  avgRevPAR: number
}

export function AnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  // Vue unifiée du mois + budget. Mise en cache : naviguer entre les mois puis
  // revenir est instantané (plus de refetch systématique).
  const { data, isPending: loading } = useQuery({
    queryKey: ['repjour', 'month-detail', year, month],
    queryFn: () =>
      Promise.all([
        fetchUnifiedDays({ year, month }),
        fetchBudget(year, month),
      ]),
    enabled: Number.isFinite(year) && Number.isFinite(month),
    // Refetch à l'ouverture : reflète un import récent sans dépendre du cache.
    refetchOnMount: 'always',
  })
  const rows = data?.[0] ?? []
  const budget = data?.[1] ?? null

  const now = new Date()
  const currentDay =
    now.getFullYear() === year && now.getMonth() + 1 === month
      ? now.getDate()
      : 999

  // Dernier jour à inclure dans les CARTES : mois passés ou en cours uniquement —
  // tout le mois s'il est passé, aujourd'hui si c'est le mois en cours, aucun jour
  // s'il est futur (les cartes excluent le forecast). Le tableau, lui, affiche tout.
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  const lastCardDay =
    year < nowYear || (year === nowYear && month < nowMonth)
      ? 31
      : year === nowYear && month === nowMonth
        ? now.getDate()
        : 0

  const summary: MonthSummary = useMemo(() => {
    let totalNuitees = 0
    let totalRevenue = 0
    let toSum = 0
    let revparSum = 0
    let count = 0

    for (const row of rows) {
      // Cartes = mois passés ou en cours : on ignore les jours futurs (forecast).
      if (new Date(row.date + 'T00:00:00').getDate() > lastCardDay) continue
      const r = row.report
      const f = row.forecast
      if (r) {
        totalNuitees += r.rj_nuitees
        totalRevenue += r.rj_room_revenue
        toSum += r.rj_to
        revparSum += r.rj_revpar
        count++
      } else if (f) {
        totalNuitees += f.occ
        totalRevenue += f.rev_ttc
        toSum += f.occ_percent
        revparSum += f.rev_ttc / TOTAL_ROOMS
        count++
      }
    }

    return {
      totalNuitees,
      totalRevenue,
      avgTO: count > 0 ? toSum / count : 0,
      avgRevPAR: count > 0 ? revparSum / count : 0,
    }
  }, [rows, lastCardDay])

  // Budget quotidien = objectif mensuel réparti sur les jours du mois (même base
  // que la courbe budget du graphe). Cadence des cartes = total / jours actifs.
  const dailyBudget =
    budget && rows.length > 0 ? budget.room_revenue / rows.length : null
  const activeDays = rows.filter(
    (row) =>
      new Date(row.date + 'T00:00:00').getDate() <= lastCardDay &&
      (row.report || row.forecast),
  ).length
  const nuiteesSub =
    activeDays > 0
      ? subText(
          `moy. ${fmt.nuitees(Math.round(summary.totalNuitees / activeDays))} / jour`,
        )
      : undefined
  const caSub =
    activeDays > 0
      ? subText(`moy. ${fmt.keur(summary.totalRevenue / activeDays)} / jour`)
      : undefined

  const chartData = useMemo(() => {
    const daysInMonth = rows.length
    const dailyBudgetRevenue =
      budget && daysInMonth > 0 ? budget.room_revenue / daysInMonth : 0
    const dailyBudgetTO = budget ? budget.taux_occupation : 0

    // Dernier jour avec rapport pour la jonction réalisé/forecast.
    let lastReportDay = 0
    for (const row of rows) {
      if (row.report) {
        const d = new Date(row.date + 'T00:00:00').getDate()
        if (d > lastReportDay) lastReportDay = d
      }
    }

    return rows.map((row) => {
      const day = new Date(row.date + 'T00:00:00').getDate()
      const r = row.report
      const f = row.forecast
      const hasReport = !!r
      const hasForecast = !!f

      return {
        jour: day,
        revenueReal: hasReport ? r.rj_room_revenue : null,
        revenueProj:
          !hasReport && hasForecast
            ? f.rev_ttc
            : hasReport && day === lastReportDay
              ? r.rj_room_revenue
              : null,
        budgetRevenue: dailyBudgetRevenue,
        toReal: hasReport ? r.rj_to : null,
        toProj:
          !hasReport && hasForecast
            ? f.occ_percent
            : hasReport && day === lastReportDay
              ? r.rj_to
              : null,
        budgetTO: dailyBudgetTO,
      }
    })
  }, [rows, budget])

  const monthLabel = MONTHS_LABELS[month - 1] || ''

  // En-tête d'infobulle des graphes : « 15 » → « Mardi 15 février » (jour de
  // semaine + date, plus lisible au survol que le numéro nu).
  const dayTooltipLabel = (label: string) => {
    const day = Number(label)
    if (!Number.isFinite(day) || day < 1) return label
    const wd = DAY_NAMES[new Date(year, month - 1, day).getDay()]
    return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${day} ${monthLabel.toLowerCase()}`
  }

  return (
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      printTitle={`RepJour · ${monthLabel} ${year}`}
      skeleton={{
        cols: 5,
        charts: 2,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Cartes résumé — partagées avec la vue annuelle : valeur = total (ou taux),
          2e info = cadence « moy. X / jour ». */}
      <RepjourAnalytiqueCards
        summary={summary}
        coverage="jours en cours et passés"
        nuiteesSub={nuiteesSub}
        caSub={caSub}
      />

      {/* Tableau jour par jour — en-tête et cellules partagés avec la vue annuelle
          (colonnes strictement identiques, seule « Jour » diffère). */}
      <AnalytiqueTable head={<RepjourStatsHead firstLabel="Jour" />}>
        <tbody>
          {rows.map((row) => {
            const r = row.report
            const f = row.forecast
            const hasData = !!r || !!f
            const d = new Date(row.date + 'T00:00:00')
            const dayNum = d.getDate()
            const dayName = DAY_NAMES[d.getDay()]
            const isFuture = dayNum > currentDay

            const nuitees = r ? r.rj_nuitees : f ? f.occ : null
            const to = r ? r.rj_to : f ? f.occ_percent : null
            const pm = r ? r.rj_pm : f && f.occ > 0 ? f.rev_ttc / f.occ : null
            const revpar = r ? r.rj_revpar : f ? f.rev_ttc / TOTAL_ROOMS : null
            const ca = r ? r.rj_room_revenue : f ? f.rev_ttc : null

            return (
              <tr
                key={row.date}
                className={`border-b border-border/50 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {dayName} {dayNum}
                </td>
                <RepjourStatCells
                  nuitees={nuitees}
                  to={to}
                  pm={pm}
                  revpar={revpar}
                  ca={ca}
                  budget={hasData ? dailyBudget : null}
                  ecart={
                    ca != null && dailyBudget != null ? ca - dailyBudget : null
                  }
                  future={isFuture && !r}
                  overcapacity={to != null && to > 100}
                />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphiques */}
      <AnalytiqueCharts>
        <KpiLineChart
          title="Chiffre d'affaires par jour"
          data={chartData}
          xKey="jour"
          realKey="revenueReal"
          projKey="revenueProj"
          budgetKey="budgetRevenue"
          projName="Forecast"
          realDotRadius={2}
          yTickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tooltipFormatter={fmt.eurInt}
          labelFormatter={dayTooltipLabel}
        />
        <KpiLineChart
          title="Taux d'occupation par jour"
          data={chartData}
          xKey="jour"
          realKey="toReal"
          projKey="toProj"
          budgetKey="budgetTO"
          projName="Forecast"
          realDotRadius={2}
          yDomain={[0, 100]}
          tooltipFormatter={fmt.pct}
          labelFormatter={dayTooltipLabel}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
