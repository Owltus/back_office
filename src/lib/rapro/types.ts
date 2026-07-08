/** Statut ménage d'une chambre pour un jour donné.
 * `noshow` = vendue mais client absent → pas de ménage à faire. */
export type RoomStatus = 'nettoyee' | 'non_nettoyee' | 'refus' | 'noshow'

/** Ligne DB (miroir de public.rapro_rooms) — une ligne par (jour, chambre). */
export interface DbRaproRoom {
  report_date: string
  room: number
  status: RoomStatus
}

/**
 * État ménage d'un jour : le statut par chambre. Seules les chambres au statut
 * `nettoyee` ou `refus` sont stockées ; l'absence = `non_nettoyee` (défaut).
 */
export interface RaproDay {
  reportDate: string
  statuses: Map<number, RoomStatus>
}

/** État de clôture d'une feuille jour. */
export type SheetStatus = 'draft' | 'validated'

/** Ligne DB (miroir de public.rapro_sheets) — une ligne par jour. */
export interface DbRaproSheet {
  report_date: string
  status: SheetStatus
  comment: string
  late_arrivals: number
  corrections: number
  validated_at: string | null
  validated_by: string | null
}

/** Feuille jour (clôture + commentaire + nombres saisis) du rapprochement. */
export interface RaproSheet {
  reportDate: string
  status: SheetStatus
  comment: string
  /** Arrivées après clôture (saisie Réception, ≥ 0). */
  lateArrivals: number
  /** Corrections/délogements (saisie Réception, peut être négatif). */
  corrections: number
  validatedAt: string | null
}
