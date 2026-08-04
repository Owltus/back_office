import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
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
import { fetchReservations } from '#/lib/parking/service.ts'
import { fetchUnifiedDays } from '#/lib/repjour/services/data.ts'
import { aggregateParkingDaily } from '#/lib/parking/analytics.ts'
import { fmtInt, fmtPct, fmtPctInt } from '#/lib/parking/format.ts'
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
  // MÊME clé que la vue annuelle (`['parking','analytics']`) : toutes les
  // réservations sont lues une seule fois et partagées entre les deux vues (hit
  // de cache instantané au passage annuel → mois, et entre mois). L'agrégation
  // par jour est un calcul client négligeable, dérivé du cache.
  const { data: reservations = [], isPending: loadingRes } = useQuery({
    queryKey: ['parking', 'analytics'],
    queryFn: fetchReservations,
  })

  // Occupation HÔTEL du mois, jour par jour (rj_nuitees = chambres occupées la
  // nuit) — dénominateur du captage. Même service que l'analytique repjour, clé
  // de cache propre au parking.
  const { data: hotelDays = [], isPending: loadingHotel } = useQuery({
    queryKey: ['parking', 'hotel-month', year, month],
    queryFn: () => fetchUnifiedDays({ year, month }),
  })
  const loading = loadingRes || loadingHotel

  const days = useMemo(
    () => aggregateParkingDaily(reservations, year, month),
    [reservations, year, month],
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

    // Impayés : réservations dont l'arrivée tombe dans le mois, au statut
    // checkout (départ enregistré sans paiement).
    const prefix = `${year}-${String(month).padStart(2, '0')}-`
    const unpaid = reservations.filter(
      (r) => r.start_date.startsWith(prefix) && r.status === 'checkout',
    ).length

    // Captage du mois = Σ places parking occupées ÷ Σ chambres occupées hôtel,
    // sur les seuls jours où l'occupation hôtel est connue. « — » sinon.
    let capNum = 0
    let capDen = 0
    for (const d of days) {
      const rooms = hotelRoomsByDay.get(d.day) ?? 0
      if (rooms > 0) {
        capNum += d.occupiedClient
        capDen += rooms
      }
    }

    return {
      avgOccupancy,
      arrivals,
      departures,
      unpaid,
      avgCaptage: capDen > 0 ? (capNum / capDen) * 100 : null,
      // 2e info : cadence quotidienne (moyenne sur les jours du mois).
      arrivalsPerDay: count > 0 ? arrivals / count : 0,
      departuresPerDay: count > 0 ? departures / count : 0,
    }
  }, [days, reservations, year, month, hotelRoomsByDay])

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
      actions={<AnalytiqueBackButton />}
      loading={loading}
      printTitle={`Parking · ${monthLabel} ${year}`}
      skeleton={{
        cols: 5,
        charts: 1,
        rows: new Date(year, month, 0).getDate(),
        cards: 5,
        cardCols: 5,
      }}
    >
      {/* Cartes du mois */}
      <AnalytiqueCardsGrid cols={5}>
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
          hint="Places de parking occupées rapportées aux chambres occupées de l'hôtel."
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
            // Captage : places CLIENT occupées / chambres hôtel (personnel exclu).
            const captage =
              d.occupiedClient > 0 && rooms > 0
                ? (d.occupiedClient / rooms) * 100
                : null
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
                    colSpan={5}
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
