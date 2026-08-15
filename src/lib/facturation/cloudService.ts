import { supabase } from '#/lib/supabase.ts'
import { STORAGE_TOP_K, type WordPool } from '#/lib/facturation/wordpool.ts'
import type { IssuerCodes } from '#/lib/facturation/issuerCodes.ts'
import type { IssuerDenylist } from '#/lib/facturation/issuerDenylist.ts'
import type { Issuer } from '#/lib/facturation/issuers.ts'
import type { IssuerMemory } from '#/lib/facturation/issuerMemory.ts'
import type {
  BudgetLine,
  CompteLine,
  JournalEntry,
} from '#/lib/facturation/types.ts'

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

// --- Référentiel des imputations (facturation_ref_imputations) ----------------
// Une ligne = un COUPLE (code_analytique, compte). Lecture ouverte aux authentifiés ;
// écritures via RPC (réimport en masse, cf. facturation_ref_imputations_rpc.sql).
const BUDGET_TABLE = 'facturation_ref_imputations'

/** Référentiel des imputations : une entrée par COUPLE (code + compte), ordonné par le plan
 *  analytique. Mappe les colonnes de la table vers BudgetLine (code_analytique→code,
 *  section→category, libelle→label, description→hint) ; les `tags` n'existent plus en base → [].
 *  Paginé par `range` (le couplage multiplie les lignes) ; tri secondaire pour une pagination
 *  déterministe. */
export async function fetchBudgetLines(): Promise<BudgetLine[]> {
  const lines: BudgetLine[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(BUDGET_TABLE)
      .select(
        'code_analytique, compte, section, libelle, description, sort_order',
      )
      .order('sort_order', { ascending: true })
      .order('code_analytique', { ascending: true })
      .order('compte', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as {
      code_analytique: string
      compte: string | null
      section: string | null
      libelle: string | null
      description: string | null
      sort_order: number | null
    }[]
    for (const r of rows)
      lines.push({
        code: r.code_analytique,
        compte: r.compte ?? '',
        label: r.libelle ?? '',
        category: r.section ?? '',
        hint: r.description ?? '',
        tags: [],
      })
    if (rows.length < 1000) break
    from += 1000
  }
  return lines
}

// --- Dictionnaire des comptes (facturation_ref_comptes) ----------------------
// Une ligne = un COUPLE (compte, libellé humain). Lecture par page ; écritures via RPC.
const COMPTES_TABLE = 'facturation_ref_comptes'

/** Dictionnaire des comptes : numéro → nom humain, ordonné par numéro. Injecté dans
 *  budgetRegistry (setCompteLabels) pour l'accès synchrone `compteLabel`. */
export async function fetchComptes(): Promise<CompteLine[]> {
  const rows: CompteLine[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(COMPTES_TABLE)
      .select('compte, libelle')
      .order('compte', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    const batch = (data ?? []) as { compte: string; libelle: string | null }[]
    for (const r of batch)
      rows.push({ compte: r.compte, libelle: r.libelle ?? '' })
    if (batch.length < 1000) break
    from += 1000
  }
  return rows
}

/** Crée ou renomme un compte du dictionnaire (RPC `facturation_ref_comptes_upsert`, garde de
 *  rôle interne `gestion`). */
export async function upsertCompte(
  compte: string,
  libelle: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_ref_comptes_upsert', {
    p_compte: compte,
    p_libelle: libelle,
  })
  if (error) throw error
}

/** Supprime un compte du dictionnaire (RPC). Refuse (SQLSTATE 23503) si le compte est encore
 *  référencé par une imputation du référentiel couple. */
export async function deleteCompte(compte: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_ref_comptes_delete', {
    p_compte: compte,
  })
  if (error) throw error
}

/** Réimport EN MASSE du dictionnaire (RPC additive `facturation_ref_comptes_reimport`).
 *  Renvoie le nombre de lignes traitées côté serveur. */
export async function reimportComptes(
  rows: { compte: string; libelle: string }[],
): Promise<number> {
  const { data, error } = await supabase.rpc('facturation_ref_comptes_reimport', {
    p_rows: rows,
  })
  if (error) throw error
  return (data as number | null) ?? 0
}

/** Crée ou met à jour une imputation au COUPLE (code + compte ; RPC, garde de rôle interne).
 *  `create:true` refuse d'écraser un couple déjà en base (unicité SERVEUR, SQLSTATE 23505).
 *  section/libelle/description sont portés PAR COUPLE ; le réimport reste le canal de masse. */
export async function upsertBudgetLine(
  line: BudgetLine,
  opts?: { sort?: number; create?: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('facturation_ref_upsert', {
    p_code: line.code,
    p_compte: line.compte,
    p_section: line.category,
    p_libelle: line.label,
    p_description: line.hint ?? '',
    p_sort: opts?.sort ?? null,
    p_create: opts?.create ?? false,
  })
  if (error) throw error
}

/** Supprime une imputation (couple code + compte ; RPC). Refuse (SQLSTATE 23503) si c'est le
 *  DERNIER compte d'un code encore utilisé (sa suppression effacerait un libellé actif). */
export async function deleteBudgetLine(
  code: string,
  compte: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_ref_delete', {
    p_code: code,
    p_compte: compte,
  })
  if (error) throw error
}

/** Réimport EN MASSE du référentiel (RPC `facturation_ref_reimport`, upsert ADDITIF : jamais de
 *  suppression). Chaque ligne = un COUPLE (code_analytique + compte) et ses libellés. Propage
 *  l'erreur (droits, format), renvoie le nombre de lignes traitées côté serveur. Le mode
 *  « remplaçant » n'est pas exposé au client (réservé au SQL Editor). */
export async function reimportRefImputations(
  rows: {
    code_analytique: string
    compte: string
    section?: string
    libelle?: string
    description?: string
    sort_order?: number
  }[],
): Promise<number> {
  const { data, error } = await supabase.rpc('facturation_ref_reimport', {
    p_rows: rows,
  })
  if (error) throw error
  return (data as number | null) ?? 0
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

/** Oubli COMPLET d'un couple émetteur→code (supprime toute la co-occurrence apprise). */
export async function forgetIssuerCode(
  issuer: string,
  code: string,
): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_codes_forget', {
    p_issuer: issuer,
    p_code: code,
  })
  if (error) throw error
}

/** Réinitialise le nuage de mots d'un code (efface tout son vocabulaire appris). */
export async function forgetCloudCode(code: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_wordpool_forget_code', {
    p_code: code,
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

// --- Journal d'apprentissage par document (empreinte / hash) ------------------
// Requiert facturation_learned_docs.sql exécuté par l'utilisateur ; sinon la lecture échoue
// → journal vide (dégradation gracieuse : aucun doublon détecté, aucune facture listée).

const JOURNAL_TABLE = 'facturation_learned_docs'

/** Lit tout le journal d'apprentissage → { entries }. Propage l'erreur (table absente, etc.). */
export async function fetchJournal(): Promise<{ entries: JournalEntry[] }> {
  const entries: JournalEntry[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(JOURNAL_TABLE)
      .select('hash, issuer, codes, deltas, method, created_at')
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as {
      hash: string
      issuer: string | null
      codes: string[] | null
      deltas: Record<string, number> | null
      method: string
      created_at: string
    }[]
    for (const r of rows)
      entries.push({
        hash: r.hash,
        issuerKey: r.issuer,
        codes: r.codes ?? [],
        deltas: r.deltas ?? {},
        method: r.method === 'ocr' ? 'ocr' : 'native',
        learnedAt: r.created_at,
      })
    if (rows.length < 1000) break
    from += 1000
  }
  return { entries }
}

/**
 * Apprentissage IDEMPOTENT d'une facture en UN seul appel transactionnel (A1).
 * La RPC `facturation_learn_document` insère le journal (on conflict hash) PUIS,
 * seulement si l'entrée est nouvelle, applique les incréments nuages + émetteur →
 * un rejeu ou deux onglets ne comptent qu'une fois. Renvoie `true` si la facture a
 * été RÉELLEMENT apprise (nouvelle), `false` si c'était un doublon (rien incrémenté).
 * Remplace la séquence non atomique learnClouds + learnIssuerCodes + learnIssuer +
 * recordLearnedDoc.
 */
export async function learnInvoiceDocument(entry: {
  hash: string
  issuer: string
  display: string
  codes: string[]
  deltas: Record<string, number>
  comptes: Record<string, string>
  method: 'native' | 'ocr'
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('facturation_learn_document', {
    p_hash: entry.hash,
    p_issuer: entry.issuer,
    p_display: entry.display,
    p_codes: entry.codes,
    p_deltas: entry.deltas,
    p_comptes: entry.comptes,
    p_method: entry.method,
  })
  if (error) throw error
  return data === true
}

/** Enregistre un document appris (idempotent côté serveur : on conflict do nothing). */
export async function recordLearnedDoc(entry: JournalEntry): Promise<void> {
  const { error } = await supabase.rpc('facturation_learned_docs_record', {
    p_hash: entry.hash,
    p_issuer: entry.issuerKey ?? '',
    p_codes: entry.codes,
    p_deltas: entry.deltas,
    p_method: entry.method,
    p_comptes: entry.comptes ?? {},
  })
  if (error) throw error
}

/** Mémoire émetteur → (code, compte) dérivée de l'historique (vue facturation_issuer_memory).
 *  Alimente la pré-sélection du compte habituel d'un émetteur. Propage l'erreur (vue absente
 *  → modèle vide côté appelant, dégradation gracieuse). */
export async function fetchIssuerMemory(): Promise<IssuerMemory> {
  const perIssuer: IssuerMemory['perIssuer'] = {}
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('facturation_issuer_memory')
      .select('issuer, code_analytique, compte, n')
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as {
      issuer: string
      code_analytique: string
      compte: string
      n: number
    }[]
    for (const r of rows) {
      const byCode = (perIssuer[r.issuer] ??= {})
      const byCompte = (byCode[r.code_analytique] ??= {})
      byCompte[r.compte] = r.n
    }
    if (rows.length < 1000) break
    from += 1000
  }
  return { perIssuer }
}

/** Désapprend EXACTEMENT le document `hash` (rejeu serveur des deltas) puis retire l'entrée. */
export async function forgetLearnedDoc(hash: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_learned_docs_forget', {
    p_hash: hash,
  })
  if (error) throw error
}

/** Retire une entrée du journal SANS rejeu (undo en séance, où le décrément est déjà fait). */
export async function deleteLearnedDoc(hash: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_learned_docs_delete', {
    p_hash: hash,
  })
  if (error) throw error
}
