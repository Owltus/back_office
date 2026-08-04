/** Couleur EXPLICITE d'une chambre. `null` (voir `DbRaproRoom.status`) = aucune
 * couleur, traité à part — ce type ne couvre que les couleurs réellement posées.
 * - `nettoyee` : nettoyée (facturable), vert.
 * - `non_nettoyee` : « Bloquée » — utilisée mais non nettoyée, reste due et roule.
 * - `refus` : client en séjour qui décline le ménage (hors charge).
 * - `rattrapage` : ménage FAIT aujourd'hui sur une chambre REPORTÉE non vendue
 *   (bloquée la veille, vidée depuis). Facturable ELIOR comme une nettoyée, mais
 *   PAS une vente du jour (elle a été vendue hier) → jamais comptée en « vendues ».
 *   Rendu vert comme une nettoyée ; c'est le liseré « bloquée la veille » qui la
 *   distingue à l'œil. Résout le roulement (elle cesse de rouler).
 * - `non_vendue` : correction d'occupation INVERSE — une chambre marquée occupée
 *   par le PMS (In-House) qui n'a en fait PAS été vendue. Forcée grise, RETIRÉE des
 *   vendues et du dû, non facturable, ne roule pas. Symétrique de la correction
 *   existante (marquer vendue une non-vendue) ; atteinte dans le cycle de clic des
 *   chambres vendues. */
export type RoomStatus =
  | 'nettoyee'
  | 'non_nettoyee'
  | 'refus'
  | 'rattrapage'
  | 'non_vendue'

/** Ligne DB (miroir de public.rapro_rooms) — une ligne par (jour, chambre). */
export interface DbRaproRoom {
  report_date: string
  room: number
  /** Couleur, ou `null` = AUCUNE couleur (chambre non vendue laissée grise, ou
   * vendue au défaut « nettoyée »). Orthogonal à `carried_manual` : une ligne peut
   * n'exister QUE pour porter le liseré (status null, carried_manual true). */
  status: RoomStatus | null
  /** Sur-statut « bloquée la veille » posé à la main (orthogonal au status). */
  carried_manual: boolean
}

/**
 * État ménage d'un jour : `statuses` ne contient QUE les chambres à couleur
 * EXPLICITE (les lignes `status null` en sont absentes — l'absence vaut « aucune
 * couleur » : grise si non vendue, verte si vendue). `carriedManual` = chambres
 * portant le sur-statut « bloquée la veille » posé à la main ce jour-là.
 */
export interface RaproDay {
  reportDate: string
  statuses: Map<number, RoomStatus>
  carriedManual: Set<number>
}

/** État de clôture d'une feuille jour. */
export type SheetStatus = 'draft' | 'validated'

/** Ligne DB (miroir de public.rapro_sheets) — une ligne par jour. */
export interface DbRaproSheet {
  report_date: string
  status: SheetStatus
  comment: string
  operator_name: string
  validated_at: string | null
  validated_by: string | null
}

/** Feuille jour (clôture + commentaire) du rapprochement. */
export interface RaproSheet {
  reportDate: string
  status: SheetStatus
  comment: string
  operatorName: string
  validatedAt: string | null
}
