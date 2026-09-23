import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { AnalytiqueShell, ToolbarCell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  StatCard,
  subText,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { AnalytiqueBackButton } from '#/components/analytique/AnalytiqueBackButton.tsx'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import {
  fetchParkingArrivals,
  fetchParkingDailyOccupation,
} from '#/lib/parking/service.ts'
import { aggregateParkingDaily } from '#/lib/parking/analytics.ts'
import { fmtEur, fmtInt, fmtPct, fmtPctInt } from '#/lib/parking/format.ts'
import { DAY_NAMES, MONTHS_LABELS } from '#/lib/repjour/constants.ts'
import { ACCENT } from '#/components/analytique/accents.ts'

/*
 * Détail analytique d'un MOIS de parking, jour par jour — gabarit calqué sur
 * repjour/AnalytiqueMoisBoard et rapro/RaproMonthlyBoard.
 *
 * Charge en LECTURE toutes les réservations (fetchReservations, cache partagé
 * avec la vue annuelle), les agrège au jour le jour sur le mois demandé
 * (aggregateParkingDaily, occupation RÉELLE), puis rend : 5 cartes du mois,
 * tableau jour par jour et un graphique (occupation). Aucune
 * écriture Supabase — uniquement des `select`. Aucun montant € (la table n'a
 * pas de tarif). `year` / `month` viennent des params de route.
 */

export function ParkingAnalytiqueMoisBoard({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const mm = String(month).padStart(2, '0')
  const nDays = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${mm}-01`
  const monthEnd = `${year}-${mm}-${String(nDays).padStart(2, '0')}`

  // Occupation RÉELLE du mois, jour par jour, depuis la vue dépliée
  // `parking_daily_occupation` BORNÉE au mois côté serveur (l'expansion des
  // séjours est faite en base, plus aucun scan de tout l'historique).
  const { data: occRows = [], isPending: loadingOcc } = useQuery({
    queryKey: ['parking', 'daily-occ', year, month],
    queryFn: () => fetchParkingDailyOccupation(monthStart, monthEnd),
  })

  // Gratuité et CA du mois, plus le CA jour par jour : réservations arrivées dans
  // le mois, lues depuis l'agrégat des arrivées (clé partagée avec l'analytique
  // annuel → cache).
  const { data: arrivalRows = [] } = useQuery({
    queryKey: ['parking', 'arrivals-all'],
    queryFn: fetchParkingArrivals,
    /*
     * ⚠ MÊME `staleTime` que la vue annuelle (`ParkingAnalytiqueBoard.tsx`) :
     * évalué PAR OBSERVATEUR, son absence ici ramenait la clé partagée à 60 s.
     * Corrigé le 2026-09-23.
     *
     * ⚠ Cette lecture n'est bornée par AUCUNE date : elle rapatrie tout
     * l'historique des arrivées pour n'en exploiter que 28 à 31 jours. Allonger
     * sa fraîcheur atténue le symptôme, pas la cause — le bornage est traité à
     * l'étape 7 du chantier du 2026-09-23.
     */
    staleTime: 10 * 60_000,
  })

  const loading = loadingOcc

  const days = useMemo(
    () => aggregateParkingDaily(occRows, year, month),
    [occRows, year, month],
  )

  // CA par jour = CA des réservations dont l'ARRIVÉE tombe ce jour (même
  // simplification que le CA mensuel : attribué au jour d'arrivée, pas
  // réparti nuit par nuit sur tout le séjour). Vient de `parking_arrivals_agg`
  // (une ligne par start_date, `ca_ht` déjà calculé au tarif en vigueur), HT
  // comme le reste de la page (pas TTC) — PAS de `parking_daily_occupation`
  // (qui déplie l'OCCUPATION, sans CA) — c'est pourquoi ce lookup est séparé
  // de `aggregateParkingDaily`.
  const caByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of arrivalRows) map.set(a.start_date, a.ca_ht ?? 0)
    return map
  }, [arrivalRows])

  const summary = useMemo(() => {
    const count = days.length
    const avgOccupancy =
      count > 0 ? days.reduce((s, d) => s + d.occupancy, 0) / count : 0
    const arrivals = days.reduce((s, d) => s + d.arrivals, 0)
    const departures = days.reduce((s, d) => s + d.departures, 0)

    // Gratuité / CA : réservations dont l'arrivée tombe dans le mois, sommées
    // depuis l'agrégat d'arrivées (même source que la vue annuelle).
    const prefix = `${year}-${mm}-`
    const monthArrivals = arrivalRows.filter((a) => a.start_date.startsWith(prefix))
    // `?? 0` : tolère une vue pas encore migrée (colonnes gratuité/CA absentes
    // le temps que le SQL soit joué en prod) sans propager de NaN.
    const free = monthArrivals.reduce((s, a) => s + (a.free ?? 0), 0)
    const caHt = monthArrivals.reduce((s, a) => s + (a.ca_ht ?? 0), 0)

    return {
      avgOccupancy,
      arrivals,
      departures,
      free,
      caHt,
      // 2e info : cadence quotidienne (moyenne sur les jours du mois).
      arrivalsPerDay: count > 0 ? arrivals / count : 0,
      departuresPerDay: count > 0 ? departures / count : 0,
      caHtPerDay: count > 0 ? caHt / count : 0,
    }
  }, [days, arrivalRows, year, mm])

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        jour: d.day,
        occ: d.occupancy,
      })),
    [days],
  )

  const monthLabel = MONTHS_LABELS[month - 1] || ''

  // En-tête d'infobulle du graphe : « 15 » → « Mardi 15 février ».
  const dayTooltipLabel = (label: string) => {
    const day = Number(label)
    if (!Number.isFinite(day) || day < 1) return label
    const wd = DAY_NAMES[new Date(year, month - 1, day).getDay()]
    return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${day} ${monthLabel.toLowerCase()}`
  }

  const navigate = useNavigate()

  return (
    <AnalytiqueShell
      title={`${monthLabel} ${year}`}
      mobileIdentity={`Analytique ${monthLabel} ${year}`}
      // enlargeOnNarrow={false} : ce bouton n'est JAMAIS montré sur écran
      // tactile (barre basse dédiée dès qu'un doigt est détecté, cf.
      // mobileToolbar) — l'agrandir à un simple rétrécissement de fenêtre
      // désaccorderait sa taille de celle du bouton Imprimer voisin, resté fixe.
      actions={
        <AnalytiqueBackButton
          to="/parking/analytique"
          enlargeOnNarrow={false}
        />
      }
      // Pas de pager mois précédent/suivant sur cette vue (contrairement à
      // RepJour/Rapro) : la navigation entre mois se fait depuis le tableau
      // annuel ou le retour ci-dessus, inchangé ici — la barre basse tactile
      // ne fait donc que reprendre ces deux mêmes actions.
      mobileToolbar={(printCell) => (
        <>
          <ToolbarCell
            icon={<ArrowLeft className="size-5" />}
            label="Retour"
            ariaLabel="Retour à l'analytique"
            onClick={() => navigate({ to: '/parking/analytique' })}
            bordered={false}
          />
          {printCell}
        </>
      )}
      loading={loading}
      printTitle={`Parking · ${monthLabel} ${year}`}
      skeleton={{
        cols: 6,
        charts: 1,
        rows: new Date(year, month, 0).getDate(),
        cards: 4,
        cardCols: 4,
      }}
    >
      {/* Cartes du mois */}
      <AnalytiqueCardsGrid cols={4}>
        <StatCard
          label="TO moyen"
          accent={ACCENT.cyan}
          value={fmtPctInt(summary.avgOccupancy)}
          hint="Places occupées en moyenne, rapportées aux places disponibles."
        />
        <StatCard
          label="Arrivées"
          accent={ACCENT.indigo}
          value={fmtInt(summary.arrivals)}
          hint="Nombre de véhicules arrivés dans le mois."
          sub={
            summary.arrivalsPerDay > 0
              ? subText(`moy. ${fmtInt(summary.arrivalsPerDay)} / jour`)
              : undefined
          }
        />
        <StatCard
          label="Départs"
          accent={ACCENT.green}
          value={fmtInt(summary.departures)}
          hint="Nombre de véhicules partis dans le mois."
          sub={
            summary.departuresPerDay > 0
              ? subText(`moy. ${fmtInt(summary.departuresPerDay)} / jour`)
              : undefined
          }
        />
        <StatCard
          label="CA Parking"
          accent={ACCENT.amber}
          value={fmtEur(summary.caHt)}
          hint="Chiffre d'affaires HT du mois (réservé/payé/non payé), hors employé et gratuité."
          sub={
            summary.caHtPerDay > 0
              ? subText(`moy. ${fmtEur(summary.caHtPerDay)} / jour`)
              : undefined
          }
        />
      </AnalytiqueCardsGrid>

      {/* Tableau jour par jour */}
      <AnalytiqueTable
        head={
          <tr className="border-b border-border bg-muted">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Jour
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.cyan }}
            >
              <span className="hidden sm:inline">Occupation</span>
              <span className="sm:hidden">Occ.</span>
            </th>
            <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              <span className="hidden sm:inline">Occupées</span>
              <span className="sm:hidden">Occ.</span>
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.slate }}
            >
              Gratuité
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.indigo }}
            >
              Arrivées
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.green }}
            >
              Départs
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.amber }}
            >
              CA
            </th>
          </tr>
        }
      >
        <tbody>
          {days.map((d) => {
            const hasData = d.occupied > 0
            return (
              <tr
                key={d.date}
                onClick={() => navigate({ to: '/parking', search: { date: d.date } })}
                className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40 ${
                  hasData ? '' : 'bg-muted/20'
                }`}
              >
                <td
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium ${
                    hasData ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {d.day}
                </td>
                {hasData ? (
                  <>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.cyan }}
                    >
                      {fmtPct(d.occupancy)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums">
                      {fmtInt(d.occupied)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.slate }}
                    >
                      {fmtInt(d.occupiedFree)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.indigo }}
                    >
                      {fmtInt(d.arrivals)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.green }}
                    >
                      {fmtInt(d.departures)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.amber }}
                    >
                      {fmtEur(caByDate.get(d.date) ?? 0)}
                    </td>
                  </>
                ) : (
                  <td
                    colSpan={6}
                    className="px-2 py-2 text-center text-xs text-muted-foreground/50"
                  >
                    —
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphique unique, pleine largeur : le taux d'occupation. */}
      <AnalytiqueCharts cols={1}>
        <KpiLineChart
          title="Occupation du parking par jour"
          data={chartData}
          xKey="jour"
          realKey="occ"
          realName="Occupation"
          realDotRadius={2}
          yDomain={[0, 100]}
          tooltipFormatter={fmtPct}
          labelFormatter={dayTooltipLabel}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
