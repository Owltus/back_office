// Module d'envoi e-mail PARTAGÉ (Deno) — Resend + lecture des destinataires.
//
// POURQUOI : deux appelants ont besoin d'envoyer un rapport par e-mail avec un PDF
// en pièce jointe :
//   - send-report  : envoi MANUEL déclenché par un admin (JWT + anti-spam gérés
//                    par send-report LUI-MÊME, en amont de ce module) ;
//   - import-report: envoi AUTOMATIQUE déclenché par le robot d'import, en
//                    service_role, SANS utilisateur (donc sans JWT ni throttle).
//
// Ce module ne connaît NI l'authentification NI l'idempotence : il reçoit un
// contenu déjà rendu (sujet + HTML + PDF) et une TABLE de destinataires, lit la
// liste côté serveur (ou la liste blanche de test), borne le rayon, puis délègue à
// Resend. La clé Resend et les expéditeurs vivent en secrets serveur.
//
// Garde-fou liste blanche : si `testTo` est fourni (secret REPORT_TEST_TO), on
// IGNORE totalement la table et on n'envoie QU'À ces adresses — parfait pour
// valider l'envoi (manuel ou auto) sans risque.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

interface Recipient {
  email: string
  type: 'to' | 'cc'
}

export interface SendMailInput {
  /** Client service_role (bypass RLS) fourni par l'appelant. */
  admin: SupabaseClient
  /** Expéditeur complet, ex. « OKKO PDJ <noreply@pdj.naostack.com> ». */
  from: string
  subject: string
  /** Corps HTML complet (document `<!doctype html>…`). */
  html: string
  /** PDF en pièce jointe, en octets (optionnel) — chemin serveur/auto (jsPDF Deno). */
  pdfBytes?: Uint8Array | null
  /** PDF en pièce jointe, DÉJÀ en base64 (optionnel) — chemin manuel (jsPDF client).
   * Prioritaire sur `pdfBytes` s'il est fourni (évite un ré-encodage). */
  pdfBase64?: string | null
  /** Nom de fichier de la pièce jointe (borné : simple `.pdf`, sans chemin). */
  pdfName?: string
  /** Table des destinataires, ex. « server_report_recipients » / « pdj_report_recipients ». */
  recipientsTable: string
  /** Clé Resend (secret RESEND_API_KEY). */
  resendKey: string
  /** Liste blanche de test (secret REPORT_TEST_TO) : si posée, seule elle reçoit. */
  testTo?: string | null
}

export interface SendMailResult {
  ok: boolean
  to: number
  cc: number
  testMode: boolean
  id?: string | null
  /** Message d'erreur GÉNÉRIQUE (le détail reste dans les logs serveur). */
  error?: string
}

// Plafond de destinataires par envoi — borne le rayon d'action et les coûts Resend
// (le rapport a une poignée de destinataires ; 50 est très large). Aligné sur
// send-report (durcissement F5).
const MAX_RECIPIENTS = 50

/**
 * Envoie un e-mail via Resend vers la liste `recipientsTable` (ou la liste blanche
 * de test). Ne lève JAMAIS : renvoie toujours un SendMailResult (l'appelant décide
 * quoi en faire). Les erreurs détaillées partent dans les logs.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const {
    admin,
    from,
    subject,
    html,
    pdfBytes,
    pdfBase64,
    pdfName = 'rapport.pdf',
    recipientsTable,
    resendKey,
    testTo,
  } = input

  const fail = (msg: string): SendMailResult => ({
    ok: false,
    to: 0,
    cc: 0,
    testMode: Boolean(testTo?.trim()),
    error: msg,
  })

  if (!subject.trim() || !html) return fail('Sujet ou corps manquant')
  if (!/^[\w .()-]+\.pdf$/i.test(pdfName))
    return fail('Nom de pièce jointe invalide')

  // 1. Destinataires : liste blanche de test prioritaire, sinon la table.
  const test = testTo?.trim()
  let to: string[]
  let cc: string[] = []
  if (test) {
    to = test
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  } else {
    const { data: recips, error: recipErr } = await admin
      .from(recipientsTable)
      .select('email, type')
      .eq('active', true)
    if (recipErr) {
      console.error(
        `Lecture des destinataires (${recipientsTable}) échouée :`,
        recipErr.message,
      )
      return fail('Lecture des destinataires échouée')
    }
    const list = (recips ?? []) as Recipient[]
    to = list.filter((r) => r.type === 'to').map((r) => r.email)
    cc = list.filter((r) => r.type === 'cc').map((r) => r.email)
  }

  if (to.length === 0) return fail('Aucun destinataire actif (type « to »)')
  if (to.length + cc.length > MAX_RECIPIENTS)
    return fail('Trop de destinataires pour un seul envoi')

  // 2. Envoi Resend (PDF en pièce jointe si fourni).
  const payload: Record<string, unknown> = { from, to, subject, html }
  if (cc.length > 0) payload.cc = cc
  const attachmentContent =
    pdfBase64 && pdfBase64.length > 0
      ? pdfBase64
      : pdfBytes && pdfBytes.length > 0
        ? encodeBase64(pdfBytes)
        : null
  if (attachmentContent)
    payload.attachments = [{ filename: pdfName, content: attachmentContent }]

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('Appel Resend échoué', err)
    return fail('Envoi du message échoué')
  }

  if (!res.ok) {
    // Erreur générique (ne pas exposer la structure interne de Resend) ; détail logs.
    console.error('Resend a échoué', res.status, await res.text())
    return fail('Envoi du message échoué')
  }
  const out = await res.json().catch(() => ({}))

  return {
    ok: true,
    id: out?.id ?? null,
    to: to.length,
    cc: cc.length,
    testMode: Boolean(test),
  }
}
