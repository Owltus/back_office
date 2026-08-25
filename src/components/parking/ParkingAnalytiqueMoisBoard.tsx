import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { AnalytiqueShell, ToolbarCell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  shareSub,
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
import { fetchUnifiedDays } from '#/lib/repjour/services/data.ts'
import {
  aggregateParkingDaily,
  captageIndex,
} from '#/lib/parking/analytics.ts'
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

  // Impayés du mois : réservations arrivées dans le mois au statut checkout, lues
  // depuis l'agrégat des arrivées (clé partagée avec l'analytique annuel → cache).
  const { data: arrivalRows = [] } = useQuery({
    queryKey: ['parking', 'arrivals-all'],
    queryFn: fetchParkingArrivals,
  })

  // Occupation HÔTEL du mois, jour par jour (rj_nuitees = chambres occupées la
  // nuit) — dénominateur du captage. Même service que l'analytique repjour, clé
  // de cache propre au parking.
  const { data: hotelDays = [], isPending: loadingHotel } = useQuery({
    queryKey: ['parking', 'hotel-month', year, month],
    queryFn: () => fetchUnifiedDays({ year, month }),
  })
  const loading = loadingOcc || loadingHotel

  const days = useMemo(
    () => aggregateParkingDaily(occRows, year, month),
    [occRows, year, month],
  )

  // Chambres occupées HÔTEL par jour (numéro de jour → rj_nuitees), dénominateur
  // du captage journalier. Jours sans rapport absents (captage « — »).
  const hotelRoomsByDay = useMemo(() => {
    const map = new Map<number, number>()
    for (const row of hotelDays) {
      if (row.report)
        map.set(Number(row.date.slice(8, 10)), row.report.rj_nuitees)
    }
    return map
  }, [hotelDays])

  const summary = useMemo(() => {
    const count = days.length
    const avgOccupancy =
      count > 0 ? days.reduce((s, d) => s + d.occupancy, 0) / count : 0
    const arrivals = days.reduce((s, d) => s + d.arrivals, 0)
    const departures = days.reduce((s, d) => s + d.departures, 0)

    // Impayés / gratuité / CA : réservations dont l'arrivée tombe dans le mois,
    // sommées depuis l'agrégat d'arrivées (même source que la vue annuelle).
    const prefix = `${year}-${mm}-`
    const monthArrivals = arrivalRows.filter((a) => a.start_date.startsWith(prefix))
    const unpaid = monthArrivals.reduce((s, a) => s + a.unpaid, 0)
    // `?? 0` : tolère une vue pas encore migrée (colonnes gratuité/CA absentes
    // le temps que le SQL soit joué en prod) sans propager de NaN.
    const free = monthArrivals.reduce((s, a) => s + (a.free ?? 0), 0)
    const caTtc = monthArrivals.reduce((s, a) => s + (a.ca_ttc ?? 0), 0)

    // Captage du mois : occupation parking client rapportée à l'occupation hôtel,
    // sur les cumuls des jours où l'occupation hôtel est connue. « — » si aucune base.
    let capClient = 0
    let capRooms = 0
    for (const d of days) {
      const rooms = hotelRoomsByDay.get(d.day) ?? 0
      if (rooms > 0) {
        capClient += d.occupiedClient
        capRooms += rooms
      }
    }

    return {
      avgOccupancy,
      arrivals,
      departures,
      unpaid,
      free,
      caTtc,
      avgCaptage: captageIndex(capClient, capRooms),
      // 2e info : cadence quotidienne (moyenne sur les jours du mois).
      arrivalsPerDay: count > 0 ? arrivals / count : 0,
      departuresPerDay: count > 0 ? departures / count : 0,
      caTtcPerDay: count > 0 ? caTtc / count : 0,
    }
  }, [days, arrivalRows, year, mm, hotelRoomsByDay])

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        jour: d.day,
        occ: d.occupancy,
      })),
    [days],
  )

  // Axe : reste borné à 100 % tant qu'aucun jour ne déborde sur les places
  // tampon (13/14) ; sinon on monte à la dizaine supérieure pour ne pas tronquer.
  const occMax = useMemo(() => {
    const peak = Math.max(100, ...chartData.map((d) => d.occ))
    return Math.ceil(peak / 10) * 10
  }, [chartData])

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
        cards: 7,
        cardCols: 7,
      }}
    >
      {/* Cartes du mois */}
      <AnalytiqueCardsGrid cols={7}>
        <StatCard
          label="Taux d'occupation moyen"
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
          label="Gratuité"
          accent={ACCENT.slate}
          value={fmtInt(summary.free)}
          hint="Réservations en gratuité arrivées ce mois-ci — comptées dans les nuitées, jamais dans le CA."
          sub={shareSub(summary.free, summary.arrivals, 'des arrivées')}
        />
        <StatCard
          label="CA Parking"
          accent={ACCENT.amber}
          value={fmtEur(summary.caTtc)}
          hint="Chiffre d'affaires TTC du mois (réservé/payé/non payé), hors employé et gratuité."
          sub={
            summary.caTtcPerDay > 0
              ? subText(`moy. ${fmtEur(summary.caTtcPerDay)} / jour`)
              : undefined
          }
        />
        <StatCard
          label="Impayés"
          accent={ACCENT.red}
          value={fmtInt(summary.unpaid)}
          hint="Réservations parties sans paiement enregistré."
          sub={shareSub(summary.unpaid, summary.arrivals, 'des arrivées')}
        />
        <StatCard
          label="Captage"
          accent={ACCENT.pink}
          value={summary.avgCaptage != null ? fmtPctInt(summary.avgCaptage) : '—'}
          hint="Remplissage du parking client comparé à celui de l'hôtel. 100 % = parking au moins aussi rempli, en proportion, que l'hôtel (demande captée au max) ; en dessous, le parking traîne derrière ; 0 % = clients présents mais parking vide."
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
              className="px-3 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.pink }}
            >
              Captage
            </th>
          </tr>
        }
      >
        <tbody>
          {days.map((d) => {
            const hasData = d.occupied > 0
            const rooms = hotelRoomsByDay.get(d.day) ?? 0
            // Captage : occupation parking client rapportée à l'occupation hôtel du jour.
            const captage = rooms > 0 ? captageIndex(d.occupiedClient, rooms) : null
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
                      className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground/50"
                      style={captage != null ? { color: ACCENT.pink } : undefined}
                    >
                      {captage != null ? fmtPct(captage) : '—'}
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
          yDomain={[0, occMax]}
          tooltipFormatter={fmtPct}
          labelFormatter={dayTooltipLabel}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
