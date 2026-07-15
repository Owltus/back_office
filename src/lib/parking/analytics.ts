import { FIRST_STAFF_SPOT } from '#/lib/parking/model.ts'
import type { DbReservation } from '#/lib/parking/service.ts'

/*
 * Agrégation analytique du planning parking (métier pur, sans React).
 *
 * Alimente `ParkingAnalytiqueBoard` : à partir des lignes brutes lues en base
 * (une par réservation, avec `start_date` en date absolue), produit une synthèse
 * mensuelle sur une année. Aucune écriture, aucun accès réseau ici — les lignes
 * sont lues en amont par `fetchReservations`.
 *
 * AUCUN montant € : la table `parking_reservations` ne porte pas de tarif ; on ne
 * calcule donc jamais de chiffre d'affaires.
 */

// Places réellement louées aux clients : on exclut les places personnel
// (spot >= FIRST_STAFF_SPOT, soit 13 et 14) → 12 places client.
const CLIENT_SPOTS = FIRST_STAFF_SPOT - 1

/** Synthèse d'un mois (indices 1..12). */
export interface ParkingMonthStats {
  month: number
  /** Réservations dont l'arrivée (`start_date`) tombe dans le mois. */
  reservations: number
  /** Nuits cumulées (somme des `nights`) sur le mois. */
  nights: number
  /**
   * Taux d'occupation moyen (%) : places-nuits client occupées rapportées à la
   * capacité du mois (12 places × nombre de jours du mois).
   *
   * Approximation MVP : chaque réservation est comptée EN ENTIER dans le mois de
   * son `start_date`, même si le séjour déborde sur le mois suivant. Suffisant
   * pour dégager une tendance ; à raffiner si un découpage exact au jour devient
   * nécessaire.
   */
  occupancyRate: number
  /** Réservations au statut « payé ». */
  paid: number
  /** Réservations au statut « réservé » (en attente de paiement). */
  reserved: number
  /** Réservations au statut « non payé » (checkout impayé). */
  unpaid: number
}

/** Un mois vide (aucune donnée). */
function emptyMonth(month: number): ParkingMonthStats {
  return {
    month,
    reservations: 0,
    nights: 0,
    occupancyRate: 0,
    paid: 0,
    reserved: 0,
    unpaid: 0,
  }
}

/** Nombre de jours d'un mois (1..12) d'une année donnée. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Agrège les réservations d'une année en 12 synthèses mensuelles. Les lignes
 * hors `year` sont ignorées (la lecture charge tout l'historique). L'axe est
 * l'arrivée (`start_date`) ; les places personnel (>= FIRST_STAFF_SPOT) sont
 * exclues du calcul d'occupation mais comptées dans les statuts/nuits.
 */
export function aggregateParkingMonthly(
  reservations: DbReservation[],
  year: number,
): ParkingMonthStats[] {
  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1))
  // Places-nuits CLIENT occupées par mois (personnel exclu du calcul d'occupation).
  const clientNights = new Array(12).fill(0)

  const prefix = `${year}-`
  for (const r of reservations) {
    if (!r.start_date.startsWith(prefix)) continue
    const m = Number(r.start_date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue

    const s = months[m]
    s.reservations += 1
    s.nights += r.nights
    if (r.status === 'paye') s.paid += 1
    else if (r.status === 'reserve') s.reserved += 1
    else if (r.status === 'checkout') s.unpaid += 1

    if (r.spot < FIRST_STAFF_SPOT) clientNights[m] += r.nights
  }

  for (let i = 0; i < 12; i++) {
    const s = months[i]
    const capacity = CLIENT_SPOTS * daysInMonth(year, i + 1)
    s.occupancyRate = capacity > 0 ? (clientNights[i] / capacity) * 100 : 0
  }
  return months
}

/** Synthèse d'un JOUR du calendrier (occupation réelle au jour le jour). */
export interface ParkingDayStats {
  /** Date du jour au format 'YYYY-MM-DD'. */
  date: string
  /** Numéro du jour dans le mois (1..dernier). */
  day: number
  /** Places CLIENT distinctes occupées ce jour (spots < FIRST_STAFF_SPOT). */
  occupiedClient: number
  /** Taux d'occupation client du jour (%) : occupiedClient / 12 × 100. */
  occupancy: number
  /** Réservations dont l'arrivée (`start_date`) tombe ce jour. */
  arrivals: number
  /** Réservations dont le départ (`start_date` + `nights`) tombe ce jour. */
  departures: number
}

/** Date locale → 'YYYY-MM-DD' (sans piège UTC de toISOString). */
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Agrège les réservations en une entrée par jour du calendrier du mois
 * (1..dernier jour). Occupation RÉELLE : une réservation couvre un jour si
 * `start_date <= jour < start_date + nights`. Les places personnel
 * (>= FIRST_STAFF_SPOT) sont exclues du décompte d'occupation. Comparaison de
 * dates en chaînes 'YYYY-MM-DD' construites proprement (padStart), jamais via
 * toISOString.
 */
export function aggregateParkingDaily(
  reservations: DbReservation[],
  year: number,
  month: number,
): ParkingDayStats[] {
  const nDays = new Date(year, month, 0).getDate()

  // Fenêtre de chaque réservation : bornes en chaînes 'YYYY-MM-DD'. La borne de
  // fin (départ) est exclusive côté occupation, inclusive côté « départs ».
  const enriched = reservations.map((r) => {
    const [sy, sm, sd] = r.start_date.split('-').map(Number)
    const end = new Date(sy, sm - 1, sd + r.nights)
    return { spot: r.spot, start: r.start_date, end: ymd(end) }
  })

  const result: ParkingDayStats[] = []
  for (let day = 1; day <= nDays; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(
      day,
    ).padStart(2, '0')}`
    const spots = new Set<number>()
    let arrivals = 0
    let departures = 0

    for (const e of enriched) {
      if (e.start <= dateStr && dateStr < e.end && e.spot < FIRST_STAFF_SPOT) {
        spots.add(e.spot)
      }
      if (e.start === dateStr) arrivals += 1
      if (e.end === dateStr) departures += 1
    }

    const occupiedClient = spots.size
    result.push({
      date: dateStr,
      day,
      occupiedClient,
      occupancy: CLIENT_SPOTS > 0 ? (occupiedClient / CLIENT_SPOTS) * 100 : 0,
      arrivals,
      departures,
    })
  }
  return result
}

/** Années présentes dans les `start_date` d'une liste de réservations (croissant). */
export function yearsFromReservations(
  reservations: DbReservation[],
  fallback: number,
): number[] {
  const set = new Set<number>()
  for (const r of reservations) {
    const y = Number(r.start_date.slice(0, 4))
    if (Number.isFinite(y)) set.add(y)
  }
  set.add(fallback)
  return [...set].sort((a, b) => a - b)
}
