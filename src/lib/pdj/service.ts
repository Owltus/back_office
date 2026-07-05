import { supabase } from '#/lib/supabase.ts'
import type { DbPdjRow, Guest } from '#/lib/pdj/csv.ts'

/*
 * Service d'accès Supabase pour les petits-déjeuners (table `pdj_breakfasts`).
 *
 * Lecture ouverte à tous les authentifiés ; écriture (import, saisie « servi »,
 * purge) réservée aux rôles super_utilisateur / admin (RLS, voir
 * supabase/pdj_breakfasts.sql). Convention d'erreur : `{ data, error }` →
 * `if (error) throw error`, l'appelant `.catch()`.
 */

export const PDJ_TABLE = 'pdj_breakfasts'

/** Ligne DB complète (lecture) : champs d'import + consommation + id. */
export interface PdjDayRow extends DbPdjRow {
  id: string
  breakfasts_served: number
  served: boolean
}

/** DB → modèle d'affichage du board. Nom purgé (null) → tiret. */
export function toGuest(row: PdjDayRow): Guest {
  return {
    room: row.room,
    status: row.status,
    guestName: row.guest_name ?? '—',
    vip: row.vip,
    guests: row.guests,
    breakfastsIncluded: row.breakfasts_included,
    stayCount: row.stay_count,
  }
}

/** Jours de service disponibles, du plus récent au plus ancien (distinct). */
export async function fetchServiceDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from(PDJ_TABLE)
    .select('service_date')
    .order('service_date', { ascending: false })
  if (error) throw error
  const dates = (data as { service_date: string }[]).map((r) => r.service_date)
  return [...new Set(dates)]
}

/** Toutes les lignes d'un jour de service, triées par chambre. */
export async function fetchDay(serviceDate: string): Promise<PdjDayRow[]> {
  const { data, error } = await supabase
    .from(PDJ_TABLE)
    .select('*')
    .eq('service_date', serviceDate)
    .order('room', { ascending: true })
  if (error) throw error
  return data as PdjDayRow[]
}

/**
 * Import idempotent d'un fichier (upsert sur la clé métier). Le payload
 * n'inclut PAS les colonnes de consommation → un réimport ne réinitialise pas
 * la saisie du staff (`ON CONFLICT DO UPDATE` ne touche que les colonnes fournies).
 */
export async function importRows(rows: DbPdjRow[]): Promise<void> {
  const { error } = await supabase
    .from(PDJ_TABLE)
    .upsert(rows, { onConflict: 'service_date,room' })
  if (error) throw error
}

/** Met à jour la consommation d'une chambre pour un jour (saisie staff, D4). */
export async function setServed(
  serviceDate: string,
  room: number,
  breakfastsServed: number,
): Promise<void> {
  const { error } = await supabase
    .from(PDJ_TABLE)
    .update({
      breakfasts_served: breakfastsServed,
      served: breakfastsServed > 0,
    })
    .eq('service_date', serviceDate)
    .eq('room', room)
  if (error) throw error
}

/**
 * Purge RGPD : efface les noms de tous les jours antérieurs à `todayParis`
 * ('YYYY-MM-DD' calculé côté client pour éviter le piège du fuseau UTC en base),
 * en conservant toutes les stats. Idempotent (ne touche que les lignes encore
 * nommées). Barré par la RLS pour le rôle `utilisateur`.
 */
export async function purgeOldGuestNames(todayParis: string): Promise<void> {
  const { error } = await supabase
    .from(PDJ_TABLE)
    .update({ guest_name: null, purged_at: new Date().toISOString() })
    .lt('service_date', todayParis)
    .not('guest_name', 'is', null)
  if (error) throw error
}
