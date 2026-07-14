/** Statut de BASE d'une chambre (circuit classique, terminal). Le défaut d'une
 * chambre vendue est `nettoyee` ; on n'applique un statut qu'en exception.
 * - `nettoyee` : défaut d'une chambre vendue (facturable).
 * - `non_nettoyee` : « Bloquée » — utilisée mais non nettoyée, reste due et roule.
 * - `refus` : client en séjour qui décline le ménage (hors charge).
 * - `noshow` : vendue mais client absent → pas de ménage (hors charge). */
export type RoomStatus = 'nettoyee' | 'non_nettoyee' | 'refus' | 'noshow'

/** SUR-STATUT / qualificatif : dimension ORTHOGONALE au statut de base, pour les
 * cas particuliers. Une chambre en porte au plus un ; il s'affiche par une ICÔNE
 * (pas une couleur) et n'influe PAS sur la facturation/balance (le base décide).
 * - `faux_noshow` : PMS a déclaré le client absent, il est en réalité présent. */
export type Qualifier = 'faux_noshow'

/** Ligne DB (miroir de public.rapro_rooms) — une ligne par (jour, chambre). */
export interface DbRaproRoom {
  report_date: string
  room: number
  status: RoomStatus
  qualifier: Qualifier | null
}

/**
 * État ménage d'un jour : deux dimensions par chambre. `statuses` = statut de
 * base (absence de ligne = `nettoyee`, défaut) ; `qualifiers` = sur-statut
 * éventuel (absent = aucun). Les deux sont dérivées des mêmes lignes DB.
 */
export interface RaproDay {
  reportDate: string
  statuses: Map<number, RoomStatus>
  qualifiers: Map<number, Qualifier>
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
