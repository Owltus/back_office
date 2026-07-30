import { useQuery } from '@tanstack/react-query'
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
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiStackedBarChart } from '#/components/analytique/KpiStackedBarChart.tsx'
import {
  RAPRO_CHART_SEGMENTS,
  RaproCatCells,
  RaproCatHead,
} from '#/components/rapro/RaproCatColumns.tsx'
import { parseDateStr } from '#/lib/poster/dateFormatter.ts'
import { CATEGORY_COLOR } from '#/lib/rapro/constants.ts'
import { capitalize } from '#/lib/utils.ts'
import {
  fetchStatusCountsByRange,
  monthBounds,
  monthlyRows,
  vendues,
} from '#/lib/rapro/monthly.ts'

/**
 * Détail d'un MOIS — harmonisé sur le socle analytique partagé. 4 cartes de
 * synthèse (nettoyées / bloquées / refus + moyenne journalière), puis le détail
 * jour par jour et un graphique des nettoyées par jour. Export PDF (base de
 * facturation ELIOR). Le mois vient des params de route ; retour à la vue
 * annuelle par le chevron.
 */

export function RaproMonthlyBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const bounds = monthBounds(year, month)

  const { data: byDay, isPending: loading } = useQuery({
    queryKey: ['rapro', 'monthly-counts', year, month],
    queryFn: () => fetchStatusCountsByRange(bounds.from, bounds.to),
  })
  const { rows, totals } = monthlyRows(year, month, byDay ?? new Map())
  // Moyenne de chambres nettoyées par jour ACTIF (au moins une donnée) : diviser
  // par tous les jours du mois fausserait la moyenne (jours vides / à venir).
  const activeDays = rows.filter(
    (r) => r.nettoyee + r.bloquee + r.refus > 0,
  ).length
  const avgCleanedPerDay = activeDays
    ? Math.round(totals.nettoyee / activeDays)
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
    bloquee: r.bloquee,
    refus: r.refus,
  }))

  const navigate = useNavigate()

  return (
    <AnalytiqueShell
      title={monthLabel}
      actions={<AnalytiqueBackButton />}
      loading={loading}
      printTitle={`Rapprochement · ${monthLabel}`}
      skeleton={{
        cols: 4,
        charts: 1,
        cards: 5,
        cardCols: 5,
        cardLines: 2,
        rows: new Date(year, month, 0).getDate(),
      }}
    >
      {/* Synthèse du mois — même ordre que la vue annuelle : moyenne / jour, puis
          vendues (total) et les 3 totaux par catégorie. */}
      <AnalytiqueCardsGrid cols={5}>
        <StatCard
          label="Moyenne nettoyées / jour"
          accent={CATEGORY_COLOR.moyenne}
          hint="Chambres nettoyées en moyenne par jour travaillé."
          value={
            <span style={{ color: CATEGORY_COLOR.moyenne }}>
              {avgCleanedPerDay}
            </span>
          }
        />
        <StatCard
          label="Vendues"
          accent={CATEGORY_COLOR.vendues}
          hint="Chambres vendues : nettoyées + bloquées + refus."
          value={
            <span style={{ color: CATEGORY_COLOR.vendues }}>
              {vendues(totals)}
            </span>
          }
        />
        <StatCard
          label="Nettoyées"
          accent={CATEGORY_COLOR.nettoyee}
          hint="Chambres nettoyées, facturées à ELIOR."
          sub={shareSub(totals.nettoyee, vendues(totals), 'des vendues')}
          value={
            <span style={{ color: CATEGORY_COLOR.nettoyee }}>
              {totals.nettoyee}
            </span>
          }
        />
        <StatCard
          label="Bloquées"
          accent={CATEGORY_COLOR.bloquee}
          hint="Chambres non nettoyées (bloquées)."
          sub={shareSub(totals.bloquee, vendues(totals), 'des vendues')}
          value={
            <span style={{ color: CATEGORY_COLOR.bloquee }}>
              {totals.bloquee}
            </span>
          }
        />
        <StatCard
          label="Refus"
          accent={CATEGORY_COLOR.refus}
          hint="Chambres refusées, hors facturation."
          sub={shareSub(totals.refus, vendues(totals), 'des vendues')}
          value={
            <span style={{ color: CATEGORY_COLOR.refus }}>{totals.refus}</span>
          }
        />
      </AnalytiqueCardsGrid>

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

      {/* Histogramme empilé par jour : nettoyées + bloquées + refus = chambres
          vendues, au code couleur des colonnes / cartes. Clic sur une colonne →
          jour du rapprochement. */}
      <AnalytiqueCharts cols={1}>
        <KpiStackedBarChart
          title="Répartition des chambres vendues par jour"
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
