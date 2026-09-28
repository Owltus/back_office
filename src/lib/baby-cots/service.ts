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

/** Colonnes lues par le planning, alignées sur `DbCotAssignment`. Liste
 * explicite : `label` est un texte libre (nom, chambre) et l'auteur n'a rien à
 * faire dans le navigateur. */
const ASSIGNMENT_COLUMNS = 'id, cot_id, label, start_date, end_date, comment'

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
      .select(ASSIGNMENT_COLUMNS)
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

/** Messages d'un refus silencieux (0 ligne touchée, sans erreur de la base). */
export const RIEN_ENREGISTRE =
  "Rien n'a été enregistré : droit insuffisant ou lit déjà libéré."
export const RIEN_SUPPRIME = "Rien n'a été supprimé : droit insuffisant."

export async function createAssignment(row: NewCotAssignment): Promise<void> {
  const { error } = await supabase.from(BABY_COT_ASSIGNMENTS_TABLE).insert(row)
  if (error) throw error
}

export async function updateAssignment(
  id: string,
  patch: Partial<Omit<NewCotAssignment, 'id'>>,
): Promise<void> {
  // `.select('id')` : un UPDATE refusé par la RLS ne lève PAS d'erreur, il
  // modifie 0 ligne. Sans lire les lignes touchées, le refus passerait pour un
  // succès (même modèle que `setServed`, lib/pdj/service.ts).
  const { data, error } = await supabase
    .from(BABY_COT_ASSIGNMENTS_TABLE)
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error(RIEN_ENREGISTRE)
}

export async function deleteAssignment(id: string): Promise<void> {
  const { data, error } = await supabase
    .from(BABY_COT_ASSIGNMENTS_TABLE)
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (data.length > 0) return
  // 0 ligne : refus de la RLS OU assignation déjà supprimée par un collègue
  // (contre-revue du 2026-09-28 : le board la faisait réapparaître). On relit
  // l'id pour départager : absent = le but est atteint, succès sans message ;
  // présent = vrai refus. Une relecture en échec reste une erreur (le board
  // restaure, prudence).
  const { data: encore, error: relecture } = await supabase
    .from(BABY_COT_ASSIGNMENTS_TABLE)
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (relecture) throw relecture
  if (encore) throw new Error(RIEN_SUPPRIME)
}
