import { supabase } from '#/lib/supabase.ts'

import type { DbEasterEgg, EasterEgg, EasterEggInput } from './types.ts'

/*
 * Accès Supabase à la table `easter_eggs`. Convention maison : { data, error }
 * → if (error) throw error ; l'appelant (TanStack Query) capte l'échec. Les
 * écritures sont réservées aux admins par la RLS (get_user_role() = 'admin').
 */

export const EASTER_EGGS_TABLE = 'easter_eggs'

const COLUMNS = 'id, keyword, effect_id, enabled'

function toEasterEgg(row: DbEasterEgg): EasterEgg {
  return {
    id: row.id,
    keyword: row.keyword,
    effectId: row.effect_id,
    enabled: row.enabled,
  }
}

/** Toute la config, plus récents d'abord. Le runtime filtre les actifs. */
export async function fetchEasterEggs(): Promise<EasterEgg[]> {
  const { data, error } = await supabase
    .from(EASTER_EGGS_TABLE)
    .select(COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as DbEasterEgg[]).map(toEasterEgg)
}

export async function createEasterEgg(
  input: EasterEggInput,
): Promise<EasterEgg> {
  const { data, error } = await supabase
    .from(EASTER_EGGS_TABLE)
    .insert({
      keyword: input.keyword,
      effect_id: input.effectId,
      enabled: input.enabled,
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return toEasterEgg(data as DbEasterEgg)
}

export async function updateEasterEgg(
  id: string,
  patch: Partial<EasterEggInput>,
): Promise<void> {
  const dbPatch: Partial<DbEasterEgg> = {}
  if (patch.keyword !== undefined) dbPatch.keyword = patch.keyword
  if (patch.effectId !== undefined) dbPatch.effect_id = patch.effectId
  if (patch.enabled !== undefined) dbPatch.enabled = patch.enabled
  const { error } = await supabase
    .from(EASTER_EGGS_TABLE)
    .update(dbPatch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteEasterEgg(id: string): Promise<void> {
  const { error } = await supabase.from(EASTER_EGGS_TABLE).delete().eq('id', id)
  if (error) throw error
}
