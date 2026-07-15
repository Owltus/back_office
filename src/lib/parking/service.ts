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
 * Toutes les réservations. PAGINÉ : le board comme l'analytique lisent TOUTES
 * les lignes (filtrage/agrégation côté client) ; au-delà de 1000 réservations,
 * l'API en tronquait silencieusement une partie (mois/années manquants dans
 * l'analytique). Lecture page par page jusqu'à une page incomplète, ordre stable
 * par `id`.
 */
export async function fetchReservations(): Promise<DbReservation[]> {
  const PAGE = 1000
  const all: DbReservation[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PARKING_TABLE)
      .select('*')
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
