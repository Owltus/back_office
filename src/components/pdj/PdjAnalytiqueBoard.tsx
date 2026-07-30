import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { useAnnualYear } from '#/components/analytique/useAnnualYear.ts'
import { ACCENT } from '#/components/analytique/accents.ts'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import type { KpiBarSegment } from '#/components/analytique/KpiStackedBarChart.tsx'
import {
  PdjAnalytiqueCards,
  PdjStatCells,
  PdjStatsHead,
} from '#/components/pdj/PdjAnalytiqueParts.tsx'
import { fetchRange, fetchServiceDates } from '#/lib/pdj/service.ts'
import { aggregatePdjMonthly, yearsFromDates } from '#/lib/pdj/analytics.ts'
import { fmtInt } from '#/lib/pdj/format.ts'
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

  // Années disponibles (dérivées des jours de service en base).
  const { data: dates = [] } = useQuery({
    queryKey: ['pdj', 'dates'],
    queryFn: fetchServiceDates,
  })
  const years = useMemo(() => yearsFromDates(dates, currentYear), [dates])

  // Année sélectionnée + recalage si absente de la liste (hook partagé).
  const { year, setYear } = useAnnualYear(years, currentYear)

  // Lignes de l'année → agrégation mensuelle. Cache par année (retour instantané).
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics', year],
    queryFn: () => fetchRange(`${year}-01-01`, `${year}-12-31`),
  })

  const months = useMemo(() => aggregatePdjMonthly(rows, year), [rows, year])

  // Moyennes PAR JOUR. Inclus : par jour de service (connu partout). Servis / Extra
  // / Non servis : par jour RENSEIGNÉ (conso saisie) — sinon un jour non renseigné
  // les tirerait vers le bas. « Servis » = TOTAL servi (extra compris), comme le
  // tableau. Captage : total servi (extras compris) sur les présents. `null` si
  // le dénominateur est nul (→ « — »).
  const summary = useMemo(() => {
    const totalDays = months.reduce((s, m) => s + m.days, 0)
    const recDays = months.reduce((s, m) => s + m.recordedDays, 0)
    const totalIncluded = months.reduce((s, m) => s + m.included, 0)
    const totalServed = months.reduce((s, m) => s + m.served, 0)
    const totalExtra = months.reduce((s, m) => s + (m.extra ?? 0), 0)
    const totalNonServis = months.reduce((s, m) => s + (m.noShow ?? 0), 0)
    // Clients des SEULS mois renseignés (servi > 0) — dénominateur des taux
    // servi-dépendants, pour ne PAS les diluer avec les mois qui n'ont que des
    // réservations (sinon le servi d'un mois se noie dans les clients de tous).
    const recGuests = months.reduce(
      (s, m) => s + (m.served > 0 ? m.guests : 0),
      0,
    )
    return {
      avgInclus: totalDays > 0 ? totalIncluded / totalDays : null,
      avgServis: recDays > 0 ? totalServed / recDays : null,
      avgExtra: recDays > 0 ? totalExtra / recDays : null,
      avgNonServis: recDays > 0 ? totalNonServis / recDays : null,
      // Totaux additionnés de la période : valeur centrale des cartes de comptage ;
      // la moyenne / jour passe en 2e info.
      totalIncluded,
      totalServed,
      totalExtra,
      totalNonServis,
      // Captage : sur les seules données RENSEIGNÉES (servi), pas dilué par les mois
      // réservés-mais-non-saisis. « — » si aucun servi.
      avgConversion: recGuests > 0 ? (totalServed / recGuests) * 100 : null,
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
            month: m.month,
            servisInclus: m.served - m.extra,
            extra: m.extra,
            nonVenu: m.noShow,
            inclus: null,
          }
        }
        return {
          mois,
          month: m.month,
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
        { key: 'servisInclus', name: 'Réservés servis', color: ACCENT.indigo },
        { key: 'extra', name: 'Extra', color: ACCENT.green },
        { key: 'nonVenu', name: 'Non servis', color: ACCENT.amber },
      )
    }
    if (chartData.some((d) => d.inclus != null)) {
      segs.push({
        key: 'inclus',
        name: 'Inclus (non saisi)',
        color: ACCENT.slate,
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
      skeleton={{ cols: 8, charts: 1, rows: 12, cards: 5, cardCols: 5, cardLines: 3 }}
    >
      <PdjAnalytiqueCards summary={summary} />

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
          legendOrder={['inclus', 'extra', 'nonVenu', 'servisInclus']}
          onBarClick={(p) => {
            // Clic sur une colonne (mois) → page détail du mois.
            const m = p.month
            if (typeof m === 'number')
              navigate({
                to: '/pdj/analytique/$year/$month',
                params: { year: String(year), month: String(m) },
              })
          }}
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
