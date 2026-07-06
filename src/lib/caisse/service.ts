import { supabase } from '#/lib/supabase.ts'
import { DENOMINATIONS, GRACE_HOURS } from '#/lib/caisse/constants.ts'
import type {
  CaisseSheet,
  CaisseSheetInput,
  Counts,
  DbCaisseSheet,
  Shift,
} from '#/lib/caisse/types.ts'
import type { UserRole } from '#/lib/repjour/types.ts'

/*
 * Service d'accès Supabase pour les feuilles de caisse (table `caisse_sheets`).
 *
 * Lecture ouverte à tous les authentifiés ; écriture (création, saisie,
 * validation) réservée aux rôles super_utilisateur / admin, avec verrou temporel
 * sur les feuilles validées (RLS, voir supabase/caisse_sheets.sql). Convention
 * d'erreur : `{ data, error }` → `if (error) throw error`, l'appelant `.catch()`.
 */

export const CAISSE_TABLE = 'caisse_sheets'

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0))

/** DB (snake_case, colonnes plates) → modèle app (camelCase, blocs). */
export function toSheet(r: DbCaisseSheet): CaisseSheet {
  const counts = DENOMINATIONS.reduce(
    (acc, d) => ({ ...acc, [d.key]: num(r[d.key]) }),
    {} as Counts,
  )
  return {
    id: r.id,
    reportDate: r.report_date,
    shift: r.shift,
    operatorInitials: r.operator_initials,
    snt: {
      cash: num(r.snt_cash), cb: num(r.snt_cb), ax: num(r.snt_ax),
      cheq: num(r.snt_cheq), cvac: num(r.snt_cvac), cbweb: num(r.snt_cbweb),
    },
    ls: {
      cash: num(r.ls_cash), cb: num(r.ls_cb), ax: num(r.ls_ax),
      cheq: num(r.ls_cheq), cvac: num(r.ls_cvac),
    },
    caisse: {
      cash: num(r.caisse_cash), cb: num(r.caisse_cb), ax: num(r.caisse_ax),
      cheq: num(r.caisse_cheq), cvac: num(r.caisse_cvac), adyen: num(r.caisse_adyen),
    },
    counts,
    fundOrigin: num(r.fund_origin),
    comment: r.comment,
    status: r.status,
    validatedAt: r.validated_at,
    validatedBy: r.validated_by,
    countersignedBy: r.countersigned_by,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Modèle app (saisie) → payload d'upsert DB. N'inclut PAS les colonnes de
 * validation ni `created_by` (posé par `default auth.uid()` en base). */
export function toDbUpsert(s: CaisseSheetInput): Partial<DbCaisseSheet> {
  const counts = DENOMINATIONS.reduce(
    (acc, d) => ({ ...acc, [d.key]: s.counts[d.key] ?? 0 }),
    {} as Record<string, number>,
  )
  return {
    report_date: s.reportDate,
    shift: s.shift,
    operator_initials: s.operatorInitials,
    snt_cash: s.snt.cash, snt_cb: s.snt.cb, snt_ax: s.snt.ax,
    snt_cheq: s.snt.cheq, snt_cvac: s.snt.cvac, snt_cbweb: s.snt.cbweb,
    ls_cash: s.ls.cash, ls_cb: s.ls.cb, ls_ax: s.ls.ax,
    ls_cheq: s.ls.cheq, ls_cvac: s.ls.cvac,
    caisse_cash: s.caisse.cash, caisse_cb: s.caisse.cb, caisse_ax: s.caisse.ax,
    caisse_cheq: s.caisse.cheq, caisse_cvac: s.caisse.cvac, caisse_adyen: s.caisse.adyen,
    ...counts,
    fund_origin: s.fundOrigin,
    comment: s.comment,
  }
}

/** Feuilles existantes, de la plus récente à la plus ancienne. */
export async function fetchSheets(): Promise<CaisseSheet[]> {
  const { data, error } = await supabase
    .from(CAISSE_TABLE)
    .select('*')
    .order('report_date', { ascending: false })
  if (error) throw error
  return (data as DbCaisseSheet[]).map(toSheet)
}

/** Feuille d'un couple (date, shift), ou null si aucune. */
export async function fetchSheet(date: string, shift: Shift): Promise<CaisseSheet | null> {
  const { data, error } = await supabase
    .from(CAISSE_TABLE)
    .select('*')
    .eq('report_date', date)
    .eq('shift', shift)
    .maybeSingle()
  if (error) throw error
  return data ? toSheet(data as DbCaisseSheet) : null
}

/** Rang chronologique d'un shift dans une journée (matin < soir < nuit). */
const SHIFT_RANK: Record<Shift, number> = { matin: 0, soir: 1, nuit: 2 }
const chronoKey = (date: string, shift: Shift) => `${date}#${SHIFT_RANK[shift]}`

/**
 * Feuille existante immédiatement AVANT (date, shift) dans la timeline, ou null.
 * Sert à reporter le fond de caisse (comptage des coupures) sur la feuille
 * suivante — le float physique est le même d'un shift à l'autre.
 */
export async function fetchPreviousSheet(
  date: string,
  shift: Shift,
): Promise<CaisseSheet | null> {
  const { data, error } = await supabase
    .from(CAISSE_TABLE)
    .select('*')
    .lte('report_date', date)
    .order('report_date', { ascending: false })
    .limit(12)
  if (error) throw error
  const cur = chronoKey(date, shift)
  let best: CaisseSheet | null = null
  let bestKey = ''
  for (const row of data as DbCaisseSheet[]) {
    const s = toSheet(row)
    const k = chronoKey(s.reportDate, s.shift)
    if (k < cur && k > bestKey) {
      best = s
      bestKey = k
    }
  }
  return best
}

/**
 * Enregistre un brouillon (upsert idempotent sur la clé métier (date, shift)) et
 * renvoie la ligne persistée (avec id / horodatage / statut) — utile pour mettre
 * le cache à jour sans refetch.
 */
export async function upsertSheet(input: CaisseSheetInput): Promise<CaisseSheet> {
  const { data, error } = await supabase
    .from(CAISSE_TABLE)
    .upsert(toDbUpsert(input), { onConflict: 'report_date,shift' })
    .select()
    .single()
  if (error) throw error
  return toSheet(data as DbCaisseSheet)
}

/** Validation : pose status/validated_at/validated_by. Autorisé par la RLS car
 * `validated_at` était encore NULL au moment de l'UPDATE. */
export async function validateSheet(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from(CAISSE_TABLE)
    .update({ status: 'validated', validated_at: new Date().toISOString(), validated_by: userId })
    .eq('id', id)
  if (error) throw error
}

/** Contre-signature (D5) : pose `countersigned_by`. */
export async function countersign(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from(CAISSE_TABLE)
    .update({ countersigned_by: userId })
    .eq('id', id)
  if (error) throw error
}

/** Déverrouillage admin : remet la feuille en brouillon. Hors fenêtre de grâce,
 * la RLS ne laisse passer cet UPDATE que pour un admin. */
export async function reopenSheet(id: string): Promise<void> {
  const { error } = await supabase
    .from(CAISSE_TABLE)
    .update({ status: 'draft', validated_at: null, validated_by: null })
    .eq('id', id)
  if (error) throw error
}

/**
 * Garde d'édition ERGONOMIQUE — reflète la policy RLS UPDATE (l'autorité réelle).
 * Autorise si : rôle super/admin ET (admin, OU feuille non validée, OU dans la
 * fenêtre de grâce). Sert à griser l'UI sans aller-retour serveur.
 */
export function canEditSheet(sheet: CaisseSheet | null, role: UserRole | null): boolean {
  if (role !== 'super_utilisateur' && role !== 'admin') return false
  if (!sheet || sheet.status !== 'validated' || !sheet.validatedAt) return true
  if (role === 'admin') return true
  const graceEnd = new Date(sheet.validatedAt).getTime() + GRACE_HOURS * 3_600_000
  return Date.now() < graceEnd
}

/** Fin de la fenêtre de grâce (Date) pour une feuille validée, sinon null. */
export function graceDeadline(sheet: CaisseSheet | null): Date | null {
  if (!sheet?.validatedAt || sheet.status !== 'validated') return null
  return new Date(new Date(sheet.validatedAt).getTime() + GRACE_HOURS * 3_600_000)
}
