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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// --- Détection du type de rapport (EXTENSIBLE : ajouter une entrée ici) -------
type ReportType = 'comparison' | 'forecast' | 'inhouse'

/** Devine le type d'un CSV par son nom de fichier puis, en repli, par sa signature
 * de contenu (mêmes critères que les imports manuels RepJour/PDJ). */
function detectType(filename: string, content: string): ReportType | null {
  const f = filename.toLowerCase()
  const firstLine = (content.split(/\r?\n/, 1)[0] || '').toUpperCase()

  // 1) Par nom de fichier (le plus fiable).
  if (f.includes('comparison_by_date') || f.includes('comparison by date'))
    return 'comparison'
  if (f.includes('forecast_by_date_range') || f.includes('forecast by date range'))
    return 'forecast'
  if (
    f.includes('in-house') ||
    f.includes('in_house') ||
    f.includes('inhouse') ||
    f.includes('in house')
  )
    return 'inhouse'

  // 2) Repli par contenu.
  if (content.includes('Occupied Rooms')) return 'comparison'
  if (firstLine.includes('FORECAST')) return 'forecast'
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
  if (req.headers.get('X-Import-Secret') !== secret)
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
          ? await importComparison(admin, content, filename)
          : type === 'forecast'
            ? await importForecast(admin, content, filename)
            : await importInhouse(admin, content, filename)
      results.push({ filename, type, ok: true, imported })
    } catch (err) {
      hadError = true
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Import ${type} (${filename}) échoué :`, message)
      results.push({ filename, type, ok: false, note: message })
    }
  }

  // 5. Compte rendu. Un échec bloquant → 422 pour que le Worker REJETTE (l'envoi
  //    reste visible côté PMS), plutôt qu'un faux « OK » silencieux.
  return json({ ok: !hadError, results }, hadError ? 422 : 200)
})
