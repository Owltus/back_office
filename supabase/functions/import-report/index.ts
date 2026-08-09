// Edge Function « import-report » — le ROBOT d'import automatique.
//
// Reçoit l'e-mail BRUT (message/rfc822) relayé par le Worker Cloudflare
// « stayntouch_in_to_supabase », en extrait la/les pièce(s) jointe(s) CSV, détecte
// quel rapport StayNTouch c'est, puis délègue à l'importeur correspondant.
//
// NE FAIT QUE RECEVOIR / IMPORTER. N'envoie AUCUN e-mail (rien à voir avec
// send-report). Aucune réponse sortante autre que le compte rendu JSON au Worker.
//
// SÉCURITÉ (non négociable, dans cet ordre) :
//   1. Méthode POST uniquement.
//   2. En-tête X-Import-Secret OBLIGATOIRE et égal au secret serveur IMPORT_SECRET.
//      La fonction sera déployée en verify_jwt=false (appelée par le Worker, pas
//      par un utilisateur connecté) → CE SECRET est la seule barrière : sans lui,
//      401, avant toute lecture du corps.
//   3. Le filtrage de l'expéditeur (domaine « stayntouch ») est fait EN AMONT par
//      le Worker ; on ne s'y fie pas seul, le secret reste requis ici.
//
// Écritures en base : via la clé service_role (bypass RLS), exactement comme
// send-report. Estampille « StayNTouch (PMS) » (voir étapes 3/4).

import PostalMime from 'npm:postal-mime@2'
import { createClient } from 'jsr:@supabase/supabase-js@2'

import { importComparison, importForecast } from './repjour.ts'
import { importInhouse } from './pdj.ts'
import { maybeAutoSendRepjour } from './autoSend.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Comparaison EN TEMPS CONSTANT du secret d'entrée. On hashe les deux valeurs en
 * SHA-256 (longueur fixe) puis on compare octet par octet SANS court-circuit : le
 * temps de réponse ne fuit ni la longueur ni le préfixe correct du secret (la
 * comparaison `!==` sur String s'arrêtait au 1er octet différent). C'est la seule
 * barrière d'authentification (verify_jwt=false, écriture service_role). */
async function secretMatches(
  provided: string | null,
  expected: string,
): Promise<boolean> {
  if (provided == null) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const va = new Uint8Array(a)
  const vb = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

// --- Détection du type de rapport (EXTENSIBLE : ajouter une entrée ici) -------
type ReportType = 'comparison' | 'forecast' | 'inhouse'

/** Devine le type d'un CSV par son nom de fichier puis, en repli, par sa signature
 * de contenu (mêmes critères que les imports manuels RepJour/PDJ). */
function detectType(filename: string, content: string): ReportType | null {
  const f = filename.toLowerCase()

  // 1) Par nom de fichier (le plus fiable). LARGE : couvre les exports manuels
  //    (« Comparison By Date », « Forecast By Date Range », « In-House Guests »)
  //    ET les exports planifiés du pipeline (« *_comparison_report_DAILY_* »,
  //    « *_forecast_report_DAILY_* », « *_in_house_guests_report_DAILY_* »). Les
  //    trois mots-clés sont mutuellement exclusifs entre les 3 types de rapport.
  if (f.includes('comparison')) return 'comparison'
  if (f.includes('forecast')) return 'forecast'
  if (
    f.includes('in-house') ||
    f.includes('in_house') ||
    f.includes('inhouse') ||
    f.includes('in house')
  )
    return 'inhouse'

  // 2) Repli par contenu (nom altéré). On inspecte les 1res lignes (pas seulement
  //    la 1re) : dans le forecast, « FORECAST » est en ligne 2-3, pas en ligne 1.
  const head = content.slice(0, 2000).toUpperCase()
  if (content.includes('Occupied Rooms')) return 'comparison'
  if (head.includes('FORECAST')) return 'forecast'
  // Signature In-House : en-tête portant à la fois « Guest Name » et « Addons ».
  if (/(^|[,;])\s*Guest Name\s*([,;])/.test(content) && content.includes('Addons'))
    return 'inhouse'

  return null
}

interface AttachmentResult {
  filename: string
  type: ReportType | null
  ok: boolean
  imported?: number
  note?: string
}

// Importeurs métier : voir ./repjour.ts (Comparison + Forecast) et ./pdj.ts
// (In-House). Chacun prend le client service_role, lève sur erreur bloquante et
// renvoie le nombre de lignes importées.

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  // 1. Secret partagé — barrière unique, vérifiée AVANT toute lecture du corps.
  const secret = Deno.env.get('IMPORT_SECRET')
  if (!secret) return json({ error: 'Configuration serveur manquante' }, 500)
  if (!(await secretMatches(req.headers.get('X-Import-Secret'), secret)))
    return json({ error: 'Non autorisé' }, 401)

  // Client service_role (bypass RLS) — même schéma que send-report : nouvelle clé
  // sb_secret si posée, sinon repli service_role legacy.
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey =
    Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey)
    return json({ error: 'Configuration serveur manquante' }, 500)
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // MODE TEST : IMPORT_DRY_RUN=true → on parse et VALIDE tout (mêmes contrôles
  // qu'en réel : nuitées>80, négatifs, forecast en HT, colonnes/date PDJ…), mais
  // on N'ÉCRIT RIEN en base. Le résumé part dans les logs. Bascule à false (ou
  // secret retiré) pour l'import réel.
  const dryRun = Deno.env.get('IMPORT_DRY_RUN') === 'true'

  // HORLOGE UNIQUE : lue une seule fois par requête et propagée à l'ENVOI AUTO
  // (garde de fenêtre [02h,04h[ + bornage du cycle, décidés dans autoSend.ts).
  //
  // L'INGESTION, elle, n'est PLUS bornée par l'heure : on IMPORTE TOUJOURS. Les
  // écritures sont idempotentes (upsert), donc une re-livraison est sans danger, et
  // surtout un e-mail livré en RETARD (retard SMTP/greylisting, passage à l'heure
  // d'été, à cheval sur 04h) n'est plus PERDU en silence. Seul l'AUTO-ENVOI reste
  // borné à [02h,04h[ (garde dans maybeAutoSendRepjour) : hors fenêtre, les données
  // sont bien enregistrées mais le mail n'est pas auto-envoyé (le filet manuel admin
  // + le bandeau « pas encore envoyé » prennent le relais).
  const instant = new Date()

  // 2. Corps = e-mail brut (MIME complet).
  const rawEmail = await req.text()
  if (!rawEmail) return json({ error: 'Corps vide' }, 400)

  // 3. Extraction des pièces jointes CSV.
  let attachments: { filename: string; mimeType: string; content: ArrayBuffer }[]
  try {
    const parsed = await PostalMime.parse(rawEmail)
    attachments = (parsed.attachments ?? []) as typeof attachments
  } catch (err) {
    console.error('Parsing MIME échoué', err)
    return json({ error: 'E-mail illisible' }, 400)
  }

  const csvs = attachments.filter(
    (a) =>
      (a.mimeType || '').toLowerCase().includes('csv') ||
      (a.filename || '').toLowerCase().endsWith('.csv'),
  )
  if (csvs.length === 0)
    return json({ error: 'Aucune pièce jointe CSV' }, 422)

  // 4. Traiter chaque CSV : détecter puis importer. On borne le rayon (un e-mail
  //    = 1 CSV aujourd'hui, mais on gère N par robustesse / rapports futurs).
  const results: AttachmentResult[] = []
  let hadError = false
  for (const att of csvs) {
    const filename = att.filename || 'sans-nom.csv'
    // Nom assaini pour la JOURNALISATION uniquement : le nom vient d'un en-tête MIME
    // (potentiellement forgé) ; on retire CR/LF/TAB et on borne la longueur pour
    // éviter la falsification de logs (log forging).
    const logName = filename.replace(/[\r\n\t]/g, ' ').slice(0, 200)
    const content = new TextDecoder('utf-8').decode(att.content)
    const type = detectType(filename, content)
    if (!type) {
      hadError = true
      results.push({ filename, type: null, ok: false, note: 'type non reconnu' })
      continue
    }
    try {
      const imported =
        type === 'comparison'
          ? await importComparison(admin, content, filename, dryRun)
          : type === 'forecast'
            ? await importForecast(admin, content, filename, dryRun)
            : await importInhouse(admin, content, filename, dryRun)
      results.push({
        filename,
        type,
        ok: true,
        imported,
        note: dryRun ? 'dry-run : validé, rien écrit' : undefined,
      })
      // Résumé LISIBLE dans les logs Supabase (Functions → import-report → Logs).
      console.log(
        `${dryRun ? '[DRY-RUN] recu OK' : '[IMPORT]'} ${type} « ${logName} » -> ${imported} ligne(s)${dryRun ? ' valides, AUCUNE ecriture' : ' importees'}.`,
      )
    } catch (err) {
      hadError = true
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Import ${type} (${logName}) échoué :`, message)
      results.push({ filename, type, ok: false, note: message })
    }
  }

  // 4b. ENVOI AUTOMATIQUE du RepJour : si un Comparison ou un Forecast vient
  //     d'être importé, tenter l'envoi auto (il ne part QUE si les DEUX du jour
  //     sont présents, une seule fois — garde d'idempotence auto_sent_at). Un échec
  //     ou un no-op N'IMPACTE PAS le statut d'import (le PMS ne doit pas rejouer
  //     l'e-mail pour un souci d'envoi). En dry-run : détecte et logue, n'envoie rien.
  const touchedRepjour = results.some(
    (r) => r.ok && (r.type === 'comparison' || r.type === 'forecast'),
  )
  if (touchedRepjour) {
    try {
      let outcome = await maybeAutoSendRepjour(admin, dryRun, instant)
      // Course concurrente : Comparison et Forecast arrivent en DEUX e-mails →
      // deux invocations Edge quasi simultanées. Si celle-ci s'abstient pour une
      // raison TRANSITOIRE (la donnée sœur n'est pas encore committée), on retente
      // UNE fois après un court délai, le temps que l'autre invocation committe.
      // L'idempotence atomique (auto_sent_at) garantit qu'aucun double envoi ne peut
      // en résulter. Fenêtre résiduelle infime si le commit sœur dépasse le délai.
      if (!dryRun && !outcome.sent && /forecast (pas frais|absent)|hors cycle/i.test(outcome.note)) {
        await new Promise((r) => setTimeout(r, 4000))
        outcome = await maybeAutoSendRepjour(admin, dryRun, instant)
      }
      console.log(
        `[AUTO-SEND repjour] ${outcome.sent ? 'ENVOYÉ' : 'non envoyé'} — ${outcome.note}`,
      )
    } catch (err) {
      console.error(
        '[AUTO-SEND repjour] exception inattendue :',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  // NB : l'In-House est bien IMPORTÉ (données de la page PDJ) mais n'est PLUS envoyé
  // par e-mail — l'envoi PDJ a été retiré (livraison impossible côté tenant okko).

  // 5. Compte rendu. Un échec bloquant → 422 pour que le Worker REJETTE (l'envoi
  //    reste visible côté PMS), plutôt qu'un faux « OK » silencieux.
  return json({ ok: !hadError, dryRun, results }, hadError ? 422 : 200)
})
