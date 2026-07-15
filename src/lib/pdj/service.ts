import { supabase } from '#/lib/supabase.ts'
import type { DbPdjRow } from '#/lib/pdj/csv.ts'

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

/** Dates de service DISTINCTES (années dispo de l'analytique, sélecteur de jour
 * du board). PAGINÉ : une ligne par (jour, chambre) → non paginé, l'API tronquait
 * à 1000 room-jours (≈ les 20 derniers jours), masquant les dates/années plus
 * anciennes. On lit la seule colonne `service_date` page par page (payload
 * minime), puis on déduplique. */
export async function fetchServiceDates(): Promise<string[]> {
  const PAGE = 1000
  const dates: string[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PDJ_TABLE)
      .select('service_date')
      .order('service_date', { ascending: false })
      .order('room', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { service_date: string }[]
    dates.push(...rows.map((r) => r.service_date))
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return [...new Set(dates)]
}

/** Date de service la plus ANCIENNE (In-House), ou null si aucune. Sert à borner
 * d'autres features sur la disponibilité des rapports In-House — la caisse
 * remonte jusque-là (on peut saisir une caisse pour tout jour ayant un In-House).
 * Une seule ligne lue (LIMIT 1). */
export async function fetchOldestServiceDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from(PDJ_TABLE)
    .select('service_date')
    .order('service_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? (data as { service_date: string }).service_date : null
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
 * Toutes les lignes sur une plage de jours (bornes incluses), triées par date.
 * Lecture seule dédiée à la vue analytique : agrégation ensuite côté client
 * (par mois). Bornes au format 'YYYY-MM-DD'.
 *
 * PAGINÉ : une ligne par (jour, chambre) → une plage large (un mois, a fortiori
 * une année) dépasse vite le plafond de 1000 lignes de l'API. Sans pagination,
 * on ne récupérait que les 1000 premières dates (⇒ seuls les premiers mois
 * apparaissaient dans l'analytique). On lit page par page jusqu'à une page
 * incomplète.
 */
export async function fetchRange(
  from: string,
  to: string,
): Promise<PdjDayRow[]> {
  const PAGE = 1000
  const all: PdjDayRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PDJ_TABLE)
      .select('*')
      .gte('service_date', from)
      .lte('service_date', to)
      .order('service_date', { ascending: true })
      .order('room', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as PdjDayRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return all
}

/**
 * Import idempotent (upsert sur la clé métier). Le payload n'inclut PAS les
 * colonnes de consommation → un réimport ne réinitialise pas la saisie du staff
 * (`ON CONFLICT DO UPDATE` ne touche que les colonnes fournies).
 *
 * Découpé en lots pour encaisser un dépôt en masse (des dizaines de jours d'un
 * coup) sans payload démesuré. Les lignes doivent être dédoublonnées par
 * (service_date, room) en amont (cf. `mergeCsvFiles`) : une clé de conflit
 * répétée dans un même lot ferait échouer l'upsert.
 */
export async function importRows(rows: DbPdjRow[]): Promise<void> {
  const CHUNK = 1000
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(PDJ_TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'service_date,room' })
    if (error) throw error
  }
}

/**
 * Supprime toutes les lignes d'UN jour de service (ce jour uniquement, via
 * `.eq('service_date', …)` — jamais un autre jour). Réservé super/admin (RLS).
 */
export async function deleteDay(serviceDate: string): Promise<void> {
  const { error } = await supabase
    .from(PDJ_TABLE)
    .delete()
    .eq('service_date', serviceDate)
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
 * Purge RGPD : anonymise (guest_name = null) tous les jours STRICTEMENT
 * antérieurs à `oldestKept` ('YYYY-MM-DD' calculé côté client pour éviter le
 * piège du fuseau UTC en base), en conservant toutes les stats. En passant LA
 * VEILLE, on garde les noms d'aujourd'hui ET de J-1 (fenêtre nécessaire au
 * rapprochement parking↔PDJ) et on purge à partir de J-2. Idempotent (ne touche
 * que les lignes encore nommées). Barré par la RLS pour le rôle `utilisateur`.
 */
export async function purgeOldGuestNames(oldestKept: string): Promise<void> {
  const { error } = await supabase
    .from(PDJ_TABLE)
    .update({ guest_name: null, purged_at: new Date().toISOString() })
    .lt('service_date', oldestKept)
    .not('guest_name', 'is', null)
  if (error) throw error
}
