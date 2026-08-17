/* --------------------------------------------------------------------------
 * Types du planning lits parapluie bébé (page 'literie', sous-route
 * /literie/lits-bebe). Mini-planning « à la Parking » mais volontairement
 * simplifié : pas de demi-journées, pas de drag/undo (cf. plan
 * suivi-literie-lits-bebe/9-planning-lits-bebe.md).
 * ------------------------------------------------------------------------ */

/** Ressource (lit) telle qu'affichée — une ligne du planning. */
export interface BabyCot {
  id: string
  label: string
  active: boolean
}

/** Ligne `baby_cots` telle que stockée en base. */
export interface DbBabyCot {
  id: string
  label: string
  active: boolean
  created_at: string
}

/** Assignation d'un lit sur une période — vue d'affichage. `label` est un
 * texte LIBRE (nom, chambre, ou les deux) — pas de chambre associée
 * formellement, même principe que `client` sur `parking_reservations`. */
export interface CotAssignment {
  id: string
  cotId: string
  label: string
  startDate: string // 'YYYY-MM-DD'
  endDate: string // 'YYYY-MM-DD'
  comment: string
}

/** Ligne `baby_cot_assignments` telle que stockée en base (snake_case). */
export interface DbCotAssignment {
  id: string
  cot_id: string
  label: string
  start_date: string // 'YYYY-MM-DD'
  end_date: string // 'YYYY-MM-DD'
  comment: string
  created_by: string
  created_at: string
  updated_at: string
}
