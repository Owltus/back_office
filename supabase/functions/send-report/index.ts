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
//   3. Les destinataires sont lus CÔTÉ SERVEUR depuis `server_report_recipients`
//      (liste DÉDIÉE à l'envoi serveur, distincte du mailto `email_recipients`) :
//      le navigateur ne peut pas faire envoyer à des adresses arbitraires.
//
// Empreinte backend : LECTURE SEULE (`server_report_recipients`). Aucune écriture.
// La clé Resend et l'expéditeur vivent en secrets serveur, jamais committés, jamais
// côté navigateur.
//
// Secrets à poser (par l'utilisateur) :
//   supabase secrets set RESEND_API_KEY=re_xxx
//   supabase secrets set REPORT_FROM="Rep Jour <onboarding@resend.dev>"   (test)
//   → prod : REPORT_FROM="Rep Jour <noreply@repjour.naostack.com>"
//     (domaine `repjour.naostack.com` à vérifier dans Resend, DNS sur Cloudflare)

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
  // Clé secrète : la nouvelle `sb_secret_…` si le secret SB_SECRET_KEY est posé,
  // sinon repli sur le service_role legacy auto-injecté (migration sans coupure).
  const serviceKey =
    Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
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

  // 2. Autorisation : admin (grade) OU niveau GESTION sur la page RepJour — même
  //    garde que le bouton d'envoi côté front (réservé à la gestion, pas aux
  //    éditeurs, pour éviter la confusion).
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (profErr) return json({ error: 'Autorisation impossible' }, 403)

  const isAdmin = prof?.role === 'admin'
  let pageLevel: string | null = isAdmin ? 'gestion' : null
  if (!isAdmin) {
    const { data: perm } = await admin
      .from('user_page_permissions')
      .select('level')
      .eq('user_id', caller.id)
      .eq('page', 'repjour')
      .maybeSingle()
    pageLevel = perm?.level ?? null
  }
  if (!isAdmin && pageLevel !== 'gestion')
    return json({ error: 'Non autorisé' }, 403)

  // 2b. Anti-spam SERVEUR : un envoi par utilisateur au maximum toutes les N
  //     minutes (admin de grade : 5 ; gestionnaire non-admin : 15). Enforcement
  //     non contournable. Timestamp du dernier envoi dans report_send_throttle
  //     (accès service_role uniquement).
  const cooldownMin = isAdmin ? 5 : 15
  const { data: last } = await admin
    .from('report_send_throttle')
    .select('last_sent_at')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (last?.last_sent_at) {
    const remainingMs =
      cooldownMin * 60_000 - (Date.now() - new Date(last.last_sent_at).getTime())
    if (remainingMs > 0) {
      const mins = Math.ceil(remainingMs / 60_000)
      return json(
        { error: `Envoi trop rapproché. Réessaie dans ${mins} min.` },
        429,
      )
    }
  }

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

  // Durcissement (B2) : le contenu est piloté par l'appelant (admin), on le borne.
  //   - pdfName : nom de fichier simple .pdf, jamais de chemin (../, /).
  //   - tailles plafonnées (charge mémoire / Resend).
  if (!/^[\w .()-]+\.pdf$/i.test(pdfName))
    return json({ error: 'Nom de pièce jointe invalide' }, 400)
  if (subject.length > 300 || htmlBody.length > 200_000)
    return json({ error: 'Contenu trop volumineux' }, 413)
  if (pdfBase64.length > 8_000_000)
    return json({ error: 'Pièce jointe trop volumineuse' }, 413)

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
      .from('server_report_recipients')
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

  // Durcissement (F5) : plafond de destinataires par envoi. Borne le rayon
  // d'action d'un token admin compromis (relais de masse) et les coûts Resend.
  // Le rapport journalier a une poignée de destinataires ; 50 est très large.
  const MAX_RECIPIENTS = 50
  if (to.length + cc.length > MAX_RECIPIENTS)
    return json({ error: 'Trop de destinataires pour un seul envoi' }, 413)

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
    // Erreur générique au client (Mineur-1 : ne pas exposer la structure interne
    // de l'API Resend) ; le détail reste côté serveur pour le diagnostic.
    console.error('Resend a échoué', res.status, await res.text())
    return json({ error: 'Envoi du message échoué' }, 502)
  }
  const out = await res.json().catch(() => ({}))

  // Envoi réussi : (ré)arme le cooldown pour cet utilisateur. `upsert` sur la clé
  // primaire user_id → une ligne par personne, écrasée à chaque envoi.
  await admin
    .from('report_send_throttle')
    .upsert({ user_id: caller.id, last_sent_at: new Date().toISOString() })

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
