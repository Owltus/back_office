import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import type { KpiBarSegment } from '#/components/analytique/KpiStackedBarChart.tsx'
import {
  PdjStatCells,
  PdjStatsHead,
} from '#/components/pdj/PdjAnalytiqueParts.tsx'
import { fetchRange } from '#/lib/pdj/service.ts'
import { aggregatePdjDaily, MAX_CLIENTS_PER_DAY } from '#/lib/pdj/analytics.ts'
import { fmtInt, fmtPctInt } from '#/lib/pdj/format.ts'
import { DAY_NAMES, MONTHS_LABELS } from '#/lib/repjour/constants.ts'

/*
 * Détail analytique PDJ d'un mois, jour par jour — calqué sur le gabarit
 * repjour/AnalytiqueMoisBoard et harmonisé avec PdjAnalytiqueBoard (vue annuelle).
 *
 * Charge en LECTURE les lignes du mois (fetchRange), les agrège par jour
 * (aggregatePdjDaily), puis rend : cartes de synthèse du mois, tableau jour par
 * jour et un histogramme empilé (par jour : Servis + Extra + Non servis ;
 * repli sur l'Inclus attendu, couleur neutre, si la conso du jour n'a pas été
 * saisie). `year` / `month` viennent de la route (params $year/$month). Aucune
 * écriture Supabase — uniquement des `select`.
 */


export function PdjAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  // MÊME clé que la vue annuelle (`['pdj','analytics', year]`) : les lignes de
  // l'année sont lues une seule fois et partagées entre les deux vues (hit de
  // cache instantané au passage annuel → mois, et entre mois). L'agrégation par
  // jour est un calcul client négligeable, dérivé du cache.
  const { data: rows = [], isPending: loading } = useQuery({
    queryKey: ['pdj', 'analytics', year],
    queryFn: () => fetchRange(`${year}-01-01`, `${year}-12-31`),
  })
  const stats = useMemo(
    () => aggregatePdjDaily(rows, year, month),
    [rows, year, month],
  )

  // Index par numéro de jour pour peupler un tableau plein mois (1..lastDay),
  // les jours sans donnée restant en tirets grisés.
  const byDay = useMemo(() => {
    const map = new Map<number, (typeof stats)[number]>()
    for (const s of stats) map.set(s.day, s)
    return map
  }, [stats])

  const days = useMemo(
    () => Array.from({ length: lastDay }, (_, i) => i + 1),
    [lastDay],
  )

  // Moyennes par jour (cf. PdjAnalytiqueBoard). Inclus : par jour de service.
  // Servis (= servi − extra) / Extra / Non servis : par jour RENSEIGNÉ (conso saisie).
  // Conversion : total servi (extras compris) ÷ présents. `null` → « — ».
  const summary = useMemo(() => {
    const totalDays = stats.length
    const recorded = stats.filter((d) => d.extra != null)
    const recDays = recorded.length
    const totalIncluded = stats.reduce((s, d) => s + d.included, 0)
    const totalGuests = stats.reduce((s, d) => s + d.guests, 0)
    const totalServed = stats.reduce((s, d) => s + d.served, 0)
    const totalExtra = recorded.reduce((s, d) => s + (d.extra ?? 0), 0)
    const totalNonServis = recorded.reduce((s, d) => s + (d.noShow ?? 0), 0)
    return {
      avgInclus: totalDays > 0 ? totalIncluded / totalDays : 0,
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
  }, [stats])

  // Une barre par jour. Jour RENSEIGNÉ (conso saisie) → empilement disjoint Servis
  // inclus (= servi − extra) + Extra + Non servis. Jour SANS conso → repli sur
  // l'Inclus attendu (autre couleur), pour ne pas afficher une barre vide.
  const chartData = useMemo(
    () =>
      days.map((day) => {
        const s = byDay.get(day)
        const jour = String(day)
        if (s && s.extra != null && s.noShow != null) {
          return {
            jour,
            servisInclus: s.served - s.extra,
            extra: s.extra,
            nonVenu: s.noShow,
            inclus: null,
          }
        }
        return {
          jour,
          servisInclus: null,
          extra: null,
          nonVenu: null,
          inclus: s ? s.included : null,
        }
      }),
    [days, byDay],
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

  const monthLabel = MONTHS_LABELS[month - 1] || ''

  const navigate = useNavigate()

  return (
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      printTitle={`PDJ · ${monthLabel} ${year}`}
      skeleton={{
        cols: 9,
        charts: 1,
        rows: new Date(year, month, 0).getDate(),
        cards: 6,
        cardCols: 6,
        cardLines: 2,
      }}
    >
      {/* Synthèse du mois — moyennes par jour, aux COULEURS des buckets du graphe
          (inclus gris, servis indigo, extra vert, non servis ambre, conversion cyan). */}
      <AnalytiqueCardsGrid cols={6}>
        <StatCard
          label="Moy. inclus"
          accent="var(--muted-foreground)"
          hint="PDJ inclus par jour de service (moyenne)"
          value={fmtInt(summary.avgInclus)}
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

      {/* Tableau jour par jour (défile en interne, en-tête collant) */}
      <AnalytiqueTable head={<PdjStatsHead firstLabel="Jour" />}>
        <tbody>
          {days.map((day) => {
            const s = byDay.get(day)
            const hasData = !!s
            const wd = DAY_NAMES[new Date(year, month - 1, day).getDay()]
            const dayName = wd.charAt(0).toUpperCase() + wd.slice(1)
            const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
            return (
              <tr
                key={day}
                onClick={() => navigate({ to: '/pdj', search: { date } })}
                className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {dayName} {day}
                </td>
                <PdjStatCells stats={s} />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Histogramme empilé par jour : Servis + Extra + Non servis (répartition
          disjointe des PDJ) ; repli sur l'Inclus attendu, couleur neutre, quand la
          conso du jour n'a pas été saisie. */}
      <AnalytiqueCharts cols={1}>
        <KpiStackedBarChart
          title="Répartition des petits-déjeuners par jour"
          data={chartData}
          xKey="jour"
          segments={segments}
          tooltipFormatter={fmtInt}
          labelFormatter={(label) => {
            // L'axe X n'affiche que le numéro du jour ; l'infobulle donne le jour de
            // la semaine et la date complète (il y a la place au survol).
            const day = Number(label)
            if (!Number.isFinite(day)) return label
            const weekday = DAY_NAMES[new Date(year, month - 1, day).getDay()]
            const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1)
            return `${cap} ${day} ${MONTHS_LABELS[month - 1].toLowerCase()} ${year}`
          }}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
