import { supabase } from '#/lib/supabase.ts'
import type { BabyCot, CotAssignment, DbCotAssignment } from '#/lib/baby-cots/types.ts'

/* --------------------------------------------------------------------------
 * Accès Supabase au planning lits bébé (tables `baby_cots` et
 * `baby_cot_assignments`). Même style d'accès que lib/parking/service.ts
 * (pagination par tranches de 1000, tables brutes — pas de vue d'agrégation,
 * le volume est faible).
 * ------------------------------------------------------------------------ */

export const BABY_COTS_TABLE = 'baby_cots'
export const BABY_COT_ASSIGNMENTS_TABLE = 'baby_cot_assignments'

/** Ligne base → assignation d'affichage (camelCase). */
export function toCotAssignment(row: DbCotAssignment): CotAssignment {
  return {
    id: row.id,
    cotId: row.cot_id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    comment: row.comment,
  }
}

/** Lits ACTIFS (lignes du planning) — nombre ajustable, pas une constante. */
export async function fetchCots(): Promise<BabyCot[]> {
  const { data, error } = await supabase
    .from(BABY_COTS_TABLE)
    .select('id, label, active')
    .eq('active', true)
    .order('label', { ascending: true })
  if (error) throw error
  return (data ?? []) as BabyCot[]
}

/**
 * Assignations dont la période RECOUVRE la fenêtre [from, to] (bornes
 * 'YYYY-MM-DD' incluses) : `start_date <= to` ET `end_date >= from`. Paginé
 * (au-delà de 1000 lignes l'API tronque silencieusement), ordre stable par id.
 */
export async function fetchAssignments(
  from: string,
  to: string,
): Promise<DbCotAssignment[]> {
  const PAGE = 1000
  const all: DbCotAssignment[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(BABY_COT_ASSIGNMENTS_TABLE)
      .select('*')
      .lte('start_date', to)
      .gte('end_date', from)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as DbCotAssignment[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return all
}

/** Champs d'une assignation fournis par le client à la création (le reste —
 * `created_by`/`created_at`/`updated_at` — est posé serveur par le trigger). */
export interface NewCotAssignment {
  id: string
  cot_id: string
  label: string
  start_date: string
  end_date: string
  comment: string
}

export async function createAssignment(row: NewCotAssignment): Promise<void> {
  const { error } = await supabase.from(BABY_COT_ASSIGNMENTS_TABLE).insert(row)
  if (error) throw error
}

export async function updateAssignment(
  id: string,
  patch: Partial<Omit<NewCotAssignment, 'id'>>,
): Promise<void> {
  const { error } = await supabase
    .from(BABY_COT_ASSIGNMENTS_TABLE)
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase
    .from(BABY_COT_ASSIGNMENTS_TABLE)
    .delete()
    .eq('id', id)
  if (error) throw error
}
