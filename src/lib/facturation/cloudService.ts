import { supabase } from '#/lib/supabase.ts'
import { STORAGE_TOP_K, type WordPool } from '#/lib/facturation/wordpool.ts'
import type { IssuerCodes } from '#/lib/facturation/issuerCodes.ts'
import type { IssuerDenylist } from '#/lib/facturation/issuerDenylist.ts'
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

/**
 * MAINTENANCE de la rétention : retire les hapax (`count < p_min_count`) puis plafonne
 * à `p_top_k` tokens par code (RPC SECURITY DEFINER `facturation_wordpool_prune`, garde
 * de rôle interne). À appeler à un moment MAÎTRISÉ (action d'admin, jamais en boucle,
 * jamais par tamponnage) : `p_min_count = 2` supprimerait tout mot vu une seule fois,
 * or un mot rare peut devenir utile à la 2e occurrence. Purge lourde, occasionnelle.
 */
export async function pruneClouds(
  minCount = 2,
  topK = STORAGE_TOP_K,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_wordpool_prune', {
    p_min_count: minCount,
    p_top_k: topK,
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

// --- Co-occurrence émetteur → codes (filtre fort par émetteur) ----------------
// Requiert facturation_issuer_codes.sql exécuté par l'utilisateur ; sinon la lecture
// échoue → modèle vide (dégradation gracieuse) et l'écriture est signalée à l'appelant.

const ISSUER_CODES_TABLE = 'facturation_issuer_codes'

/** Lit tout le modèle émetteur→codes. Propage l'erreur (table absente, etc.). */
export async function fetchIssuerCodes(): Promise<IssuerCodes> {
  const perIssuer: IssuerCodes['perIssuer'] = {}
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(ISSUER_CODES_TABLE)
      .select('issuer, code, count')
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as {
      issuer: string
      code: string
      count: number
    }[]
    for (const r of rows) (perIssuer[r.issuer] ??= {})[r.code] = r.count
    if (rows.length < 1000) break
    from += 1000
  }
  return { perIssuer }
}

/** Apprentissage : +1 sur chaque code validé pour l'émetteur (RPC SECURITY DEFINER). */
export async function learnIssuerCodes(
  issuer: string,
  codes: string[],
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_codes_learn', {
    p_issuer: issuer,
    p_codes: codes,
  })
  if (error) throw error
}

/** Désapprentissage symétrique (décrément borné à 0, purge des lignes vidées). */
export async function unlearnIssuerCodes(
  issuer: string,
  codes: string[],
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_codes_unlearn', {
    p_issuer: issuer,
    p_codes: codes,
  })
  if (error) throw error
}

// --- Denylist émetteur↔code (« ne va jamais sur ce code ») --------------------
// Requiert facturation_issuer_denylist.sql exécuté par l'utilisateur ; sinon la lecture
// échoue → denylist vide (dégradation gracieuse, aucun code exclu).

const ISSUER_DENYLIST_TABLE = 'facturation_issuer_denylist'

/** Lit toute la denylist → { perIssuer: { issuer: Set<code> } }. Propage l'erreur. */
export async function fetchIssuerDenylist(): Promise<IssuerDenylist> {
  const perIssuer: IssuerDenylist['perIssuer'] = {}
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(ISSUER_DENYLIST_TABLE)
      .select('issuer, code')
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as { issuer: string; code: string }[]
    for (const r of rows) (perIssuer[r.issuer] ??= new Set()).add(r.code)
    if (rows.length < 1000) break
    from += 1000
  }
  return { perIssuer }
}

/** Pose une interdiction émetteur↔code (idempotent, RPC). */
export async function addIssuerDeny(
  issuer: string,
  code: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_denylist_add', {
    p_issuer: issuer,
    p_code: code,
  })
  if (error) throw error
}

/** Lève une interdiction émetteur↔code (undo, RPC). */
export async function removeIssuerDeny(
  issuer: string,
  code: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_denylist_remove', {
    p_issuer: issuer,
    p_code: code,
  })
  if (error) throw error
}

// --- Correction / désapprentissage (RPC de facturation_corrections.sql) -------
// Requièrent l'exécution préalable du SQL par l'utilisateur ; sinon l'appel échoue
// (propagé), l'appelant gère en best-effort (dégradation gracieuse).

/** Désapprend une facture : décrément symétrique des `codes` par `deltas` (borné à 0). */
export async function unlearnClouds(
  codes: string[],
  deltas: Record<string, number>,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_wordpool_unlearn', {
    p_codes: codes,
    p_deltas: deltas,
  })
  if (error) throw error
}

/** Renomme un émetteur (corrige une faute de frappe sur la clé). */
export async function renameIssuer(
  oldName: string,
  newName: string,
  display: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_rename', {
    p_old_name: oldName,
    p_new_name: newName,
    p_display: display,
  })
  if (error) throw error
}

/** Fusionne deux émetteurs (doublon d'orthographe) vers `toName`. */
export async function mergeIssuer(
  fromName: string,
  toName: string,
  display: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_merge', {
    p_from_name: fromName,
    p_to_name: toName,
    p_display: display,
  })
  if (error) throw error
}

/** Supprime un émetteur erroné du dictionnaire. */
export async function deleteIssuer(name: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_delete', {
    p_name: name,
  })
  if (error) throw error
}

/** Décrémente un émetteur de 1 (undo d'une confirmation) ; supprimé à 0. */
export async function unlearnIssuer(name: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_unlearn', {
    p_name: name,
  })
  if (error) throw error
}
