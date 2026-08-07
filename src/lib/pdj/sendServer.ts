import { supabase } from '#/lib/supabase.ts'
import { buildPdjPdf, type PdjSheetData } from '#/lib/pdj/pdf.ts'
import { buildPdjEmailHtml, buildPdjSubject } from '#/lib/pdj/reportHtml.ts'

/*
 * Envoi MANUEL de la feuille de petit-déjeuner par e-mail (Edge Function
 * `send-report` en mode `kind: 'pdj'` + Resend). Filet de secours admin : l'envoi
 * normal est AUTOMATIQUE (après import In-House, cf. import-report). Calqué sur
 * `repjour/sendServer.ts` : le front génère le PDF (jsPDF) + le corps HTML et les
 * confie à l'Edge Function, qui détient la clé Resend, choisit l'expéditeur PDJ
 * (`PDJ_REPORT_FROM`) et lit la liste DÉDIÉE `pdj_report_recipients`. Aucun secret
 * côté navigateur.
 */

export interface ServerSendResult {
  ok: boolean
  message: string
}

export async function sendPdjViaServer(
  data: PdjSheetData,
): Promise<ServerSendResult> {
  const dateStr = data.titleDate
  const subject = buildPdjSubject(data)
  const htmlBody = buildPdjEmailHtml(data, dateStr)

  // jsPDF → data-URI → base64 pur pour Resend (même patron que repjour).
  const pdf = await buildPdjPdf(data)
  const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? ''
  const [yr, mo, da] = data.serviceDate.split('-')
  const pdfName = `Breakfast_${da}-${mo}-${yr}.pdf`

  const { data: res, error } = await supabase.functions.invoke('send-report', {
    body: { kind: 'pdj', subject, htmlBody, pdfBase64, pdfName },
  })

  if (error) {
    console.error('Envoi PDJ serveur échoué :', error.message)
    return { ok: false, message: "L'envoi a échoué. Réessaie dans un instant." }
  }
  if (res?.error) {
    console.error('Envoi PDJ serveur (fonction) échoué :', res.error)
    return { ok: false, message: "L'envoi a échoué. Réessaie dans un instant." }
  }

  const to = typeof res?.to === 'number' ? res.to : 0
  const cc = typeof res?.cc === 'number' ? res.cc : 0
  const test = res?.testMode ? ' — mode test (liste restreinte)' : ''
  return {
    ok: true,
    message: `Envoyé à ${to} destinataire(s)${cc ? ` (+${cc} en copie)` : ''}${test}.`,
  }
}
