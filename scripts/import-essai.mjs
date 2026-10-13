#!/usr/bin/env node
// Essai LOCAL de l'import nocturne (plan environnement-dev-docker-2026-10-12,
// étape 8, point 5) : poste les quatre e-mails FICTIFS de
// `supabase/tests/fixtures/*.eml` à l'Edge Function `import-report` de la stack
// locale, exactement comme le Worker Cloudflare (`cloudflare/
// stayntouch_in_to_supabase.js`) : `Content-Type: message/rfc822` +
// `X-Import-Secret`, corps = l'e-mail brut. Puis la VEILLE planifiée
// (`X-Import-Check: 1`, sans corps).
//
// Usage :
//   node scripts/import-essai.mjs [--nuit=AAAA-MM-JJ] [--url=…] [--sans-veille]
//
//   --nuit   nuit de GÉNÉRATION simulée (les rapports portent sur la VEILLE).
//            Défaut : demain (heure de Paris), donc le rapport d'AUJOURD'HUI —
//            la suite naturelle d'un seed généré aujourd'hui (seed.sql couvre
//            les rapports jusqu'à hier). Les fixtures sont écrites pour la nuit
//            du 2026-10-14 ; une autre nuit DÉCALE toutes les dates (contenu,
//            noms de fichiers, en-têtes), les CHIFFRES restent identiques (le
//            cumul du mois peut alors sembler incohérent, sans rien bloquer).
//   --url    point d'entrée ; REFUSÉ s'il ne vise pas 127.0.0.1 / localhost.
//
// Secret : variable IMPORT_SECRET, sinon `supabase/functions/.env` (copie de
// `.env.example`), lu par les fonctions servies en local.
//
// Effets (base LOCALE seulement) : upsert de forecast_days, daily_reports,
// pms_daily_metrics, pdj_breakfasts, pdj_addon_production ; purge RGPD des
// noms PDJ antérieurs à la veille ; et, si le rapport du jour n'est pas encore
// parti, envoi automatique — dans Mailpit (http://127.0.0.1:54324), jamais
// ailleurs (voir supabase/functions/_shared/environnement.ts).

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(RACINE, 'supabase', 'tests', 'fixtures')
const URL_DEFAUT = 'http://127.0.0.1:54321/functions/v1/import-report'

/** Nuit pour laquelle les fixtures sont écrites. */
const NUIT_FIXTURES = '2026-10-14'

/** Ordre le plus fréquent en production : le Forecast arrive en premier. */
const ENVOIS = [
  'forecast.eml',
  'comparison.eml',
  'in-house.eml',
  'addon-production.eml',
]

const HOTES_LOCAUX = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

// --- Arguments -------------------------------------------------------------

function option(nom) {
  const arg = process.argv.slice(2).find((a) => a.startsWith(`--${nom}=`))
  return arg ? arg.slice(nom.length + 3) : undefined
}
const drapeau = (nom) => process.argv.slice(2).includes(`--${nom}`)

function echouer(message) {
  console.error(`import-essai : ${message}`)
  process.exit(2)
}

// --- Garde : jamais autre chose que la stack locale -------------------------

/** URL d'import validée : http(s) vers 127.0.0.1 / localhost, rien d'autre. */
export function urlLocale(brute) {
  let url
  try {
    url = new URL(brute)
  } catch {
    echouer(`URL illisible : ${brute}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    echouer(`protocole refusé : ${url.protocol}`)
  if (!HOTES_LOCAUX.has(url.hostname.toLowerCase()))
    echouer(
      `URL refusée (${url.hostname}) : ce script ne vise QUE la stack locale (127.0.0.1 / localhost).`,
    )
  return url.toString()
}

// --- Dates -----------------------------------------------------------------

function dateParisAujourdhui() {
  // en-CA rend AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const versUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const JOUR_MS = 86_400_000

function decaler(y, m, d, jours) {
  const t = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + jours))
  return {
    y: String(t.getUTCFullYear()),
    m: String(t.getUTCMonth() + 1).padStart(2, '0'),
    d: String(t.getUTCDate()).padStart(2, '0'),
    t,
  }
}

const JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Décale TOUTES les dates d'un e-mail fixture de `jours` jours. Un seul
 * passage (une seule expression) : une date déjà décalée n'est jamais
 * re-décalée par un autre motif. */
export function decalerDates(eml, jours) {
  if (jours === 0) return eml
  const motif =
    /\b(\d{2})-(\d{2})-(20\d{2})\b|\b(20\d{2})-(\d{2})-(\d{2})\b|(20\d{2})(\d{2})(\d{2})(?=\d{6})|^Date: \w{3}, (\d{1,2}) (\w{3}) (20\d{2}) (.*)$/gm
  return eml.replace(motif, (tout, jj, mm, aaaa, a2, m2, j2, a3, m3, j3, j4, m4, a4, reste) => {
    if (jj) {
      const r = decaler(aaaa, mm, jj, jours)
      return `${r.d}-${r.m}-${r.y}`
    }
    if (a2) {
      const r = decaler(a2, m2, j2, jours)
      return `${r.y}-${r.m}-${r.d}`
    }
    if (a3) {
      const r = decaler(a3, m3, j3, jours)
      return `${r.y}${r.m}${r.d}`
    }
    const r = decaler(a4, MOIS.indexOf(m4) + 1, j4, jours)
    return `Date: ${JOURS[r.t.getUTCDay()]}, ${Number(r.d)} ${MOIS[r.t.getUTCMonth()]} ${r.y} ${reste}`
  })
}

// --- Secret ----------------------------------------------------------------

function lireSecret() {
  if (process.env.IMPORT_SECRET) return process.env.IMPORT_SECRET
  const fichier = join(RACINE, 'supabase', 'functions', '.env')
  if (!existsSync(fichier))
    echouer(
      'IMPORT_SECRET introuvable : copier supabase/functions/.env.example en supabase/functions/.env.',
    )
  for (const ligne of readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    const m = /^\s*IMPORT_SECRET\s*=\s*(.*?)\s*$/.exec(ligne)
    if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2')
  }
  echouer('IMPORT_SECRET absent de supabase/functions/.env.')
}

// --- Envoi -----------------------------------------------------------------

async function poster(url, secret, fichier, jours) {
  const eml = decalerDates(readFileSync(join(FIXTURES, fichier), 'utf8'), jours)
  const sujet = /^Subject: (.*)$/m.exec(eml)?.[1] ?? ''
  const de = /^From: .*<([^>]+)>/m.exec(eml)?.[1] ?? ''
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      // Mêmes en-têtes que le Worker Cloudflare.
      'Content-Type': 'message/rfc822',
      'X-Import-Secret': secret,
      'X-Mail-From': de,
      'X-Mail-Subject': sujet,
    },
    body: eml,
    signal: AbortSignal.timeout(60_000),
  })
  const texte = await res.text()
  let corps
  try {
    corps = JSON.parse(texte)
  } catch {
    corps = texte
  }
  console.log(`\n${res.ok ? 'OK ' : 'ERR'} ${res.status}  ${fichier}`)
  for (const r of corps?.results ?? [])
    console.log(
      `     ${r.ok ? '✓' : '✗'} ${r.type ?? '?'}  ${r.filename}  ${r.imported ?? 0} ligne(s)${r.note ? `  — ${r.note}` : ''}`,
    )
  if (!corps?.results) console.log(`     ${typeof corps === 'string' ? corps : JSON.stringify(corps)}`)
  return res.ok
}

async function veille(url, secret) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Import-Secret': secret, 'X-Import-Check': '1' },
    signal: AbortSignal.timeout(60_000),
  })
  console.log(`\n${res.ok ? 'OK ' : 'ERR'} ${res.status}  veille planifiée (X-Import-Check: 1)  ${await res.text()}`)
  return res.ok
}

async function principal() {
  const url = urlLocale(option('url') ?? URL_DEFAUT)
  const nuit = option('nuit') ?? decaler(...dateParisAujourdhui().split('-'), 1).t.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuit)) echouer(`--nuit invalide : ${nuit}`)
  const jours = Math.round((versUtc(nuit) - versUtc(NUIT_FIXTURES)) / JOUR_MS)
  const secret = lireSecret()

  console.log(`Import d'essai → ${url}`)
  console.log(
    `Nuit simulée ${nuit} (rapport du ${decaler(...nuit.split('-'), -1).t.toISOString().slice(0, 10)})${jours ? `, dates des fixtures décalées de ${jours} jour(s)` : ''}`,
  )

  let ok = true
  for (const fichier of ENVOIS) ok = (await poster(url, secret, fichier, jours)) && ok

  if (!drapeau('sans-veille')) {
    // Laisse l'attente patiente lancée par le Comparison/Forecast prendre la
    // réservation la première ; la veille ne fait alors que constater.
    await new Promise((r) => setTimeout(r, 3000))
    ok = (await veille(url, secret)) && ok
  }

  console.log(
    '\nÀ vérifier : Mailpit http://127.0.0.1:54324 (rapport auto), journaux `docker logs supabase_edge_runtime_back-office`.',
  )
  process.exit(ok ? 0 : 1)
}

const memeFichier = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
if (process.argv[1] && memeFichier(fileURLToPath(import.meta.url), process.argv[1])) {
  principal().catch((err) => {
    console.error('import-essai :', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
