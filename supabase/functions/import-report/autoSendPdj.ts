// Déclencheur de l'ENVOI AUTOMATIQUE du PDJ, appelé par import-report après un
// import In-House réussi.
//
// PRINCIPE : le PDJ ne dépend que du rapport In-House (pas de « deux présents »
// comme le RepJour). Après import, le candidat = la service_date la plus RÉCENTE
// présente dans pdj_breakfasts qui n'est PAS encore dans pdj_auto_send_log.
//
// IDEMPOTENCE : réservation atomique par insert-on-conflict-do-nothing dans
// pdj_auto_send_log (une ligne par jour envoyé) → un seul envoi même si deux
// invocations arrivent ensemble. L'envoi manuel (admin) n'utilise pas ce journal.
//
// Envoi via le module partagé ../_shared/send-mail.ts (expéditeur PDJ_REPORT_FROM,
// liste pdj_report_recipients, garde REPORT_TEST_TO). Aucun secret ici.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

import { KNOWN_ROOMS, stayKind } from '../_shared/pdj/rooms.ts'
import {
  buildPdjDateStr,
  buildPdjEmailHtml,
  buildPdjSubject,
} from '../_shared/pdj/render.ts'
import { buildPdjPdfBytes } from '../_shared/pdj/pdf.ts'
import type {
  PdjSheetData,
  PdjSheetRow,
  PdjStats,
} from '../_shared/pdj/pdf.ts'
import { sendMail } from '../_shared/send-mail.ts'
import { businessDateStr, isWithinPipelineWindow } from '../_shared/businessDay.ts'

export interface AutoSendOutcome {
  sent: boolean
  note: string
}

/** Ligne pdj_breakfasts (colonnes utiles au rendu). */
interface BreakfastRow {
  room: number
  guest_name: string | null
  vip: boolean
  status: string
  stay_count: number
  guests: number
  breakfasts_included: number
  breakfasts_served: number
}

function computeStats(rows: BreakfastRow[]): PdjStats {
  let guests = 0
  let breakfasts = 0
  let staying = 0
  let departing = 0
  for (const r of rows) {
    guests += r.guests
    breakfasts += r.breakfasts_included
    const kind = stayKind(r.status)
    if (kind === 'staying') staying++
    else if (kind === 'departing') departing++
  }
  return {
    rooms: rows.length,
    guests,
    breakfasts,
    potential: Math.max(0, guests - breakfasts),
    staying,
    departing,
  }
}

/**
 * Tente l'envoi automatique de la feuille PDJ. Ne lève jamais : renvoie un
 * AutoSendOutcome (l'appelant logue). En dry-run : détecte et logue, N'ÉCRIT et
 * N'ENVOIE rien.
 */
export async function maybeAutoSendPdj(
  admin: SupabaseClient,
  dryRun: boolean,
  instant: Date = new Date(),
): Promise<AutoSendOutcome> {
  // DÉFENSE EN PROFONDEUR : l'envoi AUTO PDJ ne part que dans la fenêtre [02h, 04h[
  // (Paris). Redondant avec la garde d'index.ts, mais blinde tout futur chemin.
  // N'affecte PAS l'envoi MANUEL admin (send-report). `instant` = heure lue une fois
  // par requête (index.ts) pour décider sur la même horloge que l'import.
  if (!isWithinPipelineWindow(instant))
    return { sent: false, note: 'hors fenêtre horaire — envoi auto ignoré' }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from =
    Deno.env.get('PDJ_REPORT_FROM') ??
    Deno.env.get('REPORT_FROM') ??
    'OKKO PDJ <onboarding@resend.dev>'
  const testTo = Deno.env.get('REPORT_TEST_TO')?.trim() || null

  // 1. Candidat = LA service_date la plus récente, et ELLE SEULE (jamais de
  //    remontée vers un jour plus ancien : sinon un vieux jour non journalisé, ou
  //    un ré-import, enverrait une feuille périmée). On envoie seulement si ce jour
  //    est (a) pas déjà journalisé, (b) RÉCENT (fenêtre 3 jours ; au-delà = filet
  //    manuel).
  const { data: recent, error: recentErr } = await admin
    .from('pdj_breakfasts')
    .select('service_date')
    .order('service_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recentErr) {
    console.error('Auto-envoi PDJ : lecture pdj_breakfasts échouée :', recentErr.message)
    return { sent: false, note: 'lecture PDJ échouée' }
  }
  if (!recent) return { sent: false, note: 'aucune donnée PDJ' }
  const D = recent.service_date as string

  // Fenêtre de récence calée sur le cycle hôtelier (02h) : jamais un vieux jour.
  const cutoff = businessDateStr(new Date(instant.getTime() - 3 * 86_400_000))
  if (D < cutoff)
    return { sent: false, note: `PDJ trop ancien (${D}) — envoi auto ignoré` }

  const { data: logged, error: logErr } = await admin
    .from('pdj_auto_send_log')
    .select('service_date')
    .eq('service_date', D)
    .maybeSingle()
  if (logErr) {
    console.error('Auto-envoi PDJ : lecture du journal échouée :', logErr.message)
    return { sent: false, note: 'lecture journal échouée' }
  }
  if (logged) return { sent: false, note: `déjà envoyé (${D})` }

  // 2. Vérif config d'envoi AVANT de réserver (hors dry-run).
  if (!dryRun && !resendKey) {
    console.error('Auto-envoi PDJ : RESEND_API_KEY manquante — envoi impossible.')
    return { sent: false, note: 'RESEND_API_KEY manquante' }
  }

  // 3. RÉSERVATION ATOMIQUE (hors dry-run) : insert-on-conflict-do-nothing.
  if (!dryRun) {
    const { data: reserved, error: resErr } = await admin
      .from('pdj_auto_send_log')
      .upsert(
        { service_date: D, sent_at: new Date().toISOString() },
        { onConflict: 'service_date', ignoreDuplicates: true },
      )
      .select('service_date')
    if (resErr) {
      console.error('Auto-envoi PDJ : réservation échouée :', resErr.message)
      return { sent: false, note: 'réservation échouée' }
    }
    if (!reserved || reserved.length === 0) {
      return { sent: false, note: 'déjà réservé/envoyé (course évitée)' }
    }
  }

  // À partir d'ici, la réservation (hors dry-run) est POSÉE. Toute sortie NON réussie
  // doit la LIBÉRER, sinon le jour reste « envoyé » sans mail parti (aucune reprise
  // auto). On enveloppe donc TOUT le bloc post-réservation : erreur de lecture,
  // exception de génération PDF, ou échec Resend → suppression de la ligne
  // pdj_auto_send_log. Le rattrapage se fait ensuite par le bandeau + envoi manuel.
  const releaseReservation = async () => {
    if (dryRun) return
    const { error: delErr } = await admin
      .from('pdj_auto_send_log')
      .delete()
      .eq('service_date', D)
    if (delErr)
      console.error('Auto-envoi PDJ : libération de la réservation échouée :', delErr.message)
  }

  try {
    // 4. Construire la feuille depuis pdj_breakfasts (uniquement les chambres occupées).
    const { data: rows, error: rowsErr } = await admin
      .from('pdj_breakfasts')
      .select(
        'room, guest_name, vip, status, stay_count, guests, breakfasts_included, breakfasts_served',
      )
      .eq('service_date', D)
      .order('room', { ascending: true })
    if (rowsErr) {
      console.error('Auto-envoi PDJ : lecture des lignes du jour échouée :', rowsErr.message)
      await releaseReservation()
      return { sent: false, note: 'lecture des lignes échouée' }
    }
    // NE GARDER QUE les chambres de l'inventaire dessiné : une ligne hors inventaire
    // ne figure dans aucun étage du PDF, donc la compter dans les tuiles rendrait le
    // PDF incohérent (total ≠ grille) et divergerait de la feuille imprimée client.
    const allRows = (rows ?? []) as BreakfastRow[]
    const breakfastRows = allRows.filter((r) => KNOWN_ROOMS.has(r.room))
    const dropped = allRows.length - breakfastRows.length
    if (dropped > 0)
      console.warn(`Auto-envoi PDJ : ${dropped} chambre(s) hors inventaire ignorée(s).`)
    const stats = computeStats(breakfastRows)
    const sheetRows: PdjSheetRow[] = breakfastRows.map((r) => ({
      room: r.room,
      guestName: r.guest_name,
      vip: r.vip,
      status: r.status,
      stayCount: r.stay_count,
      guests: r.guests,
      breakfastsIncluded: r.breakfasts_included,
      breakfastsServed: r.breakfasts_served,
    }))
    const titleDate = buildPdjDateStr(D)
    const sheet: PdjSheetData = {
      titleDate,
      serviceDate: D,
      stats,
      rows: sheetRows,
    }

    const subject = buildPdjSubject(sheet)
    const html = buildPdjEmailHtml(sheet, titleDate)

    if (dryRun) {
      return {
        sent: false,
        note: `[DRY-RUN] aurait envoyé le PDJ du ${D} (${stats.rooms} ch., ${stats.breakfasts} PDJ)`,
      }
    }

    // resendKey garantie présente ici (vérifiée avant réservation) ; narrowing.
    if (!resendKey) {
      await releaseReservation()
      return { sent: false, note: 'RESEND_API_KEY manquante' }
    }

    const [yr, mo, da] = D.split('-')
    const pdfBytes = buildPdjPdfBytes(sheet)
    const result = await sendMail({
      admin,
      from,
      subject,
      html,
      pdfBytes,
      pdfName: `Breakfast_${da}-${mo}-${yr}.pdf`,
      recipientsTable: 'pdj_report_recipients',
      resendKey,
      testTo,
    })

    if (!result.ok) {
      await releaseReservation()
      return { sent: false, note: `envoi échoué (${result.error ?? 'inconnu'})` }
    }
    return {
      sent: true,
      note: `envoyé le PDJ du ${D} à ${result.to} destinataire(s)${
        result.cc ? ` (+${result.cc} cc)` : ''
      }${result.testMode ? ' — mode test' : ''}`,
    }
  } catch (err) {
    console.error(
      'Auto-envoi PDJ : exception post-réservation :',
      err instanceof Error ? err.message : String(err),
    )
    await releaseReservation()
    return { sent: false, note: 'envoi non abouti (exception post-réservation)' }
  }
}
