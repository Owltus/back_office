// Edge Function `send-report` — envoi du rapport journalier par e-mail, avec le
// PDF EN PIÈCE JOINTE et un corps HTML mis en forme, via Resend.
//
// POURQUOI une Edge Function
//   `mailto:` (côté navigateur) ne sait NI joindre un fichier NI porter du HTML.
//   Le seul moyen d'obtenir « un clic → PDF joint + email HTML » est de faire
//   partir le mail d'un serveur. Cette fonction reçoit du front le PDF (base64,
//   généré par jsPDF) + le corps HTML, lit la liste des destinataires côté
//   serveur, puis délègue l'envoi à Resend.
//
// SÉCURITÉ (même modèle que create-user / delete-user)
//   1. verify_jwt (passerelle) : toute requête sans JWT valide est rejetée.
//   2. Contrôle applicatif : on lit le rôle de l'APPELANT dans `profiles` via la
//      clé service_role ; SEUL un `admin` peut envoyer (le bouton est déjà
//      admin-only côté front, mais la décision réelle est prise ICI).
//   3. Les destinataires sont lus CÔTÉ SERVEUR depuis `email_recipients` : le
//      navigateur ne peut pas faire envoyer à des adresses arbitraires.
//
// Empreinte sur le backend partagé : LECTURE SEULE (`email_recipients`). Aucune
// écriture. La clé Resend et l'expéditeur vivent en secrets serveur, jamais
// committés, jamais côté navigateur.
//
// Secrets à poser (par l'utilisateur) :
//   supabase secrets set RESEND_API_KEY=re_xxx
//   supabase secrets set REPORT_FROM="Rep Jour <onboarding@resend.dev>"   (test)
//   → plus tard : REPORT_FROM="Rep Jour <repjour@backoffice.daystrome.com>"

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

interface Recipient {
  email: string
  type: 'to' | 'cc'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  // Expéditeur : `onboarding@resend.dev` en test (Resend n'accepte alors QUE ta
  // propre adresse d'inscription comme destinataire). À basculer vers ton domaine
  // vérifié une fois les DNS en place.
  const from = Deno.env.get('REPORT_FROM') ?? 'Rep Jour <onboarding@resend.dev>'

  if (!url || !serviceKey)
    return json({ error: 'Configuration serveur manquante' }, 500)
  if (!resendKey)
    return json({ error: 'RESEND_API_KEY manquante (secret non posé)' }, 500)

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Identité de l'appelant (JWT validé côté serveur).
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Non authentifié' }, 401)
  const {
    data: { user: caller },
    error: callerErr,
  } = await admin.auth.getUser(token)
  if (callerErr || !caller) return json({ error: 'Session invalide' }, 401)

  // 2. Autorisation : l'appelant DOIT être admin.
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (profErr || prof?.role !== 'admin')
    return json({ error: 'Réservé aux administrateurs' }, 403)

  // 3. Corps de requête (produit par le front : jsPDF + buildReportHtml).
  let body: {
    subject?: string
    htmlBody?: string
    pdfBase64?: string
    pdfName?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400)
  }
  const subject = (body.subject ?? '').trim()
  const htmlBody = body.htmlBody ?? ''
  const pdfBase64 = body.pdfBase64 ?? ''
  const pdfName = (body.pdfName ?? 'rapport.pdf').trim()
  if (!subject || !htmlBody)
    return json({ error: 'Sujet ou corps manquant' }, 400)

  // 4. Destinataires.
  //   GARDE-FOU LISTE BLANCHE : si le secret REPORT_TEST_TO est défini, on IGNORE
  //   TOTALEMENT `email_recipients` et on n'envoie QU'AUX adresses de ce secret
  //   (une ou plusieurs, séparées par des virgules). Aucune autre adresse ne peut
  //   recevoir. Pour passer à la vraie liste (production) : retirer ce secret
  //   (`supabase secrets unset REPORT_TEST_TO`).
  const testTo = Deno.env.get('REPORT_TEST_TO')?.trim()
  let to: string[]
  let cc: string[] = []
  if (testTo) {
    to = testTo
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  } else {
    const { data: recips, error: recipErr } = await admin
      .from('email_recipients')
      .select('email, type')
      .eq('active', true)
    if (recipErr)
      return json({ error: 'Lecture des destinataires échouée' }, 500)
    const list = (recips ?? []) as Recipient[]
    to = list.filter((r) => r.type === 'to').map((r) => r.email)
    cc = list.filter((r) => r.type === 'cc').map((r) => r.email)
  }
  if (to.length === 0)
    return json({ error: 'Aucun destinataire actif (type « to »)' }, 400)

  // 5. Envoi via Resend (PDF en pièce jointe si fourni).
  const payload: Record<string, unknown> = {
    from,
    to,
    subject,
    html: htmlBody,
  }
  if (cc.length > 0) payload.cc = cc
  if (pdfBase64)
    payload.attachments = [{ filename: pdfName, content: pdfBase64 }]

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const detail = await res.text()
    return json({ error: 'Envoi Resend échoué', detail }, 502)
  }
  const out = await res.json().catch(() => ({}))
  return json(
    {
      ok: true,
      id: out?.id ?? null,
      to: to.length,
      cc: cc.length,
      testMode: Boolean(testTo),
    },
    200,
  )
})
