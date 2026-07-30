import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  shareSub,
  StatCard,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import {
  RAPRO_CHART_SEGMENTS,
  RaproCatCells,
  RaproCatHead,
} from '#/components/rapro/RaproCatColumns.tsx'
import { fetchOldestDay } from '#/lib/rapro/service.ts'
import { CATEGORY_COLOR as CAT_COLOR } from '#/lib/rapro/constants.ts'
import { MONTHS_SHORT } from '#/lib/shared/dates.ts'
import { capitalize } from '#/lib/utils.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  sumCounts,
  vendues,
} from '#/lib/rapro/monthly.ts'

/*
 * Récap ménage ANNUEL — harmonisé sur le socle analytique partagé (repjour / PDJ).
 * Vue année : sélecteur d'année, 4 cartes de synthèse (dont la moyenne / jour
 * travaillé), tableau mois par mois (nettoyées / bloquées / refus, clic → détail
 * du mois) et deux graphiques. Un
 * fetch borné par mois (12 lectures mises en cache). Aucune écriture.
 */

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const currentYear = new Date().getFullYear()

function monthLabel(year: number, m: number): string {
  return capitalize(format(new Date(year, m - 1, 1), 'MMMM', { locale: fr }))
}

export function RaproAnalytiqueBoard() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(currentYear)

  // Années disponibles (du plus ancien jour saisi à l'année courante) pour le
  // menu déroulant, comme sur l'analytique repjour / PDJ.
  const { data: oldest } = useQuery({
    queryKey: ['rapro', 'oldest'],
    queryFn: fetchOldestDay,
  })
  const years = useMemo(() => {
    const start = oldest ? Number(oldest.slice(0, 4)) : currentYear
    const list: number[] = []
    for (let y = start; y <= currentYear; y++) list.push(y)
    return list.length > 0 ? list : [currentYear]
  }, [oldest])

  const monthQueries = useQueries({
    queries: MONTHS.map((m) => {
      const b = monthBounds(year, m)
      return {
        queryKey: ['rapro', 'monthly-counts', year, m],
        queryFn: () => fetchStatusCountsByRange(b.from, b.to),
      }
    }),
  })
  const loading = monthQueries.some((q) => q.isPending)

  const totals = MONTHS.map((_, i) =>
    sumCounts(monthQueries[i]?.data ?? new Map()),
  )
  const yearTotals = totals.reduce(
    (a, t) => ({
      nettoyee: a.nettoyee + t.nettoyee,
      bloquee: a.bloquee + t.bloquee,
      refus: a.refus + t.refus,
    }),
    { nettoyee: 0, bloquee: 0, refus: 0 },
  )
  // Moyenne de chambres nettoyées par JOUR travaillé sur l'année — PAS par mois :
  // avec un seul mois saisi, « /mois » égalait le total (inutile). Dénominateur =
  // nombre de jours CLÔTURÉS ayant des données ; `fetchStatusCountsByRange` ne
  // renvoie que ceux-là (jours non clôturés exclus), donc c'est la somme des
  // tailles des Map mensuelles. Numérateur (`yearTotals`) déjà borné aux clôturés.
  const activeDays = monthQueries.reduce((n, q) => n + (q.data?.size ?? 0), 0)
  const avgCleanedPerDay = activeDays
    ? Math.round(yearTotals.nettoyee / activeDays)
    : 0

  const currentMonth = now.getMonth() + 1
  const isFutureMonth = (m: number) =>
    year > currentYear || (year === currentYear && m > currentMonth)

  // Série du graphique. Recalcul direct (12 points) : `totals` est reconstruit
  // à chaque render, un useMemo n'aurait rien mémoïsé (deps toujours neuves).
  const chartData = MONTHS.map((m, i) => {
    const t = totals[i]
    const future = isFutureMonth(m)
    return {
      mois: MONTHS_SHORT[m - 1],
      month: m,
      nettoyee: future ? null : t.nettoyee,
      bloquee: future ? null : t.bloquee,
      refus: future ? null : t.refus,
    }
  })

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
      printTitle={`Rapprochement · ${year}`}
      skeleton={{ cols: 4, charts: 1, cards: 5, cardCols: 5, cardLines: 2, rows: 13 }}
    >
      {/* Synthèse annuelle — moyenne / jour, puis vendues (total) et les 3 totaux
          par catégorie, code couleur rapprochement */}
      <AnalytiqueCardsGrid cols={5}>
        <StatCard
          label="Moyenne nettoyées / jour"
          accent={CAT_COLOR.moyenne}
          hint="Chambres nettoyées en moyenne par jour travaillé."
          value={
            <span style={{ color: CAT_COLOR.moyenne }}>{avgCleanedPerDay}</span>
          }
        />
        <StatCard
          label="Vendues sur l'année"
          accent={CAT_COLOR.vendues}
          hint="Chambres vendues : nettoyées + bloquées + refus."
          value={
            <span style={{ color: CAT_COLOR.vendues }}>
              {vendues(yearTotals)}
            </span>
          }
        />
        <StatCard
          label="Nettoyées sur l'année"
          accent={CAT_COLOR.nettoyee}
          hint="Chambres nettoyées, facturées à ELIOR."
          sub={shareSub(yearTotals.nettoyee, vendues(yearTotals), 'des vendues')}
          value={
            <span style={{ color: CAT_COLOR.nettoyee }}>
              {yearTotals.nettoyee}
            </span>
          }
        />
        <StatCard
          label="Bloquées sur l'année"
          accent={CAT_COLOR.bloquee}
          hint="Chambres non nettoyées (bloquées)."
          sub={shareSub(yearTotals.bloquee, vendues(yearTotals), 'des vendues')}
          value={
            <span style={{ color: CAT_COLOR.bloquee }}>
              {yearTotals.bloquee}
            </span>
          }
        />
        <StatCard
          label="Refus sur l'année"
          accent={CAT_COLOR.refus}
          hint="Chambres refusées, hors facturation."
          sub={shareSub(yearTotals.refus, vendues(yearTotals), 'des vendues')}
          value={
            <span style={{ color: CAT_COLOR.refus }}>{yearTotals.refus}</span>
          }
        />
      </AnalytiqueCardsGrid>

      {/* Tableau mois par mois (clic = détail du mois) */}
      <AnalytiqueTable head={<RaproCatHead firstLabel="Mois" />}>
        <tbody>
          {MONTHS.map((m, i) => {
            const future = isFutureMonth(m)
            return (
              <tr
                key={m}
                onClick={() =>
                  navigate({
                    to: '/rapro/analytique/$year/$month',
                    params: { year: String(year), month: String(m) },
                  })
                }
                className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                  future ? 'opacity-40' : ''
                }`}
              >
                <td className="whitespace-nowrap px-4 py-2 text-xs font-medium text-foreground">
                  {monthLabel(year, m)}
                </td>
                <RaproCatCells counts={totals[i]} />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Histogramme empilé : nettoyées + bloquées + refus = chambres vendues,
          au code couleur des colonnes / cartes. Clic sur une colonne → détail du
          mois (comme le tableau). */}
      <AnalytiqueCharts cols={1}>
        <KpiStackedBarChart
          title="Répartition des chambres vendues par mois"
          data={chartData}
          xKey="mois"
          segments={RAPRO_CHART_SEGMENTS}
          onBarClick={(p) => {
            const m = p.month
            if (typeof m === 'number')
              navigate({
                to: '/rapro/analytique/$year/$month',
                params: { year: String(year), month: String(m) },
              })
          }}
          tooltipFormatter={(v) => String(v)}
          labelFormatter={(label) => {
            const i = MONTHS_SHORT.indexOf(label)
            return i >= 0 ? `${monthLabel(year, i + 1)} ${year}` : label
          }}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
