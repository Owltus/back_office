import { supabase } from '#/lib/supabase.ts'
import { DAY_NAMES, MONTHS } from '#/lib/repjour/constants.ts'
import { buildRepjourPdf, type RepjourPdfData } from '#/lib/repjour/pdf.ts'
import {
  buildReportHtml,
  REPORT_CONTAINER_STYLE,
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

/** Corps HTML autonome (conteneur + cartes) sur fond blanc, prêt pour un e-mail. */
function buildHtmlBody(data: EmailData): string {
  return `<div style="${REPORT_CONTAINER_STYLE} background: #FFFFFF;">${buildReportHtml(
    data,
  )}</div>`
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
  const subject = `Rep Jour — Rapport du ${dateStr}`
  const htmlBody = buildHtmlBody(emailData)

  // jsPDF → data-URI ('data:application/pdf;base64,....') → base64 pur pour Resend.
  const pdf = await buildRepjourPdf(pdfData, pdfTitle)
  const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? ''

  const { data, error } = await supabase.functions.invoke('send-report', {
    body: { subject, htmlBody, pdfBase64, pdfName: `${pdfTitle}.pdf` },
  })

  if (error) return { ok: false, message: `Échec de l'envoi : ${error.message}` }
  if (data?.error)
    return { ok: false, message: `Échec de l'envoi : ${data.error}` }

  const to = typeof data?.to === 'number' ? data.to : 0
  const cc = typeof data?.cc === 'number' ? data.cc : 0
  const test = data?.testMode ? ' — mode test (liste restreinte)' : ''
  return {
    ok: true,
    message: `Envoyé à ${to} destinataire(s)${cc ? ` (+${cc} en copie)` : ''}${test}.`,
  }
}
