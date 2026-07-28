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
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import type { KpiBarSegment } from '#/components/analytique/KpiStackedBarChart.tsx'
import {
  PdjStatCells,
  PdjStatsHead,
} from '#/components/pdj/PdjAnalytiqueParts.tsx'
import { fetchRange, fetchServiceDates } from '#/lib/pdj/service.ts'
import {
  aggregatePdjMonthly,
  MAX_CLIENTS_PER_DAY,
  yearsFromDates,
} from '#/lib/pdj/analytics.ts'
import { fmtInt, fmtPctInt } from '#/lib/pdj/format.ts'
import { MONTHS_LABELS, MONTHS_SHORT } from '#/lib/repjour/constants.ts'

/*
 * Vue analytique PDJ — gabarit calqué sur repjour/AnalytiqueBoard.
 *
 * Charge en LECTURE les lignes de l'année sélectionnée (fetchRange), les agrège
 * par mois (aggregatePdjMonthly), puis rend : cartes de synthèse annuelle,
 * tableau mois par mois et un histogramme empilé (par mois : Servis +
 * Extra + Non servis ; sur un mois sans conso saisie, repli sur l'Inclus attendu,
 * dans une couleur neutre à part). Aucune écriture Supabase — uniquement des
 * `select`. Ouvert à tous les rôles connectés en lecture (garde `ProtectedRoute`
 * sur la route).
 */

const currentYear = new Date().getFullYear()

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

  // Moyennes PAR JOUR. Inclus : par jour de service (connu partout). Servis / Extra
  // / Non servis : par jour RENSEIGNÉ (conso saisie) — sinon un jour non renseigné
  // les tirerait vers le bas. « Servis » = réservés servis (total servi − extra) →
  // même bucket que le tableau/graphe. Conversion : total servi (extras compris)
  // sur les présents. `null` si le dénominateur est nul (→ « — »).
  const summary = useMemo(() => {
    const totalDays = months.reduce((s, m) => s + m.days, 0)
    const recDays = months.reduce((s, m) => s + m.recordedDays, 0)
    const totalIncluded = months.reduce((s, m) => s + m.included, 0)
    const totalGuests = months.reduce((s, m) => s + m.guests, 0)
    const totalServed = months.reduce((s, m) => s + m.served, 0)
    const totalExtra = months.reduce((s, m) => s + (m.extra ?? 0), 0)
    const totalNonServis = months.reduce((s, m) => s + (m.noShow ?? 0), 0)
    return {
      avgInclus: totalDays > 0 ? totalIncluded / totalDays : null,
      avgServis: recDays > 0 ? (totalServed - totalExtra) / recDays : null,
      avgExtra: recDays > 0 ? totalExtra / recDays : null,
      avgNonServis: recDays > 0 ? totalNonServis / recDays : null,
      // Conversion / Remplissage : « — » si AUCUN servi sur la période (comme les
      // colonnes du tableau), pas un trompeur 0 %.
      avgConversion: totalServed > 0 ? (totalServed / totalGuests) * 100 : null,
      avgCoverage:
        totalServed > 0
          ? (totalServed / (MAX_CLIENTS_PER_DAY * totalDays)) * 100
          : null,
    }
  }, [months])

  // Une barre par mois. Mois RENSEIGNÉ (conso saisie) → empilement disjoint
  // Servis (= servi − extra) + Extra + Non servis. Mois SANS conso → repli
  // sur l'Inclus attendu (autre couleur), pour ne pas afficher une barre vide.
  const chartData = useMemo(
    () =>
      months.map((m) => {
        const mois = MONTHS_SHORT[m.month - 1]
        if (m.extra != null && m.noShow != null) {
          return {
            mois,
            servisInclus: m.served - m.extra,
            extra: m.extra,
            nonVenu: m.noShow,
            inclus: null,
          }
        }
        return {
          mois,
          servisInclus: null,
          extra: null,
          nonVenu: null,
          inclus: m.days > 0 ? m.included : null,
        }
      }),
    [months],
  )

  // Segments présents seulement s'ils portent au moins une valeur (légende propre).
  const segments = useMemo<KpiBarSegment[]>(() => {
    const segs: KpiBarSegment[] = []
    if (chartData.some((d) => d.servisInclus != null)) {
      segs.push(
        { key: 'servisInclus', name: 'Servis', color: 'var(--chart-1)' },
        { key: 'extra', name: 'Extra', color: 'var(--chart-5)' },
        { key: 'nonVenu', name: 'Non servis', color: 'var(--chart-3)' },
      )
    }
    if (chartData.some((d) => d.inclus != null)) {
      segs.push({
        key: 'inclus',
        name: 'Inclus (non saisi)',
        color: 'var(--muted-foreground)',
      })
    }
    return segs
  }, [chartData])

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
      printTitle={`PDJ · ${year}`}
      skeleton={{ cols: 9, charts: 1, rows: 12, cards: 6, cardCols: 6, cardLines: 2 }}
    >
      {/* Synthèse annuelle — moyennes par jour, aux COULEURS des buckets du graphe
          (inclus gris, servis indigo, extra vert, non servis ambre, conversion cyan). */}
      <AnalytiqueCardsGrid cols={6}>
        <StatCard
          label="Moy. inclus"
          accent="var(--muted-foreground)"
          hint="PDJ inclus par jour de service (moyenne)"
          value={summary.avgInclus != null ? fmtInt(summary.avgInclus) : '—'}
        />
        <StatCard
          label="Moy. servis"
          accent="var(--chart-1)"
          hint="Réservés servis par jour renseigné (moyenne)"
          value={summary.avgServis != null ? fmtInt(summary.avgServis) : '—'}
        />
        <StatCard
          label="Moy. extra"
          accent="var(--chart-5)"
          hint="Servis sans réservation, par jour renseigné (moyenne)"
          value={summary.avgExtra != null ? fmtInt(summary.avgExtra) : '—'}
        />
        <StatCard
          label="Moy. non servis"
          accent="var(--chart-3)"
          hint="Réservés non servis, par jour renseigné (moyenne)"
          value={
            summary.avgNonServis != null ? fmtInt(summary.avgNonServis) : '—'
          }
        />
        <StatCard
          label="Moy. conversion"
          accent="var(--chart-2)"
          hint="Part des présents servis (extras compris) = total servi ÷ présents"
          value={
            summary.avgConversion != null
              ? fmtPctInt(summary.avgConversion)
              : '—'
          }
        />
        <StatCard
          label="Moy. remplissage"
          accent="var(--chart-4)"
          hint="Part de la capacité clients servie = total servi ÷ (160/jour × jours)"
          value={
            summary.avgCoverage != null ? fmtPctInt(summary.avgCoverage) : '—'
          }
        />
      </AnalytiqueCardsGrid>

      {/* Tableau mois par mois */}
      <AnalytiqueTable head={<PdjStatsHead firstLabel="Mois" />}>
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
                  {MONTHS_LABELS[m.month - 1]}
                </td>
                <PdjStatCells
                  stats={
                    hasData
                      ? {
                          occupancy: m.avgOccupancy,
                          guests: m.guests,
                          included: m.included,
                          served: m.served,
                          extra: m.extra,
                          noShow: m.noShow,
                          potential: m.potential,
                          conversion: m.conversion,
                          coverage: m.coverage,
                        }
                      : undefined
                  }
                />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Histogramme empilé par mois : Servis + Extra + Non servis (répartition
          disjointe des PDJ) ; repli sur l'Inclus attendu, couleur neutre, quand la
          conso du mois n'a pas été saisie. */}
      <AnalytiqueCharts cols={1}>
        <KpiStackedBarChart
          title="Répartition des petits-déjeuners par mois"
          data={chartData}
          xKey="mois"
          segments={segments}
          showLegend
          tooltipFormatter={fmtInt}
          labelFormatter={(label) => {
            // L'axe X est abrégé (« Fév ») ; l'infobulle montre le mois complet.
            const i = MONTHS_SHORT.indexOf(label)
            return i >= 0 ? `${MONTHS_LABELS[i]} ${year}` : label
          }}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
