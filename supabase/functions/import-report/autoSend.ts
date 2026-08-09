// Déclencheur de l'ENVOI AUTOMATIQUE du RepJour, appelé par import-report après un
// import réussi (Comparison ou Forecast).
//
// PRINCIPE (unifié, robuste aux deux ordres d'arrivée) : le rapport à envoyer est
// « le daily_reports le plus RÉCENT pas encore auto-envoyé (auto_sent_at IS NULL)
// dont le mois possède un Forecast FRAIS (importé lors du cycle courant) ». Ce
// candidat unique :
//   - Comparison arrive, Forecast frais déjà là → la ligne du jour devient candidate → envoi ;
//   - Forecast (frais) arrive, Comparison déjà là → idem → envoi ;
//   - un seul des deux présent                    → pas de candidat / pas frais → pas d'envoi ;
//   - Forecast présent mais PÉRIMÉ (import raté ce cycle, ex. 422) → pas frais → pas d'envoi ;
//   - déjà envoyé                                 → auto_sent_at posé → exclu.
// La FRAÎCHEUR (et non la simple présence) garantit qu'on n'envoie jamais un RepJour
// avec un projeté d'un cycle précédent. L'envoi MANUEL admin reste toujours possible.
// On n'a besoin NI du nom de fichier NI des mois du Forecast.
//
// IDEMPOTENCE : la réservation est ATOMIQUE — `update … set auto_sent_at = now()
// where date = D and auto_sent_at is null returning *`. Postgres sérialise les
// UPDATE concurrents sur la même ligne : deux invocations quasi simultanées
// (Comparison + Forecast dans deux e-mails) n'en font gagner qu'une → un seul envoi.
// Ce même UPDATE RECALCULE aussi le projeté (pm_*) depuis forecast_days : si le
// Comparison est arrivé AVANT le Forecast, pm_* valait 0 → on le corrige avant l'envoi.
//
// L'envoi lui-même passe par le module partagé ../_shared/send-mail.ts (Resend +
// liste server_report_recipients + garde REPORT_TEST_TO). Aucun secret ici.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

import {
  buildRepjourDateStr,
  buildRepjourEmailHtml,
  buildRepjourSubject,
} from '../_shared/repjour/render.ts'
import { buildRepjourPdfBytes } from '../_shared/repjour/pdf.ts'
import type { RepjourPdfData } from '../_shared/repjour/pdf.ts'
import type { EmailData } from '../_shared/repjour/reportHtml.ts'
import type { Ecart, KPIBlock, MonthBudget } from '../_shared/repjour/types.ts'
import { sendMail } from '../_shared/send-mail.ts'
import { businessDateStr, isWithinPipelineWindow } from '../_shared/businessDay.ts'

const TOTAL_ROOMS = 80

// Fenêtre de « fraîcheur » du Forecast : importé il y a moins de FRESH_WINDOW_MS.
// Les rapports arrivent une fois par cycle (~24 h d'écart) ; 12 h sépare donc
// nettement « importé ce cycle » de « importé le cycle précédent ». On raisonne
// en fenêtre de temps plutôt qu'en égalité de date de cycle, pour rester robuste
// autour de la frontière 02h (un import à 01h59 et un autre à 02h01 sont la même
// nuit mais deux dates de cycle différentes).
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000

/** Ligne daily_reports (colonnes utiles). */
interface DailyRow {
  date: string
  year: number
  month: number
  day_of_month: number
  days_in_month: number
  rj_nuitees: number
  rj_to: number
  rj_pm: number
  rj_revpar: number
  rj_room_revenue: number
  rmtd_nuitees: number
  rmtd_to: number
  rmtd_pm: number
  rmtd_revpar: number
  rmtd_room_revenue: number
  pm_nuitees: number
  pm_to: number
  pm_pm: number
  pm_revpar: number
  pm_room_revenue: number
  imported_at: string | null
  auto_sent_at: string | null
}

export interface AutoSendOutcome {
  sent: boolean
  note: string
}

function reportToKPI(r: DailyRow, prefix: 'rj' | 'rmtd' | 'pm'): KPIBlock {
  return {
    nuitees: r[`${prefix}_nuitees`],
    to: r[`${prefix}_to`],
    pm: r[`${prefix}_pm`],
    revpar: r[`${prefix}_revpar`],
    roomRevenue: r[`${prefix}_room_revenue`],
  }
}

function computeEcart(projete: KPIBlock, budget: MonthBudget): Ecart {
  return {
    nuitees: projete.nuitees - budget.nuitees,
    to: projete.to - budget.taux_occupation,
    pm: projete.pm - budget.prix_moyen,
    revpar: projete.revpar - budget.revpar,
    roomRevenue: projete.roomRevenue - budget.room_revenue,
  }
}

/** Projeté du mois recalculé depuis les forecast_days (TTC, base 80). Identique à
 * computeProjeteMois côté client. */
function computeProjeteMois(
  forecasts: { occ: number; rev_ttc: number }[],
  daysInMonth: number,
): KPIBlock {
  const totalOCC = forecasts.reduce((s, f) => s + f.occ, 0)
  const totalRevTTC = forecasts.reduce((s, f) => s + f.rev_ttc, 0)
  return {
    nuitees: totalOCC,
    roomRevenue: totalRevTTC,
    to: daysInMonth > 0 ? (totalOCC / (TOTAL_ROOMS * daysInMonth)) * 100 : 0,
    pm: totalOCC > 0 ? totalRevTTC / totalOCC : 0,
    revpar: daysInMonth > 0 ? totalRevTTC / (TOTAL_ROOMS * daysInMonth) : 0,
  }
}

/**
 * Tente l'envoi automatique du rapport journalier. Ne lève jamais : renvoie un
 * AutoSendOutcome (l'appelant logue). En dry-run : détecte et logue, N'ÉCRIT et
 * N'ENVOIE rien.
 */
export async function maybeAutoSendRepjour(
  admin: SupabaseClient,
  dryRun: boolean,
  instant: Date = new Date(),
): Promise<AutoSendOutcome> {
  // L'envoi AUTO ne part que dans la fenêtre [02h, 04h[ (Paris) — c'est désormais la
  // SEULE garde de fenêtre (l'ingestion, elle, tourne 24/7). N'affecte PAS l'envoi
  // MANUEL admin (send-report). `instant` = heure lue UNE fois par requête.
  //
  // INTERRUPTEUR DE TEST : le secret PIPELINE_WINDOW_BYPASS=true LÈVE cette garde pour
  // valider la boucle complète EN JOURNÉE (envoi réel, pas une simulation). Défaut =
  // garde active. Réversible sans redéploiement : il suffit d'unset le secret après le
  // test. À laisser absent en fonctionnement normal.
  const bypassWindow = Deno.env.get('PIPELINE_WINDOW_BYPASS') === 'true'
  if (bypassWindow)
    console.warn(
      '[AUTO-SEND] PIPELINE_WINDOW_BYPASS=true — garde de fenêtre [02h,04h[ LEVÉE (test réel en cours).',
    )
  if (!bypassWindow && !isWithinPipelineWindow(instant))
    return { sent: false, note: 'hors fenêtre horaire — envoi auto ignoré' }

  // Secrets / config d'envoi.
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from =
    Deno.env.get('REPORT_FROM') ?? 'Rep Jour <onboarding@resend.dev>'
  const testTo = Deno.env.get('REPORT_TEST_TO')?.trim() || null

  // 1. Candidat = LE daily_reports le plus récent (par date), et LUI SEUL. On ne
  //    remonte JAMAIS vers un rapport plus ancien : sinon, un vieux rapport jamais
  //    envoyé (ou un ré-import après envoi du jour) déclencherait l'envoi d'un
  //    rapport périmé. On envoie seulement si CE rapport est :
  //    (a) non encore auto-envoyé, (b) RÉCENT (fenêtre 3 jours — au-delà, seul le
  //    filet manuel agit), (c) son mois possède un forecast (les DEUX présents).
  const { data: latest, error: latestErr } = await admin
    .from('daily_reports')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) {
    console.error('Auto-envoi : lecture daily_reports échouée :', latestErr.message)
    return { sent: false, note: 'lecture rapports échouée' }
  }
  if (!latest) return { sent: false, note: 'aucun rapport' }
  const candidate = latest as DailyRow
  const D = candidate.date

  if (candidate.auto_sent_at)
    return { sent: false, note: `déjà envoyé (${D})` }

  // Éligibilité BORNÉE AU CYCLE COURANT (anti catch-up). Le rapport StayNTouch
  // porte sur la veille de sa génération, donc au cycle courant la date attendue
  // est businessDateStr() ou businessDateStr(J-1) (tolérance frontière 02h). Tout
  // rapport plus ancien n'est PLUS auto-envoyé — sinon un rapport de la veille non
  // envoyé partirait avec un projeté recalculé depuis le Forecast d'un AUTRE cycle
  // (mélange de millésimes). Le rattrapage des jours antérieurs reste au canal
  // manuel admin. Le motif « hors cycle » est transitoire (cf. relecture différée
  // dans index.ts) : il couvre aussi le cas où le Comparison du jour n'a pas encore
  // été committé par l'invocation sœur.
  const cycleToday = businessDateStr(instant)
  const cycleYesterday = businessDateStr(new Date(instant.getTime() - 86_400_000))
  if (D !== cycleToday && D !== cycleYesterday)
    return { sent: false, note: `hors cycle courant (${D}) — envoi auto ignoré, manuel possible` }

  // JONCTION de mois/année : le rapport J-1 tombe dans un mois différent du cycle
  // courant (nuit du 1er : rapport du dernier jour du mois précédent ; couvre aussi
  // le 31/12 -> 01/01). Ce jour-là, StayNTouch a déjà basculé au mois suivant → un
  // forecast frais du mois qui s'achève ne viendra JAMAIS. On assouplit donc la
  // règle de fraîcheur ci-dessous (forecast PRÉSENT = suffisant).
  const isMonthBoundary = D.slice(0, 7) !== cycleToday.slice(0, 7)

  // GARDE-FOU : le Forecast du mois doit être PRÉSENT (toujours), et FRAIS (importé
  // ce cycle) SAUF à la jonction de mois/année (cf. isMonthBoundary). On lit le
  // dernier `imported_at` du mois : s'il n'y a pas de forecast du tout, on n'envoie
  // pas (projeté impossible). En milieu de mois, un forecast périmé (échec ce soir,
  // ex. le 422 du 2026-08-08) bloque aussi l'envoi auto (pas de chiffres périmés) ;
  // l'envoi MANUEL reste possible.
  // NB : la colonne imported_at peut être nullable en base (lignes antérieures au
  // stamping). En SQL `order ... desc` place les NULL EN PREMIER → on les exclut
  // explicitement pour récupérer le dernier import RÉEL, jamais un NULL.
  const { data: fcRows, error: fcErr } = await admin
    .from('forecast_days')
    .select('imported_at')
    .eq('year', candidate.year)
    .eq('month', candidate.month)
    .not('imported_at', 'is', null)
    .order('imported_at', { ascending: false })
    .limit(1)
  if (fcErr) {
    console.error('Auto-envoi : lecture forecast_days échouée :', fcErr.message)
    return { sent: false, note: 'lecture prévisions échouée' }
  }
  const latestFc = fcRows?.[0]?.imported_at as string | undefined
  if (!latestFc)
    return { sent: false, note: 'Forecast absent pour ce mois — envoi auto ignoré' }
  // Fraîcheur exigée SEULEMENT hors jonction. À la jonction (dernier jour du mois /
  // 31 déc), « forecast présent » suffit : le mois est complet, on envoie avec le
  // forecast déjà en base. En milieu de mois, on garde le filet anti-projeté-périmé.
  //
  // ATTENTION : l'âge se mesure avec l'heure RÉELLE (`Date.now()`), PAS avec `instant`.
  // `instant` est figé au tout début de la requête (index.ts), AVANT le parse ; or le
  // Forecast qui vient d'être importé DANS cette même requête est estampillé
  // `imported_at = now()` APRÈS le parse, donc APRÈS `instant`. Utiliser `instant` ici
  // donnait un âge NÉGATIF → « pas frais » → auto-envoi jamais déclenché quand le
  // Comparison arrivait avant le Forecast (ou les deux dans le même mail). `instant`
  // reste réservé à la garde de fenêtre [02h,04h[ (cohérence de la borne 04h).
  const fcAgeMs = Date.now() - new Date(latestFc).getTime()
  if (!isMonthBoundary && !(fcAgeMs >= 0 && fcAgeMs < FRESH_WINDOW_MS))
    return {
      sent: false,
      note: `Forecast pas frais (importé il y a ${Math.round(fcAgeMs / 3_600_000)} h) — envoi auto ignoré, manuel possible`,
    }

  // 2. Budget du mois — requis pour l'écart. Absent → on n'envoie pas (rapport
  //    incomplet) ; ce n'est pas une erreur de la fonction.
  const { data: budget, error: budErr } = await admin
    .from('budget')
    .select('*')
    .eq('year', candidate.year)
    .eq('month', candidate.month)
    .single()
  if (budErr || !budget) {
    return {
      sent: false,
      note: `budget absent pour ${candidate.month}/${candidate.year}`,
    }
  }

  // 3. Projeté recalculé depuis forecast_days (corrige pm_*=0 si Comparison d'abord).
  const { data: forecasts, error: fcErr2 } = await admin
    .from('forecast_days')
    .select('occ, rev_ttc')
    .eq('year', candidate.year)
    .eq('month', candidate.month)
  if (fcErr2) {
    console.error('Auto-envoi : relecture forecast_days échouée :', fcErr2.message)
    return { sent: false, note: 'lecture prévisions échouée' }
  }
  const projete = computeProjeteMois(
    (forecasts ?? []) as { occ: number; rev_ttc: number }[],
    candidate.days_in_month,
  )

  // Vérif config d'envoi AVANT de réserver (hors dry-run) : ne pas « brûler »
  // l'idempotence (auto_sent_at) sur un simple défaut de secret. Le filet manuel
  // admin resterait de toute façon disponible, mais autant ne rien poser.
  if (!dryRun && !resendKey) {
    console.error('Auto-envoi : RESEND_API_KEY manquante — envoi impossible.')
    return { sent: false, note: 'RESEND_API_KEY manquante' }
  }

  // 4. RÉSERVATION ATOMIQUE + recompute pm_* : un seul gagnant. En dry-run, on
  //    saute l'écriture et l'envoi (mais on logue ce qui SERAIT parti).
  let row: DailyRow = {
    ...candidate,
    pm_nuitees: projete.nuitees,
    pm_to: projete.to,
    pm_pm: projete.pm,
    pm_revpar: projete.revpar,
    pm_room_revenue: projete.roomRevenue,
  }
  if (!dryRun) {
    const { data: reserved, error: resErr } = await admin
      .from('daily_reports')
      .update({
        auto_sent_at: new Date().toISOString(),
        pm_nuitees: projete.nuitees,
        pm_to: projete.to,
        pm_pm: projete.pm,
        pm_revpar: projete.revpar,
        pm_room_revenue: projete.roomRevenue,
      })
      .eq('date', D)
      .is('auto_sent_at', null)
      .select('*')
      .maybeSingle()
    if (resErr) {
      console.error('Auto-envoi : réservation échouée :', resErr.message)
      return { sent: false, note: 'réservation échouée' }
    }
    if (!reserved) {
      // Une autre invocation a déjà réservé (course) → on n'envoie pas.
      return { sent: false, note: 'déjà réservé/envoyé (course évitée)' }
    }
    row = reserved as DailyRow
  }

  // À partir d'ici, la RÉSERVATION (hors dry-run) est POSÉE (auto_sent_at). Toute
  // sortie NON réussie doit la LIBÉRER (remettre auto_sent_at à NULL), sinon le jour
  // est « brûlé » : marqué envoyé sans mail parti, aucune reprise auto. On enveloppe
  // donc TOUT le bloc post-réservation (rendu, PDF, envoi). Le rattrapage se fait
  // ensuite par le bandeau + envoi manuel (aucun ré-import auto n'a lieu).
  const releaseReservation = async () => {
    if (dryRun) return
    const { error: delErr } = await admin
      .from('daily_reports')
      .update({ auto_sent_at: null })
      .eq('date', D)
    if (delErr)
      console.error('Auto-envoi : libération de la réservation échouée :', delErr.message)
  }

  try {
    // 5. Reconstruire EmailData + RepjourPdfData (comme le client).
    const rj = reportToKPI(row, 'rj')
    const rmtd = reportToKPI(row, 'rmtd')
    const pm = reportToKPI(row, 'pm')
    const ecart = computeEcart(pm, budget as MonthBudget)

    // pickup = pm.roomRevenue du jour - pm.roomRevenue du dernier rapport ANTÉRIEUR
    // du même mois. monthStartProjection = pm.roomRevenue du 1er rapport du mois.
    const { data: monthRows } = await admin
      .from('daily_reports')
      .select('day_of_month, pm_room_revenue')
      .eq('year', candidate.year)
      .eq('month', candidate.month)
      .lte('day_of_month', candidate.day_of_month)
      .order('day_of_month', { ascending: true })
    const series = (monthRows ?? []) as {
      day_of_month: number
      pm_room_revenue: number
    }[]
    const monthStartProjection = series.length > 0 ? series[0].pm_room_revenue : null
    const prev = series.filter((r) => r.day_of_month < candidate.day_of_month)
    const prevPm = prev.length > 0 ? prev[prev.length - 1].pm_room_revenue : null
    const pickup = prevPm != null ? pm.roomRevenue - prevPm : null

    const emailData: EmailData = {
      realiseJour: rj,
      realiseMTD: rmtd,
      projeteMois: pm,
      budget: budget as MonthBudget,
      ecart,
      dayOfMonth: candidate.day_of_month,
      month: candidate.month,
      year: candidate.year,
      pickup,
      daysInMonth: candidate.days_in_month,
      monthStartProjection,
    }

    const dateStr = buildRepjourDateStr({
      year: candidate.year,
      month: candidate.month,
      dayOfMonth: candidate.day_of_month,
    })
    const titleDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)
    const [yr, mo, da] = D.split('-')
    const pdfTitle = `Repjour_NACV_${da}-${mo}-${yr}`

    const pdfData: RepjourPdfData = {
      titleDate,
      realiseJour: rj,
      realiseMTD: rmtd,
      projeteMois: pm,
      budget: budget as MonthBudget,
      ecart,
      pickup,
      dayOfMonth: candidate.day_of_month,
      daysInMonth: candidate.days_in_month,
      monthStartProjection,
      importedAt: row.imported_at,
    }

    const subject = buildRepjourSubject(emailData)
    const html = buildRepjourEmailHtml(emailData, dateStr)

    if (dryRun) {
      return {
        sent: false,
        note: `[DRY-RUN] aurait envoyé le rapport du ${D} (${to0(testTo)})`,
      }
    }

    // resendKey déjà vérifiée avant la réservation (hors dry-run) ; narrowing.
    if (!resendKey) {
      await releaseReservation()
      return { sent: false, note: 'RESEND_API_KEY manquante' }
    }

    const pdfBytes = buildRepjourPdfBytes(pdfData, pdfTitle)
    const result = await sendMail({
      admin,
      from,
      subject,
      html,
      pdfBytes,
      pdfName: `${pdfTitle}.pdf`,
      recipientsTable: 'server_report_recipients',
      resendKey,
      testTo,
    })

    if (!result.ok) {
      if (result.certainNotSent) {
        // Rien n'est parti (échec pré-envoi : config, destinataires, ou 4xx définitif).
        // On LIBÈRE la réservation → le bandeau « pas encore envoyé » réapparaît et un
        // renvoi manuel est possible sans risque de doublon.
        await releaseReservation()
        return { sent: false, note: `envoi échoué (${result.error ?? 'inconnu'})` }
      }
      // Issue AMBIGUË (réseau/5xx après le POST) : l'e-mail est PEUT-ÊTRE parti. On NE
      // libère PAS la réservation (un renvoi manuel créerait un doublon) ; on garde le
      // marqueur et on journalise pour vérification humaine. La clé d'idempotence Resend
      // couvre les retries INTERNES ; ce garde couvre le renvoi manuel ultérieur.
      console.error(
        `Auto-envoi : issue INCERTAINE pour ${D} (${result.error ?? 'inconnu'}) — réservation CONSERVÉE (vérifier la réception avant tout renvoi manuel).`,
      )
      return {
        sent: false,
        note: `envoi incertain (${result.error ?? 'inconnu'}) — réservation conservée, vérifier la réception`,
      }
    }
    return {
      sent: true,
      note: `envoyé le rapport du ${D} à ${result.to} destinataire(s)${
        result.cc ? ` (+${result.cc} cc)` : ''
      }${result.testMode ? ' — mode test' : ''}`,
    }
  } catch (err) {
    console.error(
      'Auto-envoi : exception post-réservation :',
      err instanceof Error ? err.message : String(err),
    )
    await releaseReservation()
    return { sent: false, note: 'envoi non abouti (exception post-réservation)' }
  }
}

/** Petit libellé de destinataires pour le log dry-run. */
function to0(testTo: string | null): string {
  return testTo ? `test → ${testTo}` : 'liste server_report_recipients'
}
