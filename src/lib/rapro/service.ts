/*
 * Accès Supabase du Rapprochement — suivi ménage par (jour, chambre).
 * Postulat : une chambre vendue est NETTOYÉE par défaut. `status` est NULLABLE :
 * NULL = AUCUNE couleur (grise si non vendue, verte par défaut si vendue). Une
 * couleur explicite (nettoyee/refus/non_nettoyee) est stockée telle quelle. Une
 * ligne peut n'exister QUE pour le liseré « bloquée la veille » (status null,
 * carried_manual true). L'absence de ligne = chambre NON TOUCHÉE, sans liseré.
 * `clearRoom` efface la ligne (retour à l'origine).
 * Convention d'erreur maison : { data, error } → if (error) throw error.
 */

import { supabase } from '#/lib/supabase.ts'
import type {
  DbRaproRoom,
  DbRaproSheet,
  RaproDay,
  RaproSheet,
  RoomStatus,
  SheetStatus,
} from '#/lib/rapro/types.ts'

export const RAPRO_TABLE = 'rapro_rooms'
export const RAPRO_SHEETS_TABLE = 'rapro_sheets'
/** Vue d'agrégation du récap ménage (supabase/rapro_daily_agg.sql) : une ligne par
 * jour CLÔTURÉ, décomptes par statut. Alimente les analytiques + la bande RepJour ;
 * le board /rapro (saisie) garde ses lectures par jour. */
export const RAPRO_AGG_VIEW = 'rapro_daily_agg'
/** Fonction SECURITY DEFINER d'occupation In-House SANS données nominatives,
 * gardée sur la page rapro (supabase/rapro_occupancy_fn.sql). Le rapprochement lit
 * l'occupation par chambre ICI plutôt que directement dans `pdj_breakfasts` (fermé
 * à la page pdj et porteur du nom client) : un compte rapro sans droit pdj voit
 * quand même l'occupation, sans jamais recevoir de PII. Fonction (et non vue) pour
 * éviter le lint Supabase « security_definer_view ». */
export const RAPRO_OCCUPANCY_FN = 'rapro_occupancy'

/** Statuts valides. Une valeur inconnue en base est ramenée à un statut sûr
 * plutôt que de casser le rendu (défense ; ne devrait pas arriver). */
const KNOWN_STATUSES = new Set<RoomStatus>([
  'nettoyee',
  'non_nettoyee',
  'refus',
  'rattrapage',
])

/** État d'un jour : Map chambre→statut (défaut nettoyee = absence de ligne).
 * TOLÉRANT : une valeur non reconnue est ramenée à 'refus' (hors charge). */
export async function fetchDay(reportDate: string): Promise<RaproDay> {
  const { data, error } = await supabase
    .from(RAPRO_TABLE)
    .select('room, status, carried_manual, materialized')
    .eq('report_date', reportDate)
  if (error) throw error
  const statuses = new Map<number, RoomStatus>()
  const carriedManual = new Set<number>()
  const materialized = new Set<number>()
  for (const r of (data ?? []) as Pick<
    DbRaproRoom,
    'room' | 'status' | 'carried_manual' | 'materialized'
  >[]) {
    // Couleur EXPLICITE seulement : une ligne `status null` (posée pour le seul
    // liseré) reste HORS de la map → « aucune couleur » (grise/verte selon vente).
    if (r.status != null)
      statuses.set(r.room, KNOWN_STATUSES.has(r.status) ? r.status : 'refus')
    if (r.carried_manual) carriedManual.add(r.room)
    if (r.materialized) materialized.add(r.room)
  }
  return { reportDate, statuses, carriedManual, materialized }
}

/** Occupation In-House par chambre pour un jour (fonction rapro_occupancy, sans PII).
 * `adr` repère les chambres offertes (tarif 0) ; `manual_kind` (non null) repère
 * les chambres saisies à la main (day-use…) — les deux sont hors nuitée comptable. */
export interface RaproOccupancyRow {
  room: number
  adr: number | null
  manual_kind: 'inclus' | 'extra' | null
}
export async function fetchOccupancy(
  serviceDate: string,
): Promise<RaproOccupancyRow[]> {
  const { data, error } = await supabase.rpc(RAPRO_OCCUPANCY_FN, {
    p_date: serviceDate,
  })
  if (error) throw error
  return (data ?? []) as RaproOccupancyRow[]
}

/** Jour le plus ancien enregistré (borne basse de navigation), ou null. */
export async function fetchOldestDay(): Promise<string | null> {
  const { data, error } = await supabase
    .from(RAPRO_TABLE)
    .select('report_date')
    .order('report_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? data.report_date : null
}

/**
 * Pose le statut d'une chambre pour un jour (upsert sur la clé report_date, room).
 * Tout est stocké, y compris `nettoyee` posée à la main (chambre non vendue
 * marquée nettoyée).
 */
export async function setStatus(
  reportDate: string,
  room: number,
  status: RoomStatus,
): Promise<void> {
  const { error } = await supabase
    .from(RAPRO_TABLE)
    .upsert(
      { report_date: reportDate, room, status },
      { onConflict: 'report_date,room' },
    )
  if (error) throw error
}

/**
 * Efface le statut d'une chambre (retour à l'ORIGINE) : la ligne est supprimée,
 * l'absence valant « non touchée » (nettoyée par défaut si vendue, grisée sinon).
 * Utilisé par le rollback d'étage et la bascule des chambres non vendues.
 */
export async function clearRoom(
  reportDate: string,
  room: number,
): Promise<void> {
  const { error } = await supabase
    .from(RAPRO_TABLE)
    .delete()
    .eq('report_date', reportDate)
    .eq('room', room)
  if (error) throw error
}

/**
 * Pose l'état COMPLET d'une chambre : couleur (`status`, ou `null` = aucune) +
 * sur-statut « bloquée la veille ». Aucune couleur ET aucun liseré = pas de ligne
 * → on la supprime (comme `clearRoom`). Sinon upsert des deux colonnes. En les
 * fournissant TOUJOURS ensemble, une écriture de couleur (clic) et une de liseré
 * (clic droit) préservent chacune l'autre dimension, sans dépendre d'un merge
 * implicite côté PostgREST.
 */
export async function setRoom(
  reportDate: string,
  room: number,
  status: RoomStatus | null,
  carriedManual: boolean,
): Promise<void> {
  // Aucune couleur ET aucun liseré = rien à stocker → on efface (le défaut,
  // grise/verte, se déduit de l'absence). Sinon upsert : `status` peut être null
  // quand seule compte la bordure.
  if (status === null && !carriedManual) {
    return clearRoom(reportDate, room)
  }
  const { error } = await supabase
    .from(RAPRO_TABLE)
    .upsert(
      { report_date: reportDate, room, status, carried_manual: carriedManual },
      { onConflict: 'report_date,room' },
    )
  if (error) throw error
}

/**
 * Matérialise à la CLÔTURE une ligne `nettoyee` pour les chambres vendues encore
 * au défaut (aucune COULEUR : ligne absente, ou ligne existant seulement pour le
 * liseré `carried_manual`). Sans cela, une chambre nettoyée par défaut n'existerait
 * pas en base et échapperait au récap facturable ELIOR (qui compte les lignes de
 * statut réelles). L'appelant ne transmet QUE des chambres SANS couleur explicite
 * (occupées au défaut), donc on n'écrase aucune exception. Bulk upsert ;
 * `created_by`/`updated_at` posés par le trigger serveur.
 */
export async function materializeCleaned(
  reportDate: string,
  rooms: number[],
): Promise<void> {
  if (rooms.length === 0) return
  // Upsert `status = 'nettoyee'` — SEULE cette colonne est dans le payload, donc
  // le liseré `carried_manual` d'une ligne existante est PRÉSERVÉ. Ligne absente
  // → insert ; ligne « liseré seul » (status null) → passe à nettoyee sans perdre
  // le liseré. Pas d'`ignoreDuplicates` : il faut justement POUVOIR mettre à jour
  // ces lignes « liseré seul » (l'appelant garantit l'absence de couleur à écraser).
  const { error } = await supabase.from(RAPRO_TABLE).upsert(
    rooms.map((room) => ({
      report_date: reportDate,
      room,
      status: 'nettoyee',
      // A5 : marque la ligne comme MATÉRIALISÉE (posée par la clôture, pas à la
      // main) → purgeable à la réouverture. `carried_manual` absent du payload =
      // préservé par l'upsert (une ligne « liseré seul » garde son liseré).
      materialized: true,
    })),
    { onConflict: 'report_date,room' },
  )
  if (error) throw error
}

/**
 * Purge à la RÉOUVERTURE (A5) des lignes matérialisées à la clôture qui ne
 * correspondent plus à rien : sans liseré → ligne supprimée (retour au défaut,
 * grise si plus vendue) ; avec liseré manuel → on ne retire que la couleur
 * (status null) pour PRÉSERVER le liseré « bloquée la veille ». Ne touche JAMAIS
 * une correction manuelle (materialized = false). Passe par les écritures
 * normales (RLS) → l'autorisation de réouverture est respectée.
 */
export async function purgeMaterialized(
  reportDate: string,
  rooms: { room: number; carriedManual: boolean }[],
): Promise<void> {
  await Promise.all(
    rooms.map((r) =>
      r.carriedManual
        ? setRoom(reportDate, r.room, null, true)
        : clearRoom(reportDate, r.room),
    ),
  )
}

/* --- Feuille jour : clôture + commentaire (table rapro_sheets) ----------- */

function toRaproSheet(row: DbRaproSheet): RaproSheet {
  return {
    reportDate: row.report_date,
    status: row.status,
    comment: row.comment,
    operatorName: row.operator_name,
    validatedAt: row.validated_at,
  }
}

/** Feuille jour (null si aucune ligne encore créée → brouillon vide). */
export async function fetchSheet(
  reportDate: string,
): Promise<RaproSheet | null> {
  const { data, error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .select(
      'report_date, status, comment, operator_name, validated_at, validated_by',
    )
    .eq('report_date', reportDate)
    .maybeSingle()
  if (error) throw error
  return data ? toRaproSheet(data) : null
}

/** Enregistre le commentaire du jour (upsert ; ne touche pas le status). */
export async function saveComment(
  reportDate: string,
  comment: string,
): Promise<void> {
  const { error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .upsert({ report_date: reportDate, comment }, { onConflict: 'report_date' })
  if (error) throw error
}

/** Clôture le jour (status validated). Crée la ligne au besoin. Le commentaire,
 * s'il est fourni, est écrit dans le même upsert → une seule requête pour clôturer
 * (pas de saveComment séparé). `validated_at` et `validated_by` sont posés CÔTÉ
 * SERVEUR par le trigger `rapro_sheets_stamp` (jamais par le client) — signature
 * fiable, non falsifiable. */
export async function validateSheet(
  reportDate: string,
  comment?: string,
  operatorName?: string,
): Promise<void> {
  const row: {
    report_date: string
    status: SheetStatus
    comment?: string
    operator_name?: string
  } = {
    report_date: reportDate,
    status: 'validated',
  }
  if (comment !== undefined) row.comment = comment
  if (operatorName !== undefined) row.operator_name = operatorName
  const { error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .upsert(row, { onConflict: 'report_date' })
  if (error) throw error
}

/** Réouvre le jour (retour en draft ; efface la trace de validation). */
export async function reopenSheet(reportDate: string): Promise<void> {
  const { error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .update({ status: 'draft', validated_at: null, validated_by: null })
    .eq('report_date', reportDate)
  if (error) throw error
}

/**
 * OCC officiel du PMS (nuitées vendues) pour une date `daily_reports`, ou null.
 * LECTURE SEULE sur la table PARTAGÉE `daily_reports` (feature repjour) — sert de
 * ligne de contrôle du rapprochement. Attention au décalage de datage : le jour
 * rapro D correspond à `daily_reports.date = D − 1` (voir l'appelant).
 */
export async function fetchOfficialOcc(date: string): Promise<number | null> {
  // Passe par la RPC `daily_reports_occ` (SECURITY DEFINER, gardée page:rapro,
  // n'expose que rj_nuitees) plutôt que de lire `daily_reports` en direct : un
  // compte rapro-only n'a plus accès à toute la table de reporting financier
  // (M2 du pentest 2026-08-04). La policy SELECT de daily_reports est refermée
  // sur page:repjour dans le script de remédiation.
  const { data, error } = await supabase.rpc('daily_reports_occ', {
    p_date: date,
  })
  if (error) throw error
  return typeof data === 'number' ? data : null
}

/*
 * Le no-show du PMS n'est PAS lu ici (card retirée le 2026-07-09 : pas utile
 * pour l'instant). Il continue d'être stocké à chaque import dans
 * `pms_daily_metrics`, ligne « No Show Rooms », prêt à être affiché plus tard.
 * Rappel : le rapport en donne le NOMBRE, jamais la chambre — un no-show n'ayant
 * jamais occupé de chambre, aucune case de la grille ne peut le porter.
 */

