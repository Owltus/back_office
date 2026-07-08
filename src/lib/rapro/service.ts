/*
 * Accès Supabase du Rapprochement — suivi ménage par (jour, chambre).
 * Une ligne = une chambre à un statut non-défaut (nettoyee / refus) un jour
 * donné ; l'absence de ligne vaut `non_nettoyee`. Convention d'erreur maison :
 * { data, error } → if (error) throw error, l'appelant .catch().
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

/** Statuts d'un jour (Map chambre→statut ; défaut non_nettoyee = absent). */
export async function fetchDay(reportDate: string): Promise<RaproDay> {
  const { data, error } = await supabase
    .from(RAPRO_TABLE)
    .select('room, status')
    .eq('report_date', reportDate)
  if (error) throw error
  const statuses = new Map<number, RoomStatus>()
  for (const r of (data ?? []) as Pick<DbRaproRoom, 'room' | 'status'>[]) {
    statuses.set(r.room, r.status)
  }
  return { reportDate, statuses }
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
 * Fixe le statut d'une chambre pour un jour. Le statut par défaut
 * (`non_nettoyee`) n'est pas stocké : on supprime la ligne pour rester au plus
 * juste ; sinon upsert sur la clé (report_date, room).
 */
export async function setStatus(
  reportDate: string,
  room: number,
  status: RoomStatus,
): Promise<void> {
  if (status === 'non_nettoyee') {
    const { error } = await supabase
      .from(RAPRO_TABLE)
      .delete()
      .eq('report_date', reportDate)
      .eq('room', room)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from(RAPRO_TABLE)
    .upsert(
      { report_date: reportDate, room, status },
      { onConflict: 'report_date,room' },
    )
  if (error) throw error
}

/* --- Feuille jour : clôture + commentaire (table rapro_sheets) ----------- */

function toRaproSheet(row: DbRaproSheet): RaproSheet {
  return {
    reportDate: row.report_date,
    status: row.status,
    comment: row.comment,
    validatedAt: row.validated_at,
  }
}

/** Feuille jour (null si aucune ligne encore créée → brouillon vide). */
export async function fetchSheet(reportDate: string): Promise<RaproSheet | null> {
  const { data, error } = await supabase
    .from(RAPRO_SHEETS_TABLE)
    .select('report_date, status, comment, validated_at, validated_by')
    .eq('report_date', reportDate)
    .maybeSingle()
  if (error) throw error
  return data ? toRaproSheet(data as DbRaproSheet) : null
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

/** Clôture le jour (status validated + qui/quand). Crée la ligne au besoin.
 * Le commentaire, s'il est fourni, est écrit dans le même upsert → une seule
 * requête pour clôturer (pas de saveComment séparé). */
export async function validateSheet(
  reportDate: string,
  userId: string,
  comment?: string,
): Promise<void> {
  const row: {
    report_date: string
    status: SheetStatus
    validated_at: string
    validated_by: string
    comment?: string
  } = {
    report_date: reportDate,
    status: 'validated',
    validated_at: new Date().toISOString(),
    validated_by: userId,
  }
  if (comment !== undefined) row.comment = comment
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
