/** Statut d'une chambre (terminal). Le défaut d'une chambre vendue est
 * `nettoyee` ; on n'applique un statut qu'en exception.
 * - `nettoyee` : défaut d'une chambre vendue (facturable).
 * - `non_nettoyee` : « Bloquée » — utilisée mais non nettoyée, reste due et roule.
 * - `refus` : client en séjour qui décline le ménage (hors charge). */
export type RoomStatus = 'nettoyee' | 'non_nettoyee' | 'refus'

/** Ligne DB (miroir de public.rapro_rooms) — une ligne par (jour, chambre). */
export interface DbRaproRoom {
  report_date: string
  room: number
  status: RoomStatus
}

/**
 * État ménage d'un jour : `statuses` = statut par chambre (absence de ligne =
 * `nettoyee`, défaut), dérivé des lignes DB.
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
  validated_at: string | null
  validated_by: string | null
}

/** Feuille jour (clôture + commentaire) du rapprochement. */
export interface RaproSheet {
  reportDate: string
  status: SheetStatus
  comment: string
  validatedAt: string | null
}
