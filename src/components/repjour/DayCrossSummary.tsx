import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, Coffee, SquareParking } from 'lucide-react'

import { StatTile } from '#/components/shared/StatTile.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { fmtEur, fmtInt, fmtPctInt } from '#/lib/format/index.ts'
import {
  computeCaptageBenchmark,
  computeDailyBenchmark,
  computeOccupancyBenchmark,
} from '#/lib/pdj/amounts.ts'
import {
  fetchAllAddonProduction,
  fetchAllInHouseCovers,
  fetchDay as fetchPdjDay,
} from '#/lib/pdj/service.ts'
import { detectTarifs } from '#/lib/pdj/tarif.ts'
import { pdjDaySummary } from '#/lib/pdj/summary.ts'
import { fetchReservations } from '#/lib/parking/service.ts'
import { aggregateParkingDaily } from '#/lib/parking/analytics.ts'
import { fetchUnifiedDays } from '#/lib/repjour/services/data.ts'
import {
  fetchDay as fetchRaproDay,
  fetchOccupancy,
  fetchOldestDay,
} from '#/lib/rapro/service.ts'
import { carryOver, carryoverWindow } from '#/lib/rapro/carryover.ts'
import type { DaySnapshot } from '#/lib/rapro/carryover.ts'
import { CATEGORY_COLOR } from '#/lib/rapro/constants.ts'
import { raproDaySummary } from '#/lib/rapro/summary.ts'
import type { RaproDaySummary } from '#/lib/rapro/summary.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/*
 * Bande de synthèse TRANSVERSE du rapport journalier — sous le tableau KPI.
 *
 * Pour la DATE affichée du rapport, un aperçu de trois autres features : PDJ,
 * Parking, Rapprochement. Chaque bloc REPRODUIT les cards de sa page d'origine
 * (mêmes libellés, mêmes valeurs, MÊMES codes couleur ET MÊMES sous-textes) —
 * aucun sous-texte n'est inventé :
 *   - PDJ (board .pdj-stats) : inclus/Extra → montant HT DU JOUR ; CA PDJ &
 *     Taux de captage → MOYENNE (benchmark, `moy. …/j`) via ['pdj','benchmark'].
 *   - Parking : Arrivées/Départs → `moy. X / jour` (analytique mensuel) ;
 *     Occupation & Captage → moyenne du mois `moy. …/j` (les pages parking n'en
 *     portent pas — AJOUT assumé, dans l'esprit des benchmarks PDJ).
 *   - Rapprochement (board /rapro) : AUCUNE card ne porte de sous-texte → aucun.
 * Composants d'ÉCRAN uniquement : ils ne touchent NI le PDF « Imprimer » NI le
 * rapport e-mail (qui ne lisent que monthPace/summaryMetrics).
 *
 * VISIBILITÉ (aucune modif base) — chaque bloc n'est chargé et affiché que si le
 * compte a au moins la LECTURE sur la page concernée (`can(page,'lecture')`), via
 * `enabled`. Les tables PDJ/Parking/Rapro sont fermées par la RLS à leur propre
 * page ; un compte « repjour seul » ne verrait rien de toute façon. Un admin voit
 * tout. PERF : mêmes `queryKey` que les onglets → cache TanStack partagé.
 */

/** Map/Set vides stables (défauts des jours de la fenêtre de roulement encore en vol). */
const EMPTY_STATUSES: ReadonlyMap<number, RoomStatus> = new Map()
const EMPTY_ROOMS: ReadonlySet<number> = new Set()

/** Petit sous-texte grisé sous la valeur d'une carte (calque de SummaryCards). */
function subMuted(content: ReactNode) {
  return (
    <span className="text-[0.7rem] font-medium text-muted-foreground">
      {content}
    </span>
  )
}

/** En-tête d'un bloc (icône + libellé), lien vers la page source. */
function BlockHeading({
  icon,
  label,
  to,
}: {
  icon: ReactNode
  label: string
  to: '/pdj' | '/parking' | '/rapro'
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground transition-colors hover:text-foreground"
    >
      {icon}
      {label}
    </Link>
  )
}

function SummaryBlock({
  heading,
  children,
}: {
  heading: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      {heading}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {children}
      </div>
    </div>
  )
}

export function DayCrossSummary({
  date,
  hotelRoomsSold,
}: {
  date: string
  /** Nuitées hôtel du jour (rj.nuitees) — dénominateur du captage parking. */
  hotelRoomsSold: number | null
}) {
  const { can } = useAuth()
  const canPdj = can('pdj', 'lecture')
  const canParking = can('parking', 'lecture')
  const canRapro = can('rapro', 'lecture')

  // --- PDJ (In-House + Addon du jour) ----------------------------------------
  const pdjDayQ = useQuery({
    queryKey: ['pdj', 'day', date],
    queryFn: () => fetchPdjDay(date),
    enabled: canPdj,
  })
  // Tarifs unitaires détectés sur TOUT l'historique Addon (rien en dur ; cf.
  // tarif.ts). MÊME clé que la page PDJ → cache partagé. Le CA du jour se calcule
  // par chambre (computePdjCA) au tarif détecté : même chiffre que le board.
  const allAddonQ = useQuery({
    queryKey: ['pdj', 'addon-all'],
    queryFn: fetchAllAddonProduction,
    enabled: canPdj,
  })
  const tarifs = useMemo(
    () => detectTarifs(allAddonQ.data ?? []),
    [allAddonQ.data],
  )
  const pdj = useMemo(
    () => (pdjDayQ.data ? pdjDaySummary(pdjDayQ.data, tarifs) : null),
    [pdjDayQ.data, tarifs],
  )
  // Repère « moyenne par jour » (benchmark) — sous-textes CA PDJ & captage.
  // MÊME requête que la page PDJ (queryKey ['pdj','benchmark']) → cache partagé.
  // On renvoie la MÊME forme {total,captage,occupancy} pour ne pas corrompre ce
  // cache partagé (la page PDJ lit benchmark.occupancy).
  const pdjBenchQ = useQuery({
    queryKey: ['pdj', 'benchmark'],
    queryFn: async () => {
      const [addon, inhouse] = await Promise.all([
        fetchAllAddonProduction(),
        fetchAllInHouseCovers(),
      ])
      return {
        total: computeDailyBenchmark(
          addon.map((r) => ({
            service_date: r.service_date,
            code: r.code,
            revenue: r.revenue_ttc,
          })),
          inhouse,
        ),
        captage: computeCaptageBenchmark(inhouse),
        occupancy: computeOccupancyBenchmark(inhouse),
      }
    },
    enabled: canPdj,
  })
  const benchmark = pdjBenchQ.data

  // --- Parking (jour + moyennes du mois) -------------------------------------
  const parkingQ = useQuery({
    queryKey: ['parking', 'reservations'],
    queryFn: fetchReservations,
    enabled: canParking,
  })
  const [pkYear, pkMonth] = date.split('-').map(Number)
  // Occupation HÔTEL du mois, jour par jour (rj_nuitees) — dénominateur du captage
  // MOYEN. MÊME clé que l'analytique parking (['parking','hotel-month',...]).
  const hotelMonthQ = useQuery({
    queryKey: ['parking', 'hotel-month', pkYear, pkMonth],
    queryFn: () => fetchUnifiedDays({ year: pkYear, month: pkMonth }),
    enabled: canParking,
  })
  const parkingAgg = useMemo(() => {
    if (!parkingQ.data) return null
    const days = aggregateParkingDaily(parkingQ.data, pkYear, pkMonth)
    const day = days.find((d) => d.date === date)
    if (!day) return null
    const n = days.length || 1
    const avg = (sel: (d: (typeof days)[number]) => number) =>
      days.reduce((s, d) => s + sel(d), 0) / n
    // Captage MOYEN du mois = Σ places client ÷ Σ nuitées hôtel (jours à hôtel
    // connu) × 100 — calque exact de l'analytique parking mensuel.
    const hotelByDay = new Map<number, number>()
    for (const row of hotelMonthQ.data ?? []) {
      if (row.report)
        hotelByDay.set(Number(row.date.slice(8, 10)), row.report.rj_nuitees)
    }
    let capNum = 0
    let capDen = 0
    for (const d of days) {
      const rooms = hotelByDay.get(d.day) ?? 0
      if (rooms > 0) {
        capNum += d.occupiedClient
        capDen += rooms
      }
    }
    return {
      day,
      avgOccupancy: avg((d) => d.occupancy),
      avgArrivals: avg((d) => d.arrivals),
      avgDepartures: avg((d) => d.departures),
      avgCaptage: capDen > 0 ? (capNum / capDen) * 100 : null,
    }
  }, [parkingQ.data, hotelMonthQ.data, date, pkYear, pkMonth])
  // Captage parking DU JOUR = places CLIENT occupées ÷ nuitées hôtel du jour (× 100).
  const parkingCaptage =
    parkingAgg && hotelRoomsSold && hotelRoomsSold > 0
      ? (parkingAgg.day.occupiedClient / hotelRoomsSold) * 100
      : null

  // --- Rapprochement (occupation + statuts + roulement) ----------------------
  const raproOccQ = useQuery({
    queryKey: ['rapro', 'occupancy', date],
    queryFn: () => fetchOccupancy(date),
    enabled: canRapro,
  })
  const raproDayQ = useQuery({
    queryKey: ['rapro', 'day', date],
    queryFn: () => fetchRaproDay(date),
    enabled: canRapro,
  })
  const raproOldestQ = useQuery({
    queryKey: ['rapro', 'oldest'],
    queryFn: fetchOldestDay,
    enabled: canRapro,
  })
  // Fenêtre de roulement (jusqu'à 7 jours antérieurs), bornée au plus ancien jour
  // connu — MÊMES clés que le board → cache partagé, pas de requête en double.
  const windowDays = canRapro
    ? carryoverWindow(date, raproOldestQ.data ?? date)
    : []
  const raproWindow = useQueries({
    queries: windowDays.map((d) => ({
      queryKey: ['rapro', 'day', d],
      queryFn: () => fetchRaproDay(d),
      enabled: canRapro,
    })),
  })
  const rapro = useMemo<RaproDaySummary | null>(() => {
    if (!raproOccQ.data || !raproDayQ.data) return null
    // « Bloquées de la veille » = roulement DÉRIVÉ du passé ∪ liseré manuel du
    // jour — calque exact de RaproBoard (l.240-248).
    const past: DaySnapshot[] = windowDays.map((_, i) => ({
      statuses: raproWindow[i]?.data?.statuses ?? EMPTY_STATUSES,
      carriedManual: raproWindow[i]?.data?.carriedManual ?? EMPTY_ROOMS,
    }))
    const carried = new Set(carryOver(past))
    for (const r of raproDayQ.data.carriedManual) carried.add(r)
    return raproDaySummary(raproOccQ.data, raproDayQ.data.statuses, carried)
  }, [raproOccQ.data, raproDayQ.data, raproWindow, windowDays])

  const showPdj = canPdj && pdj
  const showParking = canParking && parkingAgg
  const showRapro = canRapro && rapro
  // Rien de prêt (aucun droit, ou toutes les lectures encore en vol) : pas de
  // section vide qui décalerait la page.
  if (!showPdj && !showParking && !showRapro) return null

  return (
    <section className="space-y-4">
      {showPdj && (
        <SummaryBlock
          heading={
            <BlockHeading
              icon={<Coffee className="size-3.5" />}
              label="Petit-déjeuner"
              to="/pdj"
            />
          }
        >
          {/* inclus / Extra : montant HT DU JOUR (comme le board), si Addon présent. */}
          <StatTile
            label="PDJ inclus"
            accent="#34d399"
            value={fmtInt(pdj.included)}
            sub={pdj.hasAddon ? subMuted(fmtEur(pdj.includedHT, 2)) : undefined}
          />
          <StatTile
            label="PDJ Extra"
            accent="#fbbf24"
            value={fmtInt(pdj.extrasCount)}
            sub={pdj.hasAddon ? subMuted(fmtEur(pdj.extrasHT, 2)) : undefined}
          />
          {/* CA PDJ & captage : MOYENNE (benchmark), comme le board. */}
          <StatTile
            label="CA PDJ"
            accent="#60a5fa"
            value={pdj.hasAddon ? fmtEur(pdj.totalHT, 2) : fmtEur(0, 0)}
            sub={
              benchmark && benchmark.total.avgTotalHT != null
                ? subMuted(`moy. ${fmtEur(benchmark.total.avgTotalHT, 2)}/j`)
                : undefined
            }
          />
          <StatTile
            label="Taux de captage"
            accent="#f472b6"
            value={pdj.captage == null ? '—' : fmtPctInt(pdj.captage)}
            sub={
              benchmark && benchmark.captage.avgCaptage != null
                ? subMuted(`moy. ${fmtPctInt(benchmark.captage.avgCaptage)}/j`)
                : undefined
            }
          />
        </SummaryBlock>
      )}

      {showParking && (
        <SummaryBlock
          heading={
            <BlockHeading
              icon={<SquareParking className="size-3.5" />}
              label="Parking"
              to="/parking"
            />
          }
        >
          {/* Occupation & Captage : moyenne du mois en sous-texte (choix produit —
              les pages parking n'en portent pas, dans l'esprit des benchmarks PDJ). */}
          <StatTile
            label="Occupation"
            accent={ACCENT.cyan}
            value={fmtPctInt(parkingAgg.day.occupancy)}
            sub={subMuted(`moy. ${fmtPctInt(parkingAgg.avgOccupancy)}/j`)}
          />
          {/* Arrivées / Départs : `moy. X / jour` (analytique mensuel), si > 0. */}
          <StatTile
            label="Arrivées"
            accent={ACCENT.indigo}
            value={fmtInt(parkingAgg.day.arrivals)}
            sub={
              parkingAgg.avgArrivals > 0
                ? subMuted(`moy. ${fmtInt(parkingAgg.avgArrivals)} / jour`)
                : undefined
            }
          />
          <StatTile
            label="Départs"
            accent={ACCENT.green}
            value={fmtInt(parkingAgg.day.departures)}
            sub={
              parkingAgg.avgDepartures > 0
                ? subMuted(`moy. ${fmtInt(parkingAgg.avgDepartures)} / jour`)
                : undefined
            }
          />
          <StatTile
            label="Captage"
            accent={ACCENT.pink}
            value={parkingCaptage == null ? '—' : fmtPctInt(parkingCaptage)}
            sub={
              parkingAgg.avgCaptage != null
                ? subMuted(`moy. ${fmtPctInt(parkingAgg.avgCaptage)}/j`)
                : undefined
            }
          />
        </SummaryBlock>
      )}

      {showRapro && (
        <SummaryBlock
          heading={
            <BlockHeading
              icon={<ArrowLeftRight className="size-3.5" />}
              label="Rapprochement"
              to="/rapro"
            />
          }
        >
          {/* Le board /rapro ne porte AUCUN sous-texte sur ses cards → aucun ici. */}
          <StatTile
            label="Nettoyées"
            accent={CATEGORY_COLOR.nettoyee}
            value={fmtInt(rapro.nettoyees)}
          />
          <StatTile
            label="Refus"
            accent={CATEGORY_COLOR.refus}
            value={fmtInt(rapro.refus)}
          />
          <StatTile
            label="Bloquées du jour"
            accent={CATEGORY_COLOR.bloquee}
            value={fmtInt(rapro.bloqueesJour)}
          />
          <StatTile
            label="Bloquées de la veille"
            accent={CATEGORY_COLOR.bloquee}
            value={fmtInt(rapro.bloqueesVeille)}
          />
        </SummaryBlock>
      )}
    </section>
  )
}
