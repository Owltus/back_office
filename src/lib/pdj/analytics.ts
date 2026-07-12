import { ALL_ROOMS } from '#/lib/pdj/csv.ts'
import type { PdjDayRow } from '#/lib/pdj/service.ts'

/*
 * Agrégation analytique des petits-déjeuners (métier pur, sans React).
 *
 * Alimente `PdjAnalytiqueBoard` : à partir des lignes brutes d'une plage de
 * jours (une ligne par (service_date, room)), produit une synthèse mensuelle
 * sur une année. Aucune écriture, aucun accès réseau ici — les lignes sont
 * lues en amont par `fetchRange`.
 */

const TOTAL_ROOMS = ALL_ROOMS.length

/** Synthèse d'un mois (indices 1..12). */
export interface PdjMonthStats {
  month: number
  /** Jours de service réellement présents (au moins une ligne). */
  days: number
  /** Chambres occupées cumulées sur le mois. */
  rooms: number
  /** Clients cumulés (couverts attendus). */
  guests: number
  /** PDJ inclus cumulés. */
  included: number
  /** PDJ réellement servis (saisis par le staff) cumulés. */
  served: number
  /** PDJ non inclus (potentiel d'upsell) = guests - included, borné à 0. */
  potential: number
  /** Taux d'occupation moyen des jours du mois (%). */
  avgOccupancy: number
}

/** Un mois vide (aucune donnée). */
function emptyMonth(month: number): PdjMonthStats {
  return {
    month,
    days: 0,
    rooms: 0,
    guests: 0,
    included: 0,
    served: 0,
    potential: 0,
    avgOccupancy: 0,
  }
}

/**
 * Agrège les lignes d'une année en 12 synthèses mensuelles. Les lignes hors
 * `year` sont ignorées (la plage lue peut déborder). Le taux d'occupation
 * mensuel est la moyenne des taux quotidiens (chambres occupées / 80), pour ne
 * pas biaiser un mois partiellement renseigné.
 */
export function aggregatePdjMonthly(
  rows: PdjDayRow[],
  year: number,
): PdjMonthStats[] {
  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1))
  // Somme des taux d'occupation quotidiens par mois (moyennée en fin de calcul).
  const occSum = new Array(12).fill(0)
  // Chambres distinctes vues par jour → taux quotidien exact.
  const seenPerDay = new Map<string, Set<number>>()

  const prefix = `${year}-`
  for (const r of rows) {
    if (!r.service_date.startsWith(prefix)) continue
    const m = Number(r.service_date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue

    const s = months[m]
    s.guests += r.guests ?? 0
    s.included += r.breakfasts_included ?? 0
    s.served += r.breakfasts_served ?? 0

    let seen = seenPerDay.get(r.service_date)
    if (!seen) {
      seen = new Set<number>()
      seenPerDay.set(r.service_date, seen)
    }
    seen.add(r.room)
  }

  // Chambres occupées + jours + occupation quotidienne, à partir des jours vus.
  for (const [date, seen] of seenPerDay) {
    const m = Number(date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    const s = months[m]
    s.days += 1
    s.rooms += seen.size
    occSum[m] += (seen.size / TOTAL_ROOMS) * 100
  }

  for (let i = 0; i < 12; i++) {
    const s = months[i]
    s.potential = Math.max(0, s.guests - s.included)
    s.avgOccupancy = s.days > 0 ? occSum[i] / s.days : 0
  }
  return months
}

/** Synthèse d'un jour de service (détail mensuel). */
export interface PdjDayStats {
  /** Date du jour de service, 'YYYY-MM-DD'. */
  date: string
  /** Numéro du jour dans le mois. */
  day: number
  /** Chambres occupées (chambres distinctes ce jour). */
  rooms: number
  /** Clients (couverts attendus). */
  guests: number
  /** PDJ inclus. */
  included: number
  /** PDJ réellement servis (saisis par le staff). */
  served: number
  /** PDJ non inclus (potentiel d'upsell) = guests - included, borné à 0. */
  potential: number
  /** Taux d'occupation du jour (%). */
  occupancy: number
}

/**
 * Agrège les lignes d'un mois en une synthèse par jour de service. Une entrée
 * par `service_date` réellement présent dans (`year`, `month`), triée par date
 * croissante. Les lignes hors du mois demandé sont ignorées (la plage lue peut
 * déborder). Même logique de comptage que `aggregatePdjMonthly` : chambres
 * distinctes par jour.
 */
export function aggregatePdjDaily(
  rows: PdjDayRow[],
  year: number,
  month: number,
): PdjDayStats[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const byDate = new Map<
    string,
    { guests: number; included: number; served: number; rooms: Set<number> }
  >()

  for (const r of rows) {
    if (!r.service_date.startsWith(prefix)) continue
    let s = byDate.get(r.service_date)
    if (!s) {
      s = { guests: 0, included: 0, served: 0, rooms: new Set<number>() }
      byDate.set(r.service_date, s)
    }
    s.guests += r.guests ?? 0
    s.included += r.breakfasts_included ?? 0
    s.served += r.breakfasts_served ?? 0
    s.rooms.add(r.room)
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, s]) => {
      const rooms = s.rooms.size
      return {
        date,
        day: Number(date.slice(8, 10)),
        rooms,
        guests: s.guests,
        included: s.included,
        served: s.served,
        potential: Math.max(0, s.guests - s.included),
        occupancy: (rooms / TOTAL_ROOMS) * 100,
      }
    })
}

/** Années présentes dans une liste de dates 'YYYY-MM-DD' (croissant). */
export function yearsFromDates(dates: string[], fallback: number): number[] {
  const set = new Set<number>()
  for (const d of dates) {
    const y = Number(d.slice(0, 4))
    if (Number.isFinite(y)) set.add(y)
  }
  set.add(fallback)
  return [...set].sort((a, b) => a - b)
}
