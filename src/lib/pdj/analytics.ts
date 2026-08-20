import { ALL_ROOMS } from '#/lib/pdj/csv.ts'
import type { PdjAggRow } from '#/lib/pdj/service.ts'

/*
 * Agrégation analytique des petits-déjeuners (métier pur, sans React).
 *
 * Alimente `PdjAnalytiqueBoard` : à partir des lignes de la VUE `pdj_daily_agg`
 * (une par (service_date, code), déjà pré-agrégées côté base), produit une
 * synthèse mensuelle sur une année. Aucune écriture, aucun accès réseau ici — les
 * lignes sont lues en amont par `fetchDailyAgg`.
 *
 * Note clé : `extra` / `no_show` de la vue sont DÉJÀ sommés par chambre
 * (greatest(...,0) avant somme). On les additionne donc simplement entre codes
 * d'un même jour — surtout PAS `max(0, Σservi − Σinclus)` qui serait faux.
 */

const TOTAL_ROOMS = ALL_ROOMS.length

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
  /** Captage = (inclus + extras) ÷ clients (%). Base = inclus, augmente avec les
   * extras. `null` seulement si aucun client. */
  conversion: number | null
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
  }
}

/**
 * Agrège les lignes d'une année en 12 synthèses mensuelles. Les lignes hors
 * `year` sont ignorées (la plage lue peut déborder). Le taux d'occupation
 * mensuel est la moyenne des taux quotidiens (chambres occupées / 80), pour ne
 * pas biaiser un mois partiellement renseigné.
 */
export function aggregatePdjMonthly(
  rows: PdjAggRow[],
  year: number,
  /** Externes PAR JOUR (service_date → nb) : s'additionnent aux extras du jour,
   *  y compris pour un jour sans conso saisie côté chambres (cf. plus bas). */
  externalsByDate: Map<string, number> = new Map(),
): PdjMonthStats[] {
  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1))
  // Somme des taux d'occupation quotidiens par mois (moyennée en fin de calcul).
  const occSum = new Array(12).fill(0)
  // Totaux PAR JOUR (sommés entre les codes du jour) : chambres pour l'occupation,
  // servi / extra / non-venu pour l'agrégation mensuelle avec garde-fou « jour
  // renseigné » (voir plus bas). Une entrée par jour, tous codes confondus.
  const perDay = new Map<
    string,
    { month: number; rooms: number; served: number; extra: number; noShow: number }
  >()

  const prefix = `${year}-`
  for (const r of rows) {
    if (!r.service_date.startsWith(prefix)) continue
    const m = Number(r.service_date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue

    const s = months[m]
    s.guests += r.guests
    s.included += r.included
    s.served += r.served

    // Extra / non-venus : la vue les a DÉJÀ sommés par chambre → on additionne
    // simplement les codes du jour. Agrégé au mois plus bas, en n'y gardant que les
    // jours dont la conso a été SAISIE (servi > 0). `rooms` = chambres du jour.
    let pd = perDay.get(r.service_date)
    if (!pd) {
      pd = { month: m, rooms: 0, served: 0, extra: 0, noShow: 0 }
      perDay.set(r.service_date, pd)
    }
    pd.rooms += r.rooms
    pd.served += r.served
    pd.extra += r.extra
    pd.noShow += r.no_show
  }

  // Externes : s'additionnent à l'extra du jour (uniquement les jours déjà
  // présents via l'In-House — un jour à 0 chambre occupée n'arrive pas en
  // pratique, cf. analytics.ts en tête de fichier).
  for (const [date, ext] of externalsByDate) {
    if (ext <= 0 || !date.startsWith(prefix)) continue
    const pd = perDay.get(date)
    if (pd) pd.extra += ext
  }

  // Chambres occupées + jours + occupation quotidienne, à partir des jours vus.
  for (const pd of perDay.values()) {
    const s = months[pd.month]
    s.days += 1
    s.rooms += pd.rooms
    occSum[pd.month] += (pd.rooms / TOTAL_ROOMS) * 100
  }

  // Extra / non-venus : n'agréger QUE les jours réellement renseignés (au moins un
  // servi). Un jour sans conso saisie (servi = 0 partout) est écarté — sinon tout son
  // inclus basculerait en faux « non venus » (y compris un jour à externes seuls,
  // sans aucune case cochée en chambre : le non-venu resterait non fiable). Un mois
  // sans AUCUN jour renseigné reste à null (« — » à l'affichage), pas un trompeur « 0 ».
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
    // Captage = (inclus + extras) ÷ clients : base = inclus (réel, issu des
    // réservations), augmente avec les extras. « — » (null) seulement sans client.
    s.conversion =
      s.guests > 0 ? ((s.included + (s.extra ?? 0)) / s.guests) * 100 : null
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
  /** Captage = (inclus + extras) ÷ clients (%). Base = inclus, augmente avec les
   * extras. `null` seulement si aucun client. */
  conversion: number | null
}

/**
 * Agrège les lignes d'un mois en une synthèse par jour de service. Une entrée
 * par `service_date` réellement présent dans (`year`, `month`), triée par date
 * croissante. Les lignes hors du mois demandé sont ignorées (la plage lue peut
 * déborder). Même logique de comptage que `aggregatePdjMonthly` : chambres
 * distinctes par jour.
 */
export function aggregatePdjDaily(
  rows: PdjAggRow[],
  year: number,
  month: number,
  /** Externes PAR JOUR (service_date → nb) : s'additionnent aux extras du jour. */
  externalsByDate: Map<string, number> = new Map(),
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
      rooms: number
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
        rooms: 0,
      }
      byDate.set(r.service_date, s)
    }
    s.guests += r.guests
    s.included += r.included
    s.served += r.served
    // Déjà sommés par chambre côté vue → simple addition des codes du jour.
    s.extra += r.extra
    s.noShow += r.no_show
    s.rooms += r.rooms
  }

  // Externes : s'additionnent à l'extra du jour (jours déjà présents via l'In-House).
  for (const [date, ext] of externalsByDate) {
    if (ext <= 0 || !date.startsWith(prefix)) continue
    const s = byDate.get(date)
    if (s) s.extra += ext
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, s]) => {
      const rooms = s.rooms
      // Extra / non-venus : NON calculables si la conso du jour n'a pas été saisie
      // (aucun servi) NI d'externe recensé → null (« — »), pas un faux 0 qui
      // compterait tout l'inclus.
      const recorded = s.served > 0 || s.extra > 0
      return {
        date,
        day: Number(date.slice(8, 10)),
        rooms,
        guests: s.guests,
        included: s.included,
        served: s.served,
        extra: recorded ? s.extra : null,
        noShow: s.served > 0 ? s.noShow : null,
        potential: Math.max(0, s.guests - s.included),
        occupancy: (rooms / TOTAL_ROOMS) * 100,
        // Captage = (inclus + extras) ÷ clients : base = inclus, augmente avec les
        // extras. « — » (null) seulement sans client.
        conversion:
          s.guests > 0 ? ((s.included + s.extra) / s.guests) * 100 : null,
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
