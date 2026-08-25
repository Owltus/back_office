import { addDays, differenceInCalendarDays, format } from 'date-fns'

import { supabase } from '#/lib/supabase.ts'
import type { Reservation, Status } from '#/lib/parking/model.ts'

/* --------------------------------------------------------------------------
 * Accès Supabase au planning parking (table `parking_reservations`).
 *
 * En base, les réservations sont stockées en DATE ABSOLUE (`start_date`),
 * contrairement au `startDay` relatif au lundi de référence utilisé par le
 * board pour le rendu. Les helpers `toReservation` / `startDayToDate` font la
 * conversion dans les deux sens, à partir du lundi de référence du board.
 * ------------------------------------------------------------------------ */

export const PARKING_TABLE = 'parking_reservations'

/** Vues d'agrégation (supabase/parking_analytics_agg.sql). Servent l'ANALYTIQUE et
 * la bande RepJour ; le planning /parking, lui, garde la table brute + realtime. */
export const PARKING_ARRIVALS_VIEW = 'parking_arrivals_agg'
export const PARKING_DAILY_OCC_VIEW = 'parking_daily_occupation'

/** Ligne de `parking_arrivals_agg` : agrégat par jour d'ARRIVÉE (start_date). */
export interface ParkingArrivalsRow {
  start_date: string // 'YYYY-MM-DD'
  reservations: number
  nights: number
  /** Nuits sur des places CLIENT (spot < 13) — numérateur du captage. */
  client_nights: number
  paid: number
  reserved: number
  unpaid: number
  /** Réservations au statut « gratuité » (comptées à part, jamais facturées).
   * Optionnel : absent tant que `parking_analytics_agg.sql` (étape 2 du
   * chantier) n'a pas été rejoué par l'utilisateur dans Supabase. */
  free?: number
  /** Nuits cumulées des réservations « gratuité ». Optionnel, même raison. */
  free_nights?: number
  /** CA HT du jour (nuitées reserve/paye/checkout uniquement), au tarif en
   * vigueur à `start_date` (voir `parking_tarifs`, table versionnée).
   * Optionnel, même raison. */
  ca_ht?: number
  /** CA TTC du jour (même périmètre). Optionnel, même raison. */
  ca_ttc?: number
}

/** Ligne de `parking_daily_occupation` : occupation réelle d'un jour de calendrier.
 * Seuls les jours ayant occupation / arrivée / départ sont présents (les jours
 * totalement vides sont complétés à zéro côté client). */
export interface ParkingDailyOccRow {
  date: string // 'YYYY-MM-DD'
  /** Places distinctes occupées ce jour (personnel 13/14 compris). */
  occupied: number
  /** Places CLIENT distinctes occupées ce jour (spot < 13). */
  occupied_client: number
  /** Places distinctes en statut « gratuité » occupées ce jour. Optionnel :
   * absent tant que `parking_analytics_agg.sql` n'a pas été rejoué. */
  occupied_free?: number
  /** Réservations dont l'arrivée tombe ce jour. */
  arrivals: number
  /** Réservations dont le départ (start_date + nights) tombe ce jour. */
  departures: number
}

/** Ligne telle que stockée en base (dates absolues). */
export interface DbReservation {
  id: string
  spot: number
  client: string
  start_date: string // 'YYYY-MM-DD'
  nights: number
  status: Status
  comment: string
}

/** Ligne base → réservation d'affichage (startDay relatif au lundi de réf.). */
export function toReservation(row: DbReservation, refMonday: Date): Reservation {
  return {
    id: row.id,
    client: row.client,
    spot: row.spot,
    startDay: differenceInCalendarDays(
      new Date(row.start_date + 'T00:00:00'),
      refMonday,
    ),
    nights: row.nights,
    status: row.status,
    comment: row.comment,
  }
}

/** startDay relatif → date absolue 'YYYY-MM-DD' pour la persistance. */
export function startDayToDate(startDay: number, refMonday: Date): string {
  return format(addDays(refMonday, startDay), 'yyyy-MM-dd')
}

/**
 * Réservations, éventuellement BORNÉES à une fenêtre de dates d'arrivée
 * (`start_date` ∈ [from, to], bornes 'YYYY-MM-DD' incluses). Le planning charge
 * une fenêtre autour de la période consultée (et l'étend en naviguant) plutôt que
 * tout l'historique ; sans bornes, lit tout (compatibilité). PAGINÉ : au-delà de
 * 1000 lignes l'API tronque silencieusement — lecture page par page jusqu'à une
 * page incomplète, ordre stable par `id`.
 */
export async function fetchReservations(
  from?: string,
  to?: string,
): Promise<DbReservation[]> {
  const PAGE = 1000
  const all: DbReservation[] = []
  let offset = 0
  for (;;) {
    let q = supabase.from(PARKING_TABLE).select('*')
    if (from) q = q.gte('start_date', from)
    if (to) q = q.lte('start_date', to)
    const { data, error } = await q
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as DbReservation[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return all
}

/**
 * Agrégat des ARRIVÉES, tout l'historique (paginé). Une ligne par start_date, bien
 * moins que les réservations brutes → alimente l'analytique annuel (années dispo +
 * comptes par mois) et l'impayé mensuel. Trié par date décroissante.
 */
export async function fetchParkingArrivals(): Promise<ParkingArrivalsRow[]> {
  const PAGE = 1000
  const all: ParkingArrivalsRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PARKING_ARRIVALS_VIEW)
      .select('*')
      .order('start_date', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as ParkingArrivalsRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return all
}

/**
 * Occupation RÉELLE par jour sur une plage (bornes 'YYYY-MM-DD' incluses), depuis
 * la vue dépliée. Bornée côté serveur → une poignée de lignes. Alimente l'analytique
 * mensuel et la bande RepJour. Paginé, trié par date.
 */
export async function fetchParkingDailyOccupation(
  from: string,
  to: string,
): Promise<ParkingDailyOccRow[]> {
  const PAGE = 1000
  const all: ParkingDailyOccRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PARKING_DAILY_OCC_VIEW)
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as ParkingDailyOccRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return all
}

export async function createReservation(row: DbReservation): Promise<void> {
  const { error } = await supabase.from(PARKING_TABLE).insert(row)
  if (error) throw error
}

export async function updateReservation(
  id: string,
  patch: Partial<Omit<DbReservation, 'id'>>,
): Promise<void> {
  const { error } = await supabase.from(PARKING_TABLE).update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteReservation(id: string): Promise<void> {
  const { error } = await supabase.from(PARKING_TABLE).delete().eq('id', id)
  if (error) throw error
}
