import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { AnalytiqueShell, ToolbarCell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { useYearNav } from '#/components/analytique/YearNav.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import {
  RaproAnalytiqueCards,
  RAPRO_CHART_SEGMENTS,
  RaproCatCells,
  RaproCatHead,
} from '#/components/rapro/RaproCatColumns.tsx'
import { fetchOldestDay } from '#/lib/rapro/service.ts'
import { MONTHS_SHORT } from '#/lib/shared/dates.ts'
import { capitalize } from '#/lib/utils.ts'
import { cleaned, fetchRaproDailyAgg } from '#/lib/rapro/monthly.ts'

/*
 * Récap ménage ANNUEL — harmonisé sur le socle analytique partagé (repjour / PDJ).
 * Vue année : sélecteur d'année, 5 cartes de synthèse (dont la moyenne / jour
 * travaillé), tableau mois par mois (nettoyées / bloquées / refus, clic → détail
 * du mois) et un graphique. Un fetch borné par mois (12 lectures mises en
 * cache). Aucune écriture.
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

  // UNE seule lecture pour toute l'année (vue rapro_daily_agg, une ligne par jour
  // clôturé) au lieu de 12 requêtes mensuelles. Cache par année, partagé avec la
  // vue « mois » (retour instantané).
  const { data: yearMap, isPending: loading } = useQuery({
    queryKey: ['rapro', 'daily-agg', year],
    queryFn: () => fetchRaproDailyAgg(`${year}-01-01`, `${year}-12-31`),
  })

  // Décomptes par mois + nombre de jours ACTIFS (clôturés avec données), dérivés en
  // UNE passe de la Map annuelle.
  const { totals, activeDays } = useMemo(() => {
    const monthTotals = MONTHS.map(() => ({
      nettoyee: 0,
      rattrapage: 0,
      bloquee: 0,
      refus: 0,
    }))
    let days = 0
    if (yearMap) {
      for (const [date, c] of yearMap) {
        const mi = Number(date.slice(5, 7)) - 1
        if (mi < 0 || mi > 11) continue
        const t = monthTotals[mi]
        t.nettoyee += c.nettoyee
        t.rattrapage += c.rattrapage
        t.bloquee += c.bloquee
        t.refus += c.refus
        days += 1
      }
    }
    return { totals: monthTotals, activeDays: days }
  }, [yearMap])

  const yearTotals = totals.reduce(
    (a, t) => ({
      nettoyee: a.nettoyee + t.nettoyee,
      rattrapage: a.rattrapage + t.rattrapage,
      bloquee: a.bloquee + t.bloquee,
      refus: a.refus + t.refus,
    }),
    { nettoyee: 0, rattrapage: 0, bloquee: 0, refus: 0 },
  )
  // Moyenne de MÉNAGES FACTURÉS (nettoyées + rattrapages) par JOUR travaillé sur
  // l'année. Dénominateur = jours CLÔTURÉS ayant des données (la vue ne renvoie
  // que ceux-là) = taille de la Map annuelle.
  const avgCleanedPerDay = activeDays
    ? Math.round(cleaned(yearTotals) / activeDays)
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

  const { goPrev, goNext, prevDisabled, nextDisabled } = useYearNav({
    year,
    setYear,
    years,
    currentYear,
  })

  return (
    <AnalytiqueShell
      title="Analytique"
      mobileIdentity
      actions={
        <StepNav
          onPrev={goPrev}
          onNext={goNext}
          prevLabel="Année précédente"
          nextLabel="Année suivante"
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
        >
          <span className="inline-flex h-8 items-center justify-center border bg-background px-3 text-sm font-medium tabular-nums shadow-xs dark:border-input dark:bg-input/30">
            {year}
          </span>
        </StepNav>
      }
      mobileToolbar={(printCell) => (
        <>
          <ToolbarCell
            icon={<ChevronLeft className="size-5" />}
            label="Préc."
            ariaLabel="Année précédente"
            onClick={goPrev}
            disabled={prevDisabled}
            bordered={false}
          />
          {printCell}
          <ToolbarCell
            icon={<ChevronRight className="size-5" />}
            label="Suiv."
            ariaLabel="Année suivante"
            onClick={goNext}
            disabled={nextDisabled}
          />
        </>
      )}
      loading={loading}
      printTitle={`Rapprochement · ${year}`}
      skeleton={{ cols: 4, charts: 1, cards: 4, cardCols: 4, cardLines: 3, rows: 13 }}
    >
      <RaproAnalytiqueCards
        totals={yearTotals}
        avgCleanedPerDay={avgCleanedPerDay}
        activeDays={activeDays}
      />

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
