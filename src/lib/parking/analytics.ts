import { CLIENT_SPOTS, SPOTS } from '#/lib/parking/model.ts'
import type {
  ParkingArrivalsRow,
  ParkingDailyOccRow,
} from '#/lib/parking/service.ts'
import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts'

/*
 * Agrégation analytique du planning parking (métier pur, sans React).
 *
 * Alimente `ParkingAnalytiqueBoard` (annuel) et `ParkingAnalytiqueMoisBoard`
 * (mensuel) à partir des VUES d'agrégation (`parking_arrivals_agg`,
 * `parking_daily_occupation`), pré-réduites côté base. Le planning `/parking`, lui,
 * garde les réservations brutes + son temps réel — il ne passe PAS par ici.
 *
 * Particularité parking : une réservation couvre plusieurs jours. C'est la VUE
 * `parking_daily_occupation` qui « déplie » l'occupation jour par jour (generate_series) ;
 * ici on ne fait plus que sommer/compléter, jamais recalculer un chevauchement.
 *
 * CA (chiffre d'affaires) : calculé côté vue SQL (`ca_ht`/`ca_ttc` de
 * `parking_arrivals_agg`), au tarif VERSIONNÉ en vigueur à la date d'arrivée
 * de chaque réservation (`parking_tarifs`) — ici on ne fait que sommer par
 * mois, jamais recalculer un prix. Ne porte que sur les nuitées facturables
 * (`reserve`/`paye`/`checkout`) : ni `employe` (jamais facturé), ni
 * `gratuite` (gratuite par définition).
 */

// Le taux d'occupation rapporte les places occupées aux 14 places du parking
// (SPOTS) : numérateur et dénominateur portent sur le MÊME périmètre, places
// tampon 13 & 14 comprises. Le taux est donc borné à 100 % — c'est le sens de
// la révision du 2026-09-22, qui annule le dénominateur à 12 places retenu le
// 2026-08-12. Le planning `/parking`, lui, garde son propre taux sur les 12
// places CLIENT : c'est ce dépassement de 100 % qui y signale le débordement
// sur les places tampon (ParkingBoard.tsx). Deux écrans, deux questions.

/* --------------------------------------------------------------------------
 * CAPTAGE PARKING — définition unique (page + analytiques).
 *
 * On NE remesure PAS le remplissage du parking : ce serait le taux d'occupation,
 * et comparer les 12 places à tout l'hôtel donne un ratio minuscule (jamais 100 %).
 * Le captage compare le remplissage du parking client à celui de l'hôtel :
 *
 *   captage = taux d'occupation parking client ÷ taux d'occupation hôtel
 *           = (places client / 12) ÷ (chambres occupées / 80)
 *
 * Le nombre de jours d'une période se simplifie entre haut et bas → on l'applique
 * directement sur les cumuls bruts (places-nuits client, nuitées hôtel).
 *
 * PLAFONNÉ À 100 % pour rester une jauge lisible 0–100 % :
 *   100 % : le parking est AU MOINS aussi rempli (en proportion) que l'hôtel →
 *           on capte toute la demande que l'occupation hôtel laisse espérer.
 *   < 100 % : le parking est À LA TRAÎNE derrière l'hôtel (demande laissée filer).
 *     0 % : des clients présents mais parking vide (potentiel raté, pas d'argent).
 * (Un parking « plus tendu » que l'hôtel — division > 100 % — est ramené à 100 %,
 * son maximum : on ne peut pas capter plus que tout.) Jamais négatif. `null` si
 * l'occupation hôtel est inconnue (dénominateur nul) → affiché « — ».
 * ------------------------------------------------------------------------ */

/**
 * Indice de captage (%) borné 0–100 % : occupation parking client rapportée à
 * l'occupation hôtel, sur des cumuls bruts (le nb de jours se simplifie),
 * plafonné à 100 %. `null` si aucune base hôtel connue.
 */
export function captageIndex(
  clientOccupied: number,
  hotelRooms: number,
): number | null {
  if (hotelRooms <= 0) return null
  const ratio = (clientOccupied / CLIENT_SPOTS / (hotelRooms / TOTAL_ROOMS)) * 100
  return Math.min(100, ratio)
}

/** Synthèse d'un mois (indices 1..12). */
export interface ParkingMonthStats {
  month: number
  /** Réservations dont l'arrivée (`start_date`) tombe dans le mois. */
  reservations: number
  /** Nuits cumulées (somme des `nights`) sur le mois. */
  nights: number
  /** Nuits-places CLIENT (personnel exclu) cumulées — numérateur du captage
   * hôtelier (rapporté aux nuitées de l'hôtel). */
  clientNights: number
  /**
   * Taux d'occupation moyen (%) : place-nuits occupées (TOUTES places, personnel
   * 13 & 14 compris) rapportées à la capacité du mois (14 places × jours du
   * mois). Même périmètre en haut et en bas : le taux ne dépasse pas 100 %.
   *
   * Approximation MVP : chaque réservation est comptée EN ENTIER dans le mois de
   * son `start_date`, même si le séjour déborde sur le mois suivant. Suffisant
   * pour dégager une tendance ; à raffiner si un découpage exact au jour devient
   * nécessaire. ATTENTION : c'est la SEULE raison pour laquelle ce taux-ci peut
   * encore dépasser 100 % (séjours longs démarrant en fin de mois). Le taux
   * JOURNALIER, lui, est borné par construction.
   */
  occupancyRate: number
  /** Réservations au statut « payé ». */
  paid: number
  /** Réservations au statut « réservé » (en attente de paiement). */
  reserved: number
  /** Réservations au statut « gratuité ». */
  free: number
  /** Nuits cumulées des réservations « gratuité ». */
  freeNights: number
  /** CA HT du mois (nuitées reserve/paye/checkout uniquement, au tarif en
   * vigueur à la date d'arrivée de chaque réservation). */
  caHt: number
  /** CA TTC du mois (même périmètre). */
  caTtc: number
}

/** Un mois vide (aucune donnée). */
function emptyMonth(month: number): ParkingMonthStats {
  return {
    month,
    reservations: 0,
    nights: 0,
    clientNights: 0,
    occupancyRate: 0,
    paid: 0,
    reserved: 0,
    free: 0,
    freeNights: 0,
    caHt: 0,
    caTtc: 0,
  }
}

/** Nombre de jours d'un mois (1..12) d'une année donnée. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Agrège les lignes d'arrivée (vue `parking_arrivals_agg`, une par start_date) d'une
 * année en 12 synthèses mensuelles. Les lignes hors `year` sont ignorées. L'axe est
 * l'arrivée (`start_date`) ; l'occupation compte TOUTES les places (personnel
 * compris, via `nights`), le captage isole les nuits-places client (`client_nights`).
 */
export function aggregateParkingMonthly(
  rows: ParkingArrivalsRow[],
  year: number,
): ParkingMonthStats[] {
  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(i + 1))
  // Places-nuits CLIENT occupées par mois (personnel exclu du calcul d'occupation).
  const clientNights = new Array(12).fill(0)

  const prefix = `${year}-`
  for (const r of rows) {
    if (!r.start_date.startsWith(prefix)) continue
    const m = Number(r.start_date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue

    const s = months[m]
    s.reservations += r.reservations
    s.nights += r.nights
    s.paid += r.paid
    s.reserved += r.reserved
    // `?? 0` : tolère une vue `parking_arrivals_agg` pas encore migrée (colonnes
    // gratuité/CA absentes le temps que le SQL soit joué en prod) sans propager
    // de NaN dans les totaux.
    s.free += r.free ?? 0
    s.freeNights += r.free_nights ?? 0
    s.caHt += r.ca_ht ?? 0
    s.caTtc += r.ca_ttc ?? 0

    clientNights[m] += r.client_nights
  }

  for (let i = 0; i < 12; i++) {
    const s = months[i]
    // Occupation = place-nuits TOUTES places (s.nights) / (14 places × jours).
    const capacity = SPOTS * daysInMonth(year, i + 1)
    s.clientNights = clientNights[i]
    s.occupancyRate = capacity > 0 ? (s.nights / capacity) * 100 : 0
  }
  return months
}

/** Synthèse d'un JOUR du calendrier (occupation réelle au jour le jour). */
export interface ParkingDayStats {
  /** Date du jour au format 'YYYY-MM-DD'. */
  date: string
  /** Numéro du jour dans le mois (1..dernier). */
  day: number
  /** Places distinctes occupées ce jour, TOUTES places (personnel compris). */
  occupied: number
  /** Places CLIENT distinctes occupées ce jour (spots < FIRST_STAFF_SPOT),
   * conservées pour le seul calcul de captage. */
  occupiedClient: number
  /** Places distinctes en statut « gratuité » occupées ce jour (déjà comptées
   * dans `occupied`/`occupiedClient` — colonne dédiée en plus, pas exclusive). */
  occupiedFree: number
  /** Taux d'occupation du jour (%) : occupied / 14 places × 100. Borné à 100 %
   * par construction : `occupied` est un count(distinct spot) sur 14 places. */
  occupancy: number
  /** Réservations dont l'arrivée (`start_date`) tombe ce jour. */
  arrivals: number
  /** Réservations dont le départ (`start_date` + `nights`) tombe ce jour. */
  departures: number
}

/**
 * Construit une entrée par jour du calendrier du mois (1..dernier jour) à partir
 * des lignes de la vue `parking_daily_occupation` (occupation déjà dépliée côté
 * base). Les jours absents de la vue (aucune occupation/arrivée/départ) sont
 * complétés à zéro. Occupation compte TOUTES les places ; `occupiedClient` isole
 * les places client pour le captage. `rows` peut couvrir une plage plus large que
 * le mois : seuls les jours du mois sont retenus (lookup par date exacte).
 */
export function aggregateParkingDaily(
  rows: ParkingDailyOccRow[],
  year: number,
  month: number,
): ParkingDayStats[] {
  const nDays = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const byDate = new Map<string, ParkingDailyOccRow>()
  for (const r of rows) byDate.set(r.date, r)

  const result: ParkingDayStats[] = []
  for (let day = 1; day <= nDays; day++) {
    const dateStr = `${year}-${mm}-${String(day).padStart(2, '0')}`
    const r = byDate.get(dateStr)
    const occupied = r?.occupied ?? 0
    result.push({
      date: dateStr,
      day,
      occupied,
      occupiedClient: r?.occupied_client ?? 0,
      occupiedFree: r?.occupied_free ?? 0,
      occupancy: (occupied / SPOTS) * 100,
      arrivals: r?.arrivals ?? 0,
      departures: r?.departures ?? 0,
    })
  }
  return result
}

/** Années présentes dans une liste de dates 'YYYY-MM-DD' (croissant) + fallback. */
export function yearsFromParkingDates(
  dates: string[],
  fallback: number,
): number[] {
  const set = new Set<number>()
  for (const d of dates) {
    const y = Number(d.slice(0, 4))
    if (Number.isFinite(y)) set.add(y)
  }
  set.add(fallback)
  return [...set].sort((a, b) => a - b)
}
