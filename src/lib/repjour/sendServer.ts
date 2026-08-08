import { supabase } from '#/lib/supabase.ts'
import { DAY_NAMES, MONTHS } from '#/lib/repjour/constants.ts'
import { buildRepjourPdf, type RepjourPdfData } from '#/lib/repjour/pdf.ts'
import {
  buildReportHtml,
  REPORT_EMAIL_CONTAINER_STYLE,
  type EmailData,
} from '#/lib/repjour/reportHtml.ts'

/*
 * Envoi du rapport par e-mail CÔTÉ SERVEUR (Edge Function `send-report` + Resend).
 *
 * Contrairement à `email.ts` (mailto + image presse-papier, 100 % navigateur),
 * ce chemin produit un VRAI e-mail : PDF en pièce jointe + corps HTML mis en
 * forme, en un clic, sans geste manuel. C'est le flux « dev », réservé aux admins
 * le temps de le stabiliser (domaine d'expéditeur à vérifier côté Resend).
 *
 * Le front n'a AUCUN secret : il génère le PDF (jsPDF) et le corps HTML, puis les
 * confie à l'Edge Function, qui détient la clé Resend et lit elle-même la liste
 * des destinataires. Voir `supabase/functions/send-report/index.ts`.
 */

export interface ServerSendInput {
  /** Données du tableau/corps HTML. */
  emailData: EmailData
  /** Données du document PDF (même contenu que la fonction Imprimer). */
  pdfData: RepjourPdfData
  /** Nom de fichier du PDF, sans extension. */
  pdfTitle: string
}

export interface ServerSendResult {
  ok: boolean
  message: string
}

/** DOCUMENT HTML COMPLET d'un e-mail responsive (et non un simple fragment) :
 * `<!doctype>` + `<head>` avec `<meta viewport>` — SANS lui, les mobiles supposent
 * une largeur « bureau » (~980 px), ne déclenchent pas la media query et affichent
 * la version desktop dézoomée. C'est LE prérequis d'un e-mail responsive correct.
 *   - `viewport` : la page fait la largeur de l'appareil → media queries actives.
 *   - `x-apple-disable-message-reformatting` : Apple Mail n'ajuste pas les tailles.
 *   - `-webkit-text-size-adjust` : pas d'agrandissement auto du texte sur mobile.
 *   - `<style>` en TÊTE (et non dans le corps), là où Gmail & co l'attendent.
 *
 * Responsive calqué sur la GRILLE de la page RepJour (`grid-cols-2 sm:grid-cols-4`),
 * piloté par la LARGEUR DE FENÊTRE (media query, comme le site — reflow automatique
 * au redimensionnement). Sous 480 px :
 *   - les 4 cartes basculent en 2×2 (le tableau `.rj-cards` devient des blocs, chaque
 *     `.rj-cardcell` passe à 50 %) — le `sm:` de Tailwind ;
 *   - le tableau KPI bascule en version COMPACTE (technique « double cellule » de
 *     `KPITable` : `.rj-full` masqué, `.rj-compact` révélé) + padding resserré.
 * `.rj-compact` est masqué par défaut (et en inline `display:none`) → les clients
 * qui ignorent `<style>`/media queries gardent le tableau LONG — jamais les deux.
 * Le texte encadre le rapport comme un courriel : appel, transmission (le PDF est en
 * pièce jointe), politesse. */
function buildHtmlBody(data: EmailData, dateStr: string): string {
  const para =
    'font-size: 14px; line-height: 1.5; color: #1A1A1A; margin: 0;'
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Rep Jour du ${dateStr}</title>
  <style>
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    .rj-compact { display: none; }
    @media only screen and (max-width: 480px) {
      .rj-cards, .rj-cards tbody, .rj-cards tr { display: block !important; }
      .rj-cardcell { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; }
      .rj-cell { padding-left: 4px !important; padding-right: 4px !important; }
      .rj-full { display: none !important; }
      .rj-compact { display: inline !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #FFFFFF;">
  <div style="background: #FFFFFF; padding: 8px;">
    <div style="${REPORT_EMAIL_CONTAINER_STYLE}">
      <p style="${para} margin-bottom: 14px;">Bonjour,</p>
      <p style="${para} margin-bottom: 18px;">Veuillez trouver ci-joint le rapport du ${dateStr}.</p>
      ${buildReportHtml(data, { forEmail: true })}
      <p style="${para} margin-top: 18px;">Bonne réception,</p>
    </div>
  </div>
</body>
</html>`
}

export async function sendReportViaServer(
  input: ServerSendInput,
): Promise<ServerSendResult> {
  const { emailData, pdfData, pdfTitle } = input

  const d = new Date(
    emailData.year,
    emailData.month - 1,
    emailData.dayOfMonth,
  )
  const dateStr = `${DAY_NAMES[d.getDay()]} ${emailData.dayOfMonth} ${MONTHS[emailData.month]} ${emailData.year}`
  const subject = `OKKO Nantes centre-ville - Rep Jour du ${dateStr}`
  const htmlBody = buildHtmlBody(emailData, dateStr)

  // jsPDF → data-URI ('data:application/pdf;base64,....') → base64 pur pour Resend.
  const pdf = await buildRepjourPdf(pdfData, pdfTitle)
  const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? ''

  // Date du rapport (YYYY-MM-DD) : permet à send-report de POSER le marqueur d'envoi
  // (daily_reports.auto_sent_at) pour que le bandeau « pas encore envoyé » se retire.
  const reportDate = `${emailData.year}-${String(emailData.month).padStart(2, '0')}-${String(emailData.dayOfMonth).padStart(2, '0')}`

  const { data, error } = await supabase.functions.invoke('send-report', {
    body: { date: reportDate, subject, htmlBody, pdfBase64, pdfName: `${pdfTitle}.pdf` },
  })

  if (error) {
    console.error("Envoi serveur échoué :", error.message)
    return { ok: false, message: "L'envoi a échoué. Réessaie dans un instant." }
  }
  if (data?.error) {
    console.error("Envoi serveur (fonction) échoué :", data.error)
    return { ok: false, message: "L'envoi a échoué. Réessaie dans un instant." }
  }

  const to = typeof data?.to === 'number' ? data.to : 0
  const cc = typeof data?.cc === 'number' ? data.cc : 0
  const test = data?.testMode ? ' — mode test (liste restreinte)' : ''
  return {
    ok: true,
    message: `Envoyé à ${to} destinataire(s)${cc ? ` (+${cc} en copie)` : ''}${test}.`,
  }
}
