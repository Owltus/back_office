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

/*
 * Capacité en CLIENTS (pas en chambres). Par défaut 2 personnes par chambre
 * (chambres doubles) → 80 × 2 = 160 clients/jour au maximum. Sert de dénominateur
 * à la « remplissage » : servi rapporté à la capacité clients de la période, et
 * NON au nombre de chambres (sinon on mélange couverts et chambres). La conversion,
 * elle, se rapporte aux clients réellement PRÉSENTS (guests).
 */
const PAX_PER_ROOM = 2
export const MAX_CLIENTS_PER_DAY = TOTAL_ROOMS * PAX_PER_ROOM

/** Synthèse d'un mois (indices 1..12). */
export interface PdjMonthStats {
  month: number
  /** Jours de service réellement présents (au moins une ligne). */
  days: number
  /** Jours dont la conso a été SAISIE (au moins un servi) — dénominateur des
   * moyennes servi/extra/non-servi (les jours non renseignés sont écartés). */
  recordedDays: number
  /** Chambres occupées cumulées sur le mois. */
  rooms: number
  /** Clients cumulés (couverts attendus). */
  guests: number
  /** PDJ inclus cumulés. */
  included: number
  /** PDJ réellement servis (saisis par le staff) cumulés. */
  served: number
  /** PDJ servis à des clients NON inclus (extra / walk-in) : Σ max(0, servi − inclus)
   * par chambre, sur les seuls jours renseignés. `null` = aucun jour renseigné. */
  extra: number | null
  /** PDJ inclus mais JAMAIS servis (payé, pas venu) : Σ max(0, inclus − servi) par
   * chambre, sur les seuls jours renseignés. `null` = aucun jour renseigné (on ne
   * peut PAS dire « non venus » sans conso saisie). */
  noShow: number | null
  /** PDJ non inclus (potentiel d'upsell) = guests - included, borné à 0. */
  potential: number
  /** Taux d'occupation moyen des jours du mois (%, base CHAMBRES : occupées / 80). */
  avgOccupancy: number
  /** Conversion = servi ÷ clients PRÉSENTS (%). `null` si aucun client. */
  conversion: number | null
  /** Remplissage = servi ÷ capacité CLIENTS de la période (160/j × jours) (%).
   * `null` si aucun jour. Pendant « RevPAR » en base clients. */
  coverage: number | null
}

/** Un mois vide (aucune donnée). */
function emptyMonth(month: number): PdjMonthStats {
  return {
    month,
    days: 0,
    recordedDays: 0,
    rooms: 0,
    guests: 0,
    included: 0,
    served: 0,
    extra: null,
    noShow: null,
    potential: 0,
    avgOccupancy: 0,
    conversion: null,
    coverage: null,
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
  // Conso SAISIE par jour (servi / extra / non-venu). Agrégée au mois dans un second
  // temps, avec garde-fou « jour renseigné » (voir plus bas).
  const perDay = new Map<
    string,
    { month: number; served: number; extra: number; noShow: number }
  >()

  const prefix = `${year}-`
  for (const r of rows) {
    if (!r.service_date.startsWith(prefix)) continue
    const m = Number(r.service_date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue

    const s = months[m]
    const inc = r.breakfasts_included
    const srv = r.breakfasts_served
    s.guests += r.guests
    s.included += inc
    s.served += srv

    // Extra / non-venus : accumulés PAR JOUR (et par chambre : max(0, …) avant somme,
    // sinon un extra et un non-venu du même jour s'annuleraient). On agrège au mois
    // plus bas, en n'y gardant que les jours dont la conso a été SAISIE (servi > 0).
    let pd = perDay.get(r.service_date)
    if (!pd) {
      pd = { month: m, served: 0, extra: 0, noShow: 0 }
      perDay.set(r.service_date, pd)
    }
    pd.served += srv
    pd.extra += Math.max(0, srv - inc)
    pd.noShow += Math.max(0, inc - srv)

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

  // Extra / non-venus : n'agréger QUE les jours réellement renseignés (au moins un
  // servi). Un jour sans conso saisie (servi = 0 partout) est écarté — sinon tout son
  // inclus basculerait en faux « non venus ». Un mois sans AUCUN jour renseigné reste
  // à null (« — » à l'affichage), pas un trompeur « 0 ».
  for (const pd of perDay.values()) {
    if (pd.served <= 0) continue
    const s = months[pd.month]
    s.recordedDays += 1
    s.extra = (s.extra ?? 0) + pd.extra
    s.noShow = (s.noShow ?? 0) + pd.noShow
  }

  for (let i = 0; i < 12; i++) {
    const s = months[i]
    s.potential = Math.max(0, s.guests - s.included)
    s.avgOccupancy = s.days > 0 ? occSum[i] / s.days : 0
    // Conversion : servi rapporté aux clients PRÉSENTS (base clients).
    s.conversion = s.guests > 0 ? (s.served / s.guests) * 100 : null
    // Remplissage : servi rapporté à la capacité CLIENTS de la période (160/j × jours
    // renseignés), pas au nombre de chambres. Bas si l'hôtel est peu rempli en clients.
    s.coverage =
      s.days > 0 ? (s.served / (MAX_CLIENTS_PER_DAY * s.days)) * 100 : null
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
  /** PDJ servis à des clients NON inclus (extra / walk-in) : Σ max(0, servi − inclus)
   * par chambre. `null` si la conso du jour n'a pas été saisie (servi = 0 partout). */
  extra: number | null
  /** PDJ inclus mais JAMAIS servis (payé, pas venu) : Σ max(0, inclus − servi) par
   * chambre. `null` si la conso du jour n'a pas été saisie (on ne peut PAS dire
   * « non venus » sans servi). */
  noShow: number | null
  /** PDJ non inclus (potentiel d'upsell) = guests - included, borné à 0. */
  potential: number
  /** Taux d'occupation du jour (%, base CHAMBRES : occupées / 80). */
  occupancy: number
  /** Conversion = servi ÷ clients PRÉSENTS (%). `null` si aucun client. */
  conversion: number | null
  /** Remplissage = servi ÷ capacité CLIENTS du jour (160) (%). */
  coverage: number | null
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
    {
      guests: number
      included: number
      served: number
      extra: number
      noShow: number
      rooms: Set<number>
    }
  >()

  for (const r of rows) {
    if (!r.service_date.startsWith(prefix)) continue
    let s = byDate.get(r.service_date)
    if (!s) {
      s = {
        guests: 0,
        included: 0,
        served: 0,
        extra: 0,
        noShow: 0,
        rooms: new Set<number>(),
      }
      byDate.set(r.service_date, s)
    }
    const inc = r.breakfasts_included
    const srv = r.breakfasts_served
    s.guests += r.guests
    s.included += inc
    s.served += srv
    // Par chambre avant sommation (cf. aggregatePdjMonthly).
    s.extra += Math.max(0, srv - inc)
    s.noShow += Math.max(0, inc - srv)
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
        // Extra / non-venus : NON calculables si la conso du jour n'a pas été saisie
        // (aucun servi) → null (« — »), pas un faux 0 qui compterait tout l'inclus.
        extra: s.served > 0 ? s.extra : null,
        noShow: s.served > 0 ? s.noShow : null,
        potential: Math.max(0, s.guests - s.included),
        occupancy: (rooms / TOTAL_ROOMS) * 100,
        // Conversion : base clients présents. Remplissage : base capacité clients du
        // jour (160 = 80 ch. × 2), pas les chambres.
        conversion: s.guests > 0 ? (s.served / s.guests) * 100 : null,
        coverage: (s.served / MAX_CLIENTS_PER_DAY) * 100,
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
