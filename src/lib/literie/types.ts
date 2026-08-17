/**
 * Literie anti-allergène — types de base (page 'literie').
 *
 * `hotel_rooms` porte un attribut PERMANENT par chambre (pas de notion de
 * jour) : « cette chambre a-t-elle actuellement de la literie synthétique
 * installée (allergie aux plumes) ? ». `updated_at`/`updated_by` sont posés
 * côté serveur par le trigger `hotel_rooms_stamp` (supabase/hotel_rooms.sql),
 * jamais par le client.
 */
export interface DbHotelRoom {
  room: number
  literie_synthetique: boolean
  updated_at: string
  updated_by: string | null
}

// Le stock de secours (literie_stock/literie_stock_movements) reste en base
// (supabase/literie.sql) mais n'est plus suivi côté app (retiré sur demande,
// « pour le moment ») — pas de type client pour ces tables.
