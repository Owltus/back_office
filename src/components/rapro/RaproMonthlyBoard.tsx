import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

import { AnalytiqueShell, ToolbarCell } from '#/components/analytique/AnalytiqueShell.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { useStepNavKeys } from '#/components/shared/useStepNavKeys.ts'
import {
  RaproAnalytiqueCards,
  RAPRO_CHART_SEGMENTS,
  RaproCatCells,
  RaproCatHead,
} from '#/components/rapro/RaproCatColumns.tsx'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import { capitalize } from '#/lib/utils.ts'
import { cleaned, fetchRaproDailyAgg, monthlyRows } from '#/lib/rapro/monthly.ts'
import { fetchOldestDay } from '#/lib/rapro/service.ts'

/**
 * Détail d'un MOIS — harmonisé sur le socle analytique partagé. 5 cartes de
 * synthèse (moyenne nettoyées / jour, vendues, nettoyées / bloquées / refus),
 * puis le détail jour par jour et un graphique des nettoyées par jour. Export
 * PDF (base de facturation ELIOR). Le mois vient des params de route ; retour à
 * la vue annuelle par le chevron.
 */

export function RaproMonthlyBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  // MÊME clé que la vue annuelle (`['rapro','daily-agg', year]`) : la Map de
  // l'année est lue une seule fois et partagée (retour instantané annuel ↔ mois).
  // `monthlyRows` ne lit que les jours du mois demandé dans cette Map.
  const { data: yearMap, isPending: loading } = useQuery({
    queryKey: ['rapro', 'daily-agg', year],
    queryFn: () => fetchRaproDailyAgg(`${year}-01-01`, `${year}-12-31`),
  })
  const { rows, totals } = monthlyRows(year, month, yearMap ?? new Map())
  // Moyenne de MÉNAGES FACTURÉS (nettoyées + rattrapages) par jour ACTIF (au moins
  // une donnée) : diviser par tous les jours du mois fausserait la moyenne (jours
  // vides / à venir). Un jour où il n'y a QU'un rattrapage compte comme actif.
  const activeDays = rows.filter(
    (r) => r.nettoyee + r.rattrapage + r.bloquee + r.refus > 0,
  ).length
  const avgCleanedPerDay = activeDays
    ? Math.round(cleaned(totals) / activeDays)
    : 0

  const monthLabel = capitalize(
    format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: fr }),
  )

  // Recalcul direct : `rows` est reconstruit à chaque render (monthlyRows), un
  // useMemo sur `[rows]` n'aurait jamais mémoïsé.
  const chartData = rows.map((r) => ({
    jour: String(r.day),
    day: r.day,
    nettoyee: r.nettoyee,
    rattrapage: r.rattrapage,
    bloquee: r.bloquee,
    refus: r.refus,
  }))

  const navigate = useNavigate()

  // Bornes de la navigation mois par mois : du plus ancien jour saisi (comme la
  // vue annuelle) au mois courant — jamais dans le futur.
  // Borne figée pour la session (aucun import rapro ne peut la faire reculer).
  const { data: oldest } = useQuery({
    queryKey: ['rapro', 'oldest'],
    queryFn: fetchOldestDay,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  })
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const minYear = oldest ? Number(oldest.slice(0, 4)) : currentYear
  const minMonth = oldest ? Number(oldest.slice(5, 7)) : currentMonth
  const prevDisabled = year < minYear || (year === minYear && month <= minMonth)
  const nextDisabled =
    year > currentYear || (year === currentYear && month >= currentMonth)

  const goToMonth = (y: number, m: number) =>
    navigate({
      to: '/rapro/analytique/$year/$month',
      params: { year: String(y), month: String(m) },
    })
  const goPrev = () =>
    goToMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)
  const goNext = () =>
    goToMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)
  useStepNavKeys({
    onPrev: goPrev,
    onNext: goNext,
    onToday: () => goToMonth(currentYear, currentMonth),
    prevDisabled,
    nextDisabled,
  })

  return (
    <AnalytiqueShell
      title={monthLabel}
      mobileIdentity={`Analytique ${monthLabel}`}
      actions={
        <>
          {/* enlargeOnNarrow={false} sur les deux : ce groupe n'est JAMAIS
              montré sur écran tactile (barre basse dédiée dès qu'un doigt
              est détecté, cf. AnalytiqueShell/mobileToolbar) — l'agrandir à
              un simple rétrécissement de fenêtre désaccorderait sa taille de
              celle du bouton Imprimer voisin, resté fixe. */}
          <AnalytiqueBackButton to="/rapro/analytique" enlargeOnNarrow={false} />
          <StepNav
            onPrev={goPrev}
            onNext={goNext}
            prevLabel="Mois précédent"
            nextLabel="Mois suivant"
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            enlargeOnNarrow={false}
          />
        </>
      }
      mobileToolbar={(printCell) => (
        <>
          <ToolbarCell
            icon={<ChevronLeft className="size-5" />}
            label="Préc."
            ariaLabel="Mois précédent"
            onClick={goPrev}
            disabled={prevDisabled}
            bordered={false}
          />
          <ToolbarCell
            icon={<ArrowLeft className="size-5" />}
            label="Retour"
            ariaLabel="Retour à l'analytique"
            onClick={() => navigate({ to: '/rapro/analytique' })}
          />
          {printCell}
          <ToolbarCell
            icon={<ChevronRight className="size-5" />}
            label="Suiv."
            ariaLabel="Mois suivant"
            onClick={goNext}
            disabled={nextDisabled}
          />
        </>
      )}
      loading={loading}
      printTitle={`Rapprochement · ${monthLabel}`}
      skeleton={{
        cols: 5,
        charts: 1,
        cards: 4,
        cardCols: 4,
        cardLines: 3,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      <RaproAnalytiqueCards
        totals={totals}
        avgCleanedPerDay={avgCleanedPerDay}
        activeDays={activeDays}
      />

      {/* Tableau jour par jour */}
      <AnalytiqueTable head={<RaproCatHead firstLabel="Jour" />}>
        <tbody>
          {rows.map((r) => {
            const d = parseDateStr(r.date)
            const lbl = d ? format(d, 'EEE d', { locale: fr }) : String(r.day)
            return (
              <tr
                key={r.date}
                onClick={() => navigate({ to: '/rapro', search: { date: r.date } })}
                className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40"
              >
                <td className="whitespace-nowrap px-4 py-2 text-xs font-medium text-foreground">
                  {lbl}
                </td>
                <RaproCatCells counts={r} />
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Histogramme empilé par jour : nettoyées + bloquées de la veille
          (rattrapages) + bloquées + refus, au code couleur des colonnes / cartes.
          Clic sur une colonne → jour du rapprochement. */}
      <AnalytiqueCharts cols={1}>
        <KpiStackedBarChart
          title="Répartition des chambres nettoyées par jour"
          compactMobile
          data={chartData}
          xKey="jour"
          segments={RAPRO_CHART_SEGMENTS}
          onBarClick={(p) => {
            const day = Number(p.day)
            if (Number.isFinite(day)) {
              const mm = String(month).padStart(2, '0')
              const date = `${year}-${mm}-${String(day).padStart(2, '0')}`
              navigate({ to: '/rapro', search: { date } })
            }
          }}
          tooltipFormatter={(v) => String(v)}
          labelFormatter={(label) => {
            const day = Number(label)
            if (!Number.isFinite(day)) return label
            return capitalize(
              format(new Date(year, month - 1, day), 'EEEE d MMMM', {
                locale: fr,
              }),
            )
          }}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
