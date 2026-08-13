import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { AnalytiqueShell } from '#/components/analytique/AnalytiqueShell.tsx'
import {
  AnalytiqueCardsGrid,
  shareSub,
  StatCard,
  subText,
} from '#/components/analytique/AnalytiqueCards.tsx'
import { AnalytiqueTable } from '#/components/analytique/AnalytiqueTable.tsx'
import { AnalytiqueCharts } from '#/components/analytique/AnalytiqueCharts.tsx'
import { YearNav } from '#/components/analytique/YearNav.tsx'
import { useAnnualYear } from '#/components/analytique/useAnnualYear.ts'
import { KpiLineChart } from '#/components/analytique/KpiLineChart.tsx'
import { fetchParkingArrivals } from '#/lib/parking/service.ts'
import { fetchYearAnalytics } from '#/lib/repjour/services/daily.ts'
import {
  aggregateParkingMonthly,
  captageIndex,
  yearsFromParkingDates,
} from '#/lib/parking/analytics.ts'
import { fmtInt, fmtPct, fmtPctInt } from '#/lib/parking/format.ts'
import { MONTHS_LABELS, MONTHS_SHORT } from '#/lib/repjour/constants.ts'
import { ACCENT } from '#/components/analytique/accents.ts'

/*
 * Vue analytique Parking — gabarit calqué sur pdj/PdjAnalytiqueBoard.
 *
 * Charge en LECTURE toutes les réservations (fetchReservations), les agrège par
 * mois pour l'année sélectionnée (aggregateParkingMonthly), puis rend : cartes
 * de synthèse annuelle, tableau mois par mois et un graphique (occupation).
 * Aucune écriture Supabase — uniquement des `select`. Aucun
 * montant € (la table n'a pas de tarif). Ouvert à tous les rôles connectés en
 * lecture (garde `ProtectedRoute` sur la route).
 */

const currentYear = new Date().getFullYear()

export function ParkingAnalytiqueBoard() {
  const navigate = useNavigate()

  // Agrégat des ARRIVÉES (vue `parking_arrivals_agg`, une ligne par jour au lieu
  // d'une par réservation). Une seule lecture, mise en cache ; l'agrégation par
  // année se fait ensuite en mémoire — pas de nouvelle requête par année.
  const { data: arrivals = [], isPending: loadingRes } = useQuery({
    queryKey: ['parking', 'arrivals-all'],
    queryFn: fetchParkingArrivals,
  })

  const years = useMemo(
    () => yearsFromParkingDates(arrivals.map((r) => r.start_date), currentYear),
    [arrivals],
  )

  // Année sélectionnée + recalage si absente de la liste (hook partagé).
  const { year, setYear } = useAnnualYear(years, currentYear)

  // Occupation HÔTEL mois par mois (nuitées) — dénominateur du captage : part des
  // chambres occupées qui ont aussi pris une place de parking. Même service que
  // l'analytique repjour, clé de cache propre au parking.
  const { data: hotelMonths = [], isPending: loadingHotel } = useQuery({
    queryKey: ['parking', 'hotel-year', year],
    queryFn: () => fetchYearAnalytics(year),
  })
  const loading = loadingRes || loadingHotel

  const months = useMemo(
    () => aggregateParkingMonthly(arrivals, year),
    [arrivals, year],
  )

  // Nuitées HÔTEL par mois (dénominateur du captage), indexées par numéro de mois.
  const hotelNuiteesByMonth = useMemo(() => {
    const map = new Map<number, number>()
    for (const h of hotelMonths) map.set(h.month, h.nuitees)
    return map
  }, [hotelMonths])

  const summary = useMemo(() => {
    const active = months.filter((m) => m.reservations > 0)
    const count = active.length
    const totalReservations = months.reduce((s, m) => s + m.reservations, 0)
    const totalNights = months.reduce((s, m) => s + m.nights, 0)
    // Captage annuel : occupation parking client rapportée à l'occupation hôtel,
    // sur les cumuls des mois où l'occupation hôtel est connue. « — » sinon.
    let capClient = 0
    let capRooms = 0
    for (const m of months) {
      const nuitees = hotelNuiteesByMonth.get(m.month) ?? 0
      if (nuitees > 0) {
        capClient += m.clientNights
        capRooms += nuitees
      }
    }
    return {
      totalReservations,
      totalNights,
      totalUnpaid: months.reduce((s, m) => s + m.unpaid, 0),
      avgOccupancy:
        count > 0 ? active.reduce((s, m) => s + m.occupancyRate, 0) / count : 0,
      avgCaptage: captageIndex(capClient, capRooms),
      // 2e info : cadence mensuelle des réservations + durée moyenne d'un séjour.
      reservationsPerMonth: count > 0 ? totalReservations / count : 0,
      nightsPerReservation:
        totalReservations > 0 ? totalNights / totalReservations : 0,
    }
  }, [months, hotelNuiteesByMonth])

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        mois: MONTHS_SHORT[m.month - 1],
        occ: m.reservations > 0 ? m.occupancyRate : null,
      })),
    [months],
  )

  // Axe : reste borné à 100 % tant qu'aucun mois ne déborde sur les places
  // tampon (13/14) ; sinon on monte à la dizaine supérieure pour ne pas tronquer.
  const occMax = useMemo(() => {
    const peak = Math.max(100, ...chartData.map((d) => d.occ ?? 0))
    return Math.ceil(peak / 10) * 10
  }, [chartData])

  // En-tête d'infobulle du graphe : « Fév » → « Février 2026 ».
  const monthTooltipLabel = (label: string) => {
    const i = MONTHS_SHORT.indexOf(label)
    return i >= 0 ? `${MONTHS_LABELS[i]} ${year}` : label
  }

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
      printTitle={`Parking · ${year}`}
      skeleton={{ cols: 7, charts: 1, rows: 12, cards: 5, cardCols: 5 }}
    >
      {/* Synthèse annuelle */}
      <AnalytiqueCardsGrid cols={5}>
        <StatCard
          label="Réservations"
          accent={ACCENT.indigo}
          value={fmtInt(summary.totalReservations)}
          hint="Nombre total de réservations de parking sur l'année."
          sub={
            summary.reservationsPerMonth > 0
              ? subText(`moy. ${fmtInt(summary.reservationsPerMonth)} / mois`)
              : undefined
          }
        />
        <StatCard
          label="Taux d'occupation moyen"
          accent={ACCENT.cyan}
          value={fmtPctInt(summary.avgOccupancy)}
          hint="Places occupées en moyenne, rapportées aux places disponibles."
        />
        <StatCard
          label="Nuits totales"
          accent={ACCENT.green}
          value={fmtInt(summary.totalNights)}
          hint="Total des nuits de stationnement sur l'année."
          sub={
            summary.nightsPerReservation > 0
              ? subText(`moy. ${fmtInt(summary.nightsPerReservation)} / réservation`)
              : undefined
          }
        />
        <StatCard
          label="Impayés"
          accent={ACCENT.red}
          value={fmtInt(summary.totalUnpaid)}
          hint="Réservations parties sans paiement enregistré."
          sub={shareSub(
            summary.totalUnpaid,
            summary.totalReservations,
            'des réservations',
          )}
        />
        <StatCard
          label="Captage"
          accent={ACCENT.pink}
          value={summary.avgCaptage != null ? fmtPctInt(summary.avgCaptage) : '—'}
          hint="Remplissage du parking client comparé à celui de l'hôtel. 100 % = parking au moins aussi rempli, en proportion, que l'hôtel (demande captée au max) ; en dessous, le parking traîne derrière ; 0 % = clients présents mais parking vide."
        />
      </AnalytiqueCardsGrid>

      {/* Tableau mois par mois */}
      <AnalytiqueTable
        head={
          <tr className="border-b border-border bg-muted">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Mois
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.indigo }}
            >
              Résas
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.cyan }}
            >
              <span className="hidden sm:inline">Occupation</span>
              <span className="sm:hidden">Occ.</span>
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.green }}
            >
              Nuits
            </th>
            <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
              Payées
            </th>
            <th className="hidden px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:table-cell">
              Réservées
            </th>
            <th
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              style={{ color: ACCENT.red }}
            >
              Impayées
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
          {months.map((m) => {
            const hasData = m.reservations > 0
            const nuitees = hotelNuiteesByMonth.get(m.month) ?? 0
            const captage = nuitees > 0 ? captageIndex(m.clientNights, nuitees) : null
            return (
              <tr
                key={m.month}
                onClick={() =>
                  navigate({
                    to: '/parking/analytique/$year/$month',
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
                  {MONTHS_SHORT[m.month - 1]}
                </td>
                {hasData ? (
                  <>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium tabular-nums"
                      style={{ color: ACCENT.indigo }}
                    >
                      {fmtInt(m.reservations)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.cyan }}
                    >
                      {fmtPct(m.occupancyRate)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.green }}
                    >
                      {fmtInt(m.nights)}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                      {fmtInt(m.paid)}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums sm:table-cell">
                      {fmtInt(m.reserved)}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 text-center text-xs tabular-nums"
                      style={{ color: ACCENT.red }}
                    >
                      {fmtInt(m.unpaid)}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums text-muted-foreground/50"
                      style={captage != null ? { color: ACCENT.pink } : undefined}
                    >
                      {captage != null ? fmtPct(captage) : '—'}
                    </td>
                  </>
                ) : (
                  <>
                    <td
                      colSpan={3}
                      className="px-2 py-2 text-center text-xs text-muted-foreground/50"
                    >
                      —
                    </td>
                    <td className="hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
                      —
                    </td>
                    <td className="hidden px-2 py-2 text-center text-xs text-muted-foreground/50 sm:table-cell">
                      —
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
                      —
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground/50">
                      —
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </AnalytiqueTable>

      {/* Graphique unique, pleine largeur : le taux d'occupation. */}
      <AnalytiqueCharts cols={1}>
        <KpiLineChart
          title="Taux d'occupation par mois"
          data={chartData}
          xKey="mois"
          realKey="occ"
          realName="Occupation"
          yDomain={[0, occMax]}
          tooltipFormatter={fmtPct}
          labelFormatter={monthTooltipLabel}
        />
      </AnalytiqueCharts>
    </AnalytiqueShell>
  )
}
