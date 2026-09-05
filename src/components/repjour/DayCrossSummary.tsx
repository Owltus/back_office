import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, Coffee, SquareParking } from 'lucide-react'

import { StatTile } from '#/components/shared/StatTile.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { fmtEur, fmtInt, fmtPctInt } from '#/lib/format/index.ts'
import { computeAggBenchmarks } from '#/lib/pdj/amounts.ts'
import {
  fetchAllAddonProduction,
  fetchDailyAgg,
  fetchDay as fetchPdjDay,
} from '#/lib/pdj/service.ts'
import { detectTarifs } from '#/lib/pdj/tarif.ts'
import { pdjDaySummary } from '#/lib/pdj/summary.ts'
import { fetchParkingDailyOccupation } from '#/lib/parking/service.ts'
import { captageIndex } from '#/lib/parking/analytics.ts'
import { fetchNuiteesByMonth } from '#/lib/repjour/services/data.ts'
import {
  fetchDay as fetchRaproDay,
  fetchOccupancy,
  fetchOldestDay,
  fetchRoomsRange,
} from '#/lib/rapro/service.ts'
import {
  cleaned,
  fetchRaproDailyAgg,
  sumCounts,
} from '#/lib/rapro/monthly.ts'
import { carryOver, carryoverWindow } from '#/lib/rapro/carryover.ts'
import { groupRowsByDay } from '#/lib/rapro/dayRows.ts'
import { CATEGORY_COLOR } from '#/lib/rapro/constants.ts'
import { raproDaySummary } from '#/lib/rapro/summary.ts'
import type { RaproDaySummary } from '#/lib/rapro/summary.ts'

/*
 * Bande de synthèse TRANSVERSE du rapport journalier — sous le tableau KPI.
 *
 * Pour la DATE affichée du rapport : valeurs DU JOUR, et sous-textes = MOYENNE sur
 * une fenêtre GLISSANTE de 30 jours finissant à cette date. Cette fenêtre est
 * PROPRE à la bande RepJour — les pages/analytiques gardent leurs propres périodes,
 * donc on ne réutilise PAS leurs requêtes moyennées (ex. ['pdj','benchmark'] = tout
 * l'historique) :
 *   - PDJ : inclus/Extra → montant HT DU JOUR ; CA PDJ & Captage → `moy. …/j` sur
 *     30 j (Addon + In-House complets filtrés à la fenêtre, mêmes repères PDJ).
 *   - Parking : Occupation (NOMBRE) / Arrivées / Départs / Captage → `moy.` sur 30 j
 *     (agrégation des 1–2 mois couvrant la fenêtre, restreinte à celle-ci).
 *   - Rapprochement : Nettoyées / Refus / Bloquées du jour → `moy. X / jour` sur 30 j
 *     (jours clôturés). « Bloquées de la veille » = roulement, non agrégé → pas de moy.
 * Composants d'ÉCRAN uniquement : ils ne touchent NI le PDF « Imprimer » NI le
 * rapport e-mail (qui ne lisent que monthPace/summaryMetrics).
 *
 * VISIBILITÉ (aucune modif base) — chaque bloc n'est chargé et affiché que si le
 * compte a au moins la LECTURE sur la page concernée (`can(page,'lecture')`), via
 * `enabled`. Les tables PDJ/Parking/Rapro sont fermées par la RLS à leur propre
 * page ; un compte « repjour seul » ne verrait rien de toute façon. Un admin voit
 * tout. PERF : mêmes `queryKey` que les onglets → cache TanStack partagé.
 */

/** Petit sous-texte grisé sous la valeur d'une carte (calque de SummaryCards). */
function subMuted(content: ReactNode) {
  return (
    <span className="text-[0.7rem] font-medium text-muted-foreground">
      {content}
    </span>
  )
}

/*
 * Fenêtre GLISSANTE de 30 jours (spécifique à la bande RepJour) : toutes les
 * moyennes des cartes se calculent sur `[date − 29 j, date]`. Les pages et
 * analytiques gardent leurs propres périodes — on ne réutilise donc PAS leurs
 * requêtes moyennées (ex. ['pdj','benchmark'] = tout l'historique).
 */
const WINDOW_DAYS = 30

/** Décale une date 'YYYY-MM-DD' de `delta` jours (calcul local, sans piège UTC). */
function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Les 1 à 2 mois (année, mois) couvrant la fenêtre [from, to] (≤ 30 jours). */
function monthsCovering(
  from: string,
  to: string,
): { year: number; month: number }[] {
  const uniq = new Map<string, { year: number; month: number }>()
  for (const s of [from, to]) {
    const [y, m] = s.split('-').map(Number)
    uniq.set(`${y}-${m}`, { year: y, month: m })
  }
  return [...uniq.values()]
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

  // Fenêtre glissante de 30 jours finissant à la date affichée — base de TOUTES
  // les moyennes de la bande (cf. helpers en tête de fichier).
  const windowFrom = useMemo(() => shiftDate(date, -(WINDOW_DAYS - 1)), [date])

  // --- PDJ (In-House + Addon du jour) ----------------------------------------
  const pdjDayQ = useQuery({
    queryKey: ['pdj', 'day', date],
    queryFn: () => fetchPdjDay(date),
    enabled: canPdj,
  })
  // Tarifs unitaires détectés sur TOUT l'historique Addon (rien en dur ; cf.
  // tarif.ts). MÊME clé que la page PDJ → cache partagé. Le CA du jour se calcule
  // par chambre (computePdjCA) au tarif détecté : même chiffre que le board.
  // C'est TOUT l'historique Addon (plusieurs centaines de lignes) pour de simples
  // tarifs unitaires, stables sur des mois : fraîcheur d'une heure ici, conservée
  // deux heures hors écran — la page RepJour ne le recharge pas à chaque visite.
  const allAddonQ = useQuery({
    queryKey: ['pdj', 'addon-all'],
    queryFn: fetchAllAddonProduction,
    enabled: canPdj,
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
  })
  const tarifs = useMemo(
    () => detectTarifs(allAddonQ.data ?? []),
    [allAddonQ.data],
  )
  const pdj = useMemo(
    () => (pdjDayQ.data ? pdjDaySummary(pdjDayQ.data, tarifs) : null),
    [pdjDayQ.data, tarifs],
  )
  // Repères PDJ de la fenêtre 30 j, lus depuis la VUE d'agrégation `pdj_daily_agg`
  // BORNÉE côté serveur à [windowFrom, date] : une poignée de lignes au lieu du
  // scan complet de la table. Le tarif du CA vient de l'Addon tout-historique
  // (`tarifs`), comme le board — un jour de la fenêtre n'a pas besoin de sa propre
  // ligne Addon. Clé de cache versionnée par la fenêtre.
  const aggWinQ = useQuery({
    queryKey: ['pdj', 'agg-range', windowFrom, date],
    queryFn: () => fetchDailyAgg(windowFrom, date),
    enabled: canPdj,
  })
  const pdjWin = useMemo(() => {
    if (!aggWinQ.data) return null
    const { total, captage } = computeAggBenchmarks(aggWinQ.data, tarifs)
    return { total, captage }
  }, [aggWinQ.data, tarifs])

  // --- Parking (jour courant + moyennes 30 j glissants) ----------------------
  // Occupation parking par jour sur la fenêtre 30 j, depuis la vue dépliée
  // `parking_daily_occupation` bornée côté serveur — plus de chargement de TOUTES
  // les réservations sur la page RepJour.
  const parkingOccQ = useQuery({
    queryKey: ['parking', 'daily-occ-range', windowFrom, date],
    queryFn: () => fetchParkingDailyOccupation(windowFrom, date),
    enabled: canParking,
  })
  // Occupation HÔTEL (rj_nuitees) des 1–2 mois couvrant la fenêtre 30 j —
  // dénominateur du captage MOYEN. Lecture DÉDIÉE (`date,rj_nuitees` sur
  // daily_reports seule) : l'ancienne clé partagée avec l'analytique parking
  // chargeait daily_reports ET forecast_days en `select=*` pour une colonne.
  // Indexée par date complète (la fenêtre peut chevaucher deux mois). staleTime
  // 5 min : les nuitées d'un jour passé ne bougent qu'à l'import, et le canal
  // Realtime de DashboardBoard invalide le préfixe `['repjour']`.
  const coverMonths = useMemo(
    () => monthsCovering(windowFrom, date),
    [windowFrom, date],
  )
  const hotelWinQs = useQueries({
    queries: coverMonths.map(({ year, month }) => ({
      queryKey: ['repjour', 'nuitees-month', year, month],
      queryFn: () => fetchNuiteesByMonth({ year, month }),
      enabled: canParking,
      staleTime: 5 * 60_000,
    })),
  })
  const hotelByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const q of hotelWinQs) {
      for (const row of q.data ?? []) {
        if (row.rj_nuitees != null) map.set(row.date, row.rj_nuitees)
      }
    }
    return map
  }, [hotelWinQs])
  const parkingAgg = useMemo(() => {
    const rows = parkingOccQ.data
    if (!rows) return null
    // La vue ne renvoie que les jours ACTIFS → on reconstruit TOUS les jours
    // calendaires de [windowFrom, date] (les jours vides comptent 0 dans les
    // moyennes). La dernière entrée (date) porte les valeurs DU JOUR.
    const byDate = new Map(rows.map((r) => [r.date, r]))
    const winDays: {
      date: string
      occupied: number
      occupiedClient: number
      arrivals: number
      departures: number
    }[] = []
    for (let d = windowFrom; d <= date; d = shiftDate(d, 1)) {
      const r = byDate.get(d)
      winDays.push({
        date: d,
        occupied: r?.occupied ?? 0,
        occupiedClient: r?.occupied_client ?? 0,
        arrivals: r?.arrivals ?? 0,
        departures: r?.departures ?? 0,
      })
    }
    const day = winDays.find((d) => d.date === date)
    if (!day) return null
    const n = winDays.length || 1
    const avg = (sel: (d: (typeof winDays)[number]) => number) =>
      winDays.reduce((s, d) => s + sel(d), 0) / n
    // Captage MOYEN — captageIndex (occupation parking client ÷ occupation hôtel,
    // borné 0–100 %) sur les cumuls des jours à hôtel connu de la fenêtre.
    let capClient = 0
    let capRooms = 0
    for (const d of winDays) {
      const rooms = hotelByDate.get(d.date) ?? 0
      if (rooms > 0) {
        capClient += d.occupiedClient
        capRooms += rooms
      }
    }
    return {
      day,
      avgOccupied: avg((d) => d.occupied),
      avgArrivals: avg((d) => d.arrivals),
      avgDepartures: avg((d) => d.departures),
      avgCaptage: captageIndex(capClient, capRooms),
    }
  }, [parkingOccQ.data, hotelByDate, windowFrom, date])
  // Captage parking DU JOUR — MÊME calcul que l'analytique (captageIndex).
  const parkingCaptage = parkingAgg
    ? captageIndex(parkingAgg.day.occupiedClient, hotelRoomsSold ?? 0)
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
    staleTime: Infinity, // borne historique figée (mêmes réglages que le board rapro)
    gcTime: 60 * 60_000,
  })
  // Fenêtre de roulement (jusqu'à 7 jours antérieurs), bornée au plus ancien jour
  // connu ; vide tant que `oldest` n'est pas là (comme avant). Lue en UNE requête
  // de plage (au lieu d'une par jour), puis regroupée par jour (`groupRowsByDay`,
  // pur) : un jour sans ligne donne un instantané vide = « résolue », exactement
  // ce que produisaient les sept `fetchDay`. Clé propre à la bande : les clés
  // `['rapro','day',d]` restent au board de saisie.
  const windowDays = useMemo(
    () => (canRapro ? carryoverWindow(date, raproOldestQ.data ?? date) : []),
    [canRapro, date, raproOldestQ.data],
  )
  const rangeFrom = windowDays[0]
  const rangeTo = windowDays[windowDays.length - 1]
  const raproRangeQ = useQuery({
    queryKey: ['rapro', 'days-range', rangeFrom, rangeTo],
    queryFn: () => fetchRoomsRange(rangeFrom, rangeTo),
    enabled: canRapro && windowDays.length > 0,
  })
  const rapro = useMemo<RaproDaySummary | null>(() => {
    if (!raproOccQ.data || !raproDayQ.data) return null
    // « Bloquées de la veille » = roulement DÉRIVÉ du passé ∪ liseré manuel du
    // jour — calque exact de RaproBoard (l.240-248). Plage encore en vol → aucune
    // ligne → instantanés vides (même repli que les sept lectures d'avant).
    const past = groupRowsByDay(windowDays, raproRangeQ.data ?? [])
    const carried = new Set(carryOver(past))
    for (const r of raproDayQ.data.carriedManual) carried.add(r)
    return raproDaySummary(raproOccQ.data, raproDayQ.data.statuses, carried)
  }, [raproOccQ.data, raproDayQ.data, raproRangeQ.data, windowDays])

  // Moyennes sur la fenêtre 30 j (sous-textes des cartes rapro) — même décompte
  // que l'analytique rapro (vue `rapro_daily_agg`, jours CLÔTURÉS uniquement), sur
  // la plage glissante. Dénominateur = jours actifs (avec données) de la fenêtre.
  // Le roulement (« bloquées de la veille ») n'y est pas agrégé → pas de moyenne
  // pour cette carte.
  const raproWinQ = useQuery({
    queryKey: ['rapro', 'daily-agg-range', windowFrom, date],
    queryFn: () => fetchRaproDailyAgg(windowFrom, date),
    enabled: canRapro,
  })
  const raproAvg = useMemo(() => {
    const byDay = raproWinQ.data
    if (!byDay || byDay.size === 0) return null
    // La vue ne renvoie que les jours clôturés PORTEURS de données → chaque entrée
    // est un jour actif : `byDay.size` = dénominateur.
    const totals = sumCounts(byDay)
    const active = byDay.size
    return {
      nettoyees: cleaned(totals) / active,
      refus: totals.refus / active,
      bloqueesJour: totals.bloquee / active,
    }
  }, [raproWinQ.data])

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
            hint="Petits-déjeuners inclus dus ce jour (facturés au tarif de la réservation, qu'ils aient été pris ou non)."
            value={fmtInt(pdj.included)}
            sub={pdj.hasAddon ? subMuted(fmtEur(pdj.includedHT, 2)) : undefined}
          />
          <StatTile
            label="PDJ Extra"
            accent="#fbbf24"
            hint="Petits-déjeuners servis au-delà des inclus ce jour, valorisés au tarif PDJ standard."
            value={fmtInt(pdj.extrasCount)}
            sub={pdj.hasAddon ? subMuted(fmtEur(pdj.extrasHT, 2)) : undefined}
          />
          {/* CA PDJ & captage : MOYENNE sur 30 j glissants. */}
          <StatTile
            label="CA PDJ"
            accent="#60a5fa"
            hint="Chiffre d'affaires HT du petit-déjeuner ce jour (inclus + extras). En dessous : moyenne sur les 30 derniers jours."
            value={pdj.hasAddon ? fmtEur(pdj.totalHT, 2) : fmtEur(0, 0)}
            sub={
              pdjWin && pdjWin.total.avgTotalHT != null
                ? subMuted(`moy. ${fmtEur(pdjWin.total.avgTotalHT, 2)}/j`)
                : undefined
            }
          />
          <StatTile
            label="Captage"
            accent="#f472b6"
            hint="Part des clients logés ayant pris un petit-déjeuner ce jour. En dessous : moyenne sur les 30 derniers jours."
            value={pdj.captage == null ? '—' : fmtPctInt(pdj.captage)}
            sub={
              pdjWin && pdjWin.captage.avgCaptage != null
                ? subMuted(`moy. ${fmtPctInt(pdjWin.captage.avgCaptage)}/j`)
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
          {/* Occupation : NOMBRE de places occupées (sans %), moyenne 30 j en
              sous-texte. Captage : moyenne 30 j en % (choix produit — les pages
              parking n'en portent pas, dans l'esprit des benchmarks PDJ). */}
          <StatTile
            label="Occupation"
            accent={ACCENT.cyan}
            hint="Nombre de places de parking occupées ce jour, toutes réservations confondues. En dessous : moyenne sur les 30 derniers jours."
            value={fmtInt(parkingAgg.day.occupied)}
            sub={
              parkingAgg.avgOccupied > 0
                ? subMuted(`moy. ${fmtInt(parkingAgg.avgOccupied)} / jour`)
                : undefined
            }
          />
          {/* Arrivées / Départs : `moy. X / jour` (analytique mensuel), si > 0. */}
          <StatTile
            label="Arrivées"
            accent={ACCENT.indigo}
            hint="Nombre d'arrivées parking ce jour. En dessous : moyenne sur les 30 derniers jours."
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
            hint="Nombre de départs parking ce jour. En dessous : moyenne sur les 30 derniers jours."
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
            hint="Taux d'occupation du parking rapporté au taux d'occupation de l'hôtel ce jour. En dessous : moyenne sur les 30 derniers jours."
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
          {/* Sous-textes = moyenne sur 30 j glissants (jours clôturés actifs), même
              décompte que l'analytique rapro. Exception : « bloquées de la veille »
              (roulement) n'est pas agrégé → pas de moyenne. */}
          <StatTile
            label="Nettoyées"
            accent={CATEGORY_COLOR.nettoyee}
            hint="Chambres nettoyées ce jour (par défaut ou en rattrapage). En dessous : moyenne sur les 30 derniers jours clôturés."
            value={fmtInt(rapro.nettoyees)}
            sub={
              raproAvg
                ? subMuted(`moy. ${fmtInt(raproAvg.nettoyees)} / jour`)
                : undefined
            }
          />
          <StatTile
            label="Refus"
            accent={CATEGORY_COLOR.refus}
            hint="Chambres en refus de service ce jour. En dessous : moyenne sur les 30 derniers jours clôturés."
            value={fmtInt(rapro.refus)}
            sub={
              raproAvg
                ? subMuted(`moy. ${fmtInt(raproAvg.refus)} / jour`)
                : undefined
            }
          />
          <StatTile
            label="Bloquées du jour"
            accent={CATEGORY_COLOR.bloquee}
            hint="Chambres occupées non nettoyées ce jour, reportées au lendemain. En dessous : moyenne sur les 30 derniers jours clôturés."
            value={fmtInt(rapro.bloqueesJour)}
            sub={
              raproAvg
                ? subMuted(`moy. ${fmtInt(raproAvg.bloqueesJour)} / jour`)
                : undefined
            }
          />
          <StatTile
            label="Bloquées de la veille"
            accent={CATEGORY_COLOR.bloquee}
            hint="Chambres bloquées la veille et toujours non résolues aujourd'hui (roulement) — cet indicateur ne s'agrège pas, pas de moyenne."
            value={fmtInt(rapro.bloqueesVeille)}
          />
        </SummaryBlock>
      )}
    </section>
  )
}
