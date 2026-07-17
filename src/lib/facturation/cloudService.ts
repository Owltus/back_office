import { supabase } from '#/lib/supabase.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'
import type { Issuer } from '#/lib/facturation/issuers.ts'

/*
 * Accès Supabase aux nuages de mots (table facturation_wordpool). Lecture = tout
 * le modèle agrégé (code, token, count), paginé pour dépasser 1000 lignes.
 * Écriture = JAMAIS en direct : la RPC SECURITY DEFINER `facturation_wordpool_learn`
 * incrémente les compteurs par delta, côté serveur (atomique, garde interne).
 * En l'absence de table (SQL pas encore exécuté) la lecture échoue → l'app retombe
 * sur la seule graine (dégradation gracieuse gérée par l'appelant).
 */

const TABLE = 'facturation_wordpool'

/** Lit tout le modèle serveur → WordPool. Propage l'erreur (table absente, etc.). */
export async function fetchClouds(): Promise<WordPool> {
  const perCode: WordPool['perCode'] = {}
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('code, token, count')
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as {
      code: string
      token: string
      count: number
    }[]
    for (const r of rows) (perCode[r.code] ??= {})[r.token] = r.count
    if (rows.length < 1000) break
    from += 1000
  }
  return { perCode }
}

/** Apprentissage delta : incrémente les compteurs des `codes` par `deltas`. */
export async function learnClouds(
  codes: string[],
  deltas: Record<string, number>,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_wordpool_learn', {
    p_codes: codes,
    p_deltas: deltas,
  })
  if (error) throw error
}

/** Dictionnaire des émetteurs connus (petit → pas de pagination). */
export async function fetchIssuers(): Promise<Issuer[]> {
  const { data, error } = await supabase
    .from('facturation_issuers')
    .select('name, display, count')
  if (error) throw error
  return (data ?? []) as Issuer[]
}

/** Enregistre / confirme un émetteur (upsert +1, côté serveur). */
export async function learnIssuer(
  name: string,
  display: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_learn', {
    p_name: name,
    p_display: display,
  })
  if (error) throw error
}
