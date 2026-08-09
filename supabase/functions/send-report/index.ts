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

import { sendMail } from '../_shared/send-mail.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  // Clé secrète : la nouvelle `sb_secret_…` si le secret SB_SECRET_KEY est posé,
  // sinon repli sur le service_role legacy auto-injecté (migration sans coupure).
  const serviceKey =
    Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')

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

  // 2. Autorisation : GRADE ADMIN uniquement (profiles.role = 'admin') — pas le
  //    niveau de page « gestion » qu'un gestionnaire non-admin pourrait avoir. Le
  //    flux d'envoi serveur reste réservé aux vrais admins tant qu'il est en dev.
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (profErr || prof?.role !== 'admin')
    return json({ error: 'Réservé aux administrateurs' }, 403)

  // 2b. Anti-spam SERVEUR PROGRESSIF (par utilisateur, non contournable) : au lieu
  //     d'un blocage fixe, une courbe qui se dégonfle toute seule à l'arrêt.
  //       - délai de base : 10 s entre deux envois (on peut en enchaîner) ;
  //       - >= 5 envois en 1 min  → l'écart requis monte à 5 min ;
  //       - >= 10 envois en 5 min → l'écart requis monte à 1 h.
  //     L'historique récent (horodatages epoch ms) est stocké dans
  //     report_send_throttle.recent_sends (jsonb), élagué à 1 h. service_role only.
  const nowMs = Date.now()
  const { data: throttleRow } = await admin
    .from('report_send_throttle')
    .select('recent_sends')
    .eq('user_id', caller.id)
    .maybeSingle()
  const rawRecent = Array.isArray(throttleRow?.recent_sends)
    ? (throttleRow.recent_sends as unknown[])
    : []
  const recent = rawRecent
    .map((t) => (typeof t === 'number' ? t : new Date(String(t)).getTime()))
    .filter((t) => Number.isFinite(t) && nowMs - t < 3_600_000) // garde 1 h
  const inLastMinute = recent.filter((t) => nowMs - t < 60_000).length
  const inLast5Min = recent.filter((t) => nowMs - t < 300_000).length
  let requiredGapMs = 10_000 // base : 10 s
  if (inLastMinute >= 5) requiredGapMs = 300_000 // 5 min
  if (inLast5Min >= 10) requiredGapMs = 3_600_000 // 1 h
  const lastMs = recent.length ? Math.max(...recent) : 0
  if (lastMs && nowMs - lastMs < requiredGapMs) {
    const remainingMs = requiredGapMs - (nowMs - lastMs)
    const msg =
      remainingMs >= 60_000
        ? `Trop d'envois rapprochés. Réessaie dans ${Math.ceil(remainingMs / 60_000)} min.`
        : `Petit délai anti-doublon. Réessaie dans ${Math.ceil(remainingMs / 1000)} s.`
    return json({ error: msg }, 429)
  }

  // 3. Corps de requête (produit par le front : jsPDF + rendu HTML).
  //    `kind` distingue le RepJour (défaut) du PDJ : il pilote l'EXPÉDITEUR et la
  //    LISTE de destinataires (deux diffusions strictement séparées).
  let body: {
    kind?: 'repjour' | 'pdj'
    date?: string
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
  const kind = body.kind === 'pdj' ? 'pdj' : 'repjour'
  // Date du rapport (YYYY-MM-DD) — optionnelle : sert UNIQUEMENT à poser le marqueur
  // d'envoi après succès (pour que le bandeau « pas encore envoyé » se retire).
  const reportDate = (body.date ?? '').trim()
  const subject = (body.subject ?? '').trim()
  const htmlBody = body.htmlBody ?? ''
  const pdfBase64 = body.pdfBase64 ?? ''
  const pdfName = (body.pdfName ?? 'rapport.pdf').trim()
  if (!subject || !htmlBody)
    return json({ error: 'Sujet ou corps manquant' }, 400)

  // Expéditeur + table de destinataires selon `kind`. `onboarding@resend.dev` en
  // repli test (Resend n'accepte alors QUE ton adresse d'inscription). Bascule vers
  // les domaines vérifiés (repjour/pdj .naostack.com) une fois les DNS en place.
  const from =
    kind === 'pdj'
      ? (Deno.env.get('PDJ_REPORT_FROM') ??
        Deno.env.get('REPORT_FROM') ??
        'OKKO PDJ <onboarding@resend.dev>')
      : (Deno.env.get('REPORT_FROM') ?? 'Rep Jour <onboarding@resend.dev>')
  const recipientsTable =
    kind === 'pdj' ? 'pdj_report_recipients' : 'server_report_recipients'

  // TEST DIAGNOSTIC (temporaire, OFF par défaut) : si le secret PDJ_TEST_NO_PDF=true,
  // on envoie le PDJ SANS la pièce jointe PDF. But : vérifier si c'est le PDF (liste
  // de noms clients = données personnelles) qui déclenche un rejet silencieux côté
  // tenant okko (hypothèse DLP), alors que le Rep Jour (chiffres seuls) passe. Le PDF
  // reste construit côté client, on ne fait que NE PAS le joindre ici. À RETIRER après
  // le diagnostic (supprimer le secret suffit à revenir au comportement normal).
  const skipPdf = kind === 'pdj' && Deno.env.get('PDJ_TEST_NO_PDF') === 'true'
  if (skipPdf)
    console.log('[TEST] PDJ envoyé SANS pièce jointe (PDJ_TEST_NO_PDF=true)')

  // Durcissement (B2) : le contenu est piloté par l'appelant (admin), on le borne.
  //   - pdfName : nom de fichier simple .pdf, jamais de chemin (../, /).
  //   - tailles plafonnées (charge mémoire / Resend).
  if (!/^[\w .()-]+\.pdf$/i.test(pdfName))
    return json({ error: 'Nom de pièce jointe invalide' }, 400)
  if (subject.length > 300 || htmlBody.length > 200_000)
    return json({ error: 'Contenu trop volumineux' }, 413)
  if (pdfBase64.length > 8_000_000)
    return json({ error: 'Pièce jointe trop volumineuse' }, 413)

  // 4. + 5. Destinataires + envoi, DÉLÉGUÉS au module partagé ../_shared/send-mail.ts
  //    (lecture de la liste `recipientsTable`, garde-fou liste blanche REPORT_TEST_TO,
  //    plafond de destinataires, envoi Resend, erreurs génériques). Un même code
  //    d'envoi sert ce chemin MANUEL et le chemin AUTOMATIQUE (import-report).
  const testTo = Deno.env.get('REPORT_TEST_TO')
  const result = await sendMail({
    admin,
    from,
    subject,
    html: htmlBody,
    pdfBase64: skipPdf ? null : pdfBase64,
    pdfName,
    recipientsTable,
    resendKey,
    testTo,
  })

  if (!result.ok)
    return json({ error: result.error ?? 'Envoi du message échoué' }, 502)

  // Envoi réussi : POSE LE MARQUEUR D'ENVOI pour la date du rapport, afin que le
  // bandeau « pas encore envoyé » (front) se retire après un envoi MANUEL, comme
  // après un envoi auto. On réutilise les marqueurs existants (auto_sent_at pour le
  // RepJour ; ligne pdj_auto_send_log pour le PDJ) — « auto_sent_at » signifie donc
  // « envoyé (auto ou manuel) ». Best-effort : un échec ici n'annule pas le mail parti.
  if (/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    try {
      if (kind === 'pdj') {
        await admin.from('pdj_auto_send_log').upsert(
          { service_date: reportDate, sent_at: new Date(nowMs).toISOString() },
          { onConflict: 'service_date', ignoreDuplicates: true },
        )
      } else {
        await admin
          .from('daily_reports')
          .update({ auto_sent_at: new Date(nowMs).toISOString() })
          .eq('date', reportDate)
      }
    } catch (e) {
      console.error(
        "Marqueur d'envoi manuel non posé :",
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  // Ajoute cet horodatage à l'historique récent (élagué, max 30
  // entrées) → alimente la courbe anti-spam progressive. `upsert` sur user_id.
  const updatedRecent = [...recent, nowMs].slice(-30)
  await admin.from('report_send_throttle').upsert({
    user_id: caller.id,
    last_sent_at: new Date(nowMs).toISOString(),
    recent_sends: updatedRecent,
  })

  return json(
    {
      ok: true,
      id: result.id ?? null,
      to: result.to,
      cc: result.cc,
      testMode: result.testMode,
    },
    200,
  )
})
