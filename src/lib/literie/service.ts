/*
 * Accès Supabase de la literie anti-allergène (page 'literie').
 * Convention d'erreur maison : { data, error } → if (error) throw error.
 */

import { supabase } from '#/lib/supabase.ts'
import type { DbHotelRoom } from '#/lib/literie/types.ts'

export const HOTEL_ROOMS_TABLE = 'hotel_rooms'

/** État literie des 80 chambres (une ligne par chambre, seedée à l'étape 1). */
export async function fetchRooms(): Promise<DbHotelRoom[]> {
  const { data, error } = await supabase
    .from(HOTEL_ROOMS_TABLE)
    .select('room, literie_synthetique, updated_at, updated_by')
    .order('room', { ascending: true })
  if (error) throw error
  return data
}

/**
 * Bascule le statut literie d'une chambre (simple update — pas de suivi de
 * stock, retiré à la demande de l'utilisateur : la page trace seulement OÙ
 * est la literie synthétique, pas combien il en reste en réserve).
 */
export async function toggleBedding(
  room: number,
  synthetic: boolean,
): Promise<void> {
  // `.select('room')` : un UPDATE refusé par la RLS ne lève PAS d'erreur, il
  // modifie 0 ligne. Sans lire les lignes touchées, le refus passerait pour un
  // succès (même modèle que `setServed`, lib/pdj/service.ts).
  const { data, error } = await supabase
    .from(HOTEL_ROOMS_TABLE)
    .update({ literie_synthetique: synthetic })
    .eq('room', room)
    .select('room')
  if (error) throw error
  // Le board préfixe déjà la chambre : message court.
  if (data.length === 0) {
    throw new Error("droit insuffisant, rien n'a été enregistré.")
  }
}
