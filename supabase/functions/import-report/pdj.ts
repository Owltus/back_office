// Importeur PDJ (petits-déjeuners) pour l'Edge Function « import-report ».
//
// Portage AUTONOME (Deno, service_role) du métier navigateur de l'import manuel
// des rapports « In-House Guests » du PMS. La logique reproduit fidèlement
// src/lib/pdj/csv.ts (parsing + mapping DB + RGPD) et src/lib/pdj/service.ts
// (upsert idempotent par lots). L'import manuel n'est PAS touché : ce fichier est
// une copie serveur indépendante (pas d'alias #/, pas d'import React).
//
// SÉCURITÉ / RGPD : on ne mappe QUE des colonnes situées avant `Res. Notes`
// (col 26) — jamais les notes libres, plaques, accompagnants, identifiants de
// résa ni la balance. `guest_name` n'est conservé que pour aujourd'hui et la
// veille (fenêtre Europe/Paris), sinon null.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// Table cible (cf. src/lib/pdj/service.ts:13 — PDJ_TABLE).
const PDJ_TABLE = 'pdj_breakfasts'

// Colonnes minimales attendues dans l'en-tête (cf. csv.ts:24 — REQUIRED_COLUMNS).
const REQUIRED_COLUMNS = [
  'Room',
  'Status',
  'Guest Name',
  'VIP',
  'Adults',
  'Children',
  'Addons',
  'Rate',
] as const

// ---------------------------------------------------------------------------
// Utilitaires de parsing (portés tels quels depuis src/lib/pdj/csv.ts).
// ---------------------------------------------------------------------------

// Découpe une ligne CSV en gérant les guillemets et guillemets échappés ("").
// (csv.ts:46 — parseCsvLine)
function parseCsvLine(line: string, separator: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === separator && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

// Date « YYYY-MM-DD » extraite du nom de fichier « …_YYYYMMDD…csv » (sinon null).
// Contrairement à dateFromFilename (csv.ts:71) qui renvoie un objet Date, on
// renvoie directement la chaîne : la `service_date` est une date CALENDAIRE issue
// du nom (aucun fuseau à appliquer, PAS de J-1 pour la PDJ). Passer par un objet
// Date en environnement UTC risquerait un décalage — on l'évite.
function serviceDateFromFilename(filename: string): string | null {
  const match = filename.match(/_(\d{8})/)
  if (!match) return null
  const s = match[1]
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

// '24-04-2026 02:54 PM' → '2026-04-24' (date seule, heure écartée). null sinon.
// (csv.ts:92 — csvDateToIso)
function csvDateToIso(value: string): string | null {
  const m = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// 'YYYY-MM-DD' pour un instant donné, exprimé dans le fuseau Europe/Paris.
// Remplace le localDateStr navigateur (csv.ts:84), qui s'appuyait sur le fuseau
// du poste : l'Edge Function tourne en UTC, on force donc explicitement Paris
// pour la fenêtre RGPD (aujourd'hui / veille).
function parisDateStr(d: Date): string {
  // en-CA rend le format ISO « YYYY-MM-DD ».
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

/** Ligne DB écrite à l'import (snake_case). (csv.ts:274 — DbPdjRow) */
interface DbPdjRow {
  service_date: string
  room: number
  guest_name: string | null
  status: string
  vip: boolean
  adults: number
  children: number
  guests: number
  no_of_nights: number | null
  room_type: string | null
  rate_plan: string | null
  channel: string | null
  company: string | null
  guarantee: string | null
  payment_type: string | null
  addons: string | null
  adr: number | null
  arrival_date: string | null
  departure_date: string | null
  stay_count: number
  breakfasts_included: number
  source_file: string
}

/** Ligne intermédiaire (sous-ensemble utile de ParsedRow, csv.ts:99). */
interface ParsedRow {
  room: number
  status: string
  guestName: string
  vip: boolean
  adults: number
  children: number
  guests: number
  roomType: string | null
  nights: number | null
  ratePlan: string | null
  channel: string | null
  company: string | null
  guarantee: string | null
  paymentType: string | null
  addons: string | null
  adr: number | null
  arrivalDate: string | null
  departureDate: string | null
  stayCount: number
  breakfastsIncluded: number
}

// ---------------------------------------------------------------------------
// Parsing des lignes clients (porté de parseGuestRows, csv.ts:137).
// ---------------------------------------------------------------------------

function parseGuestRows(content: string, serviceDate: string): ParsedRow[] {
  // Retrait d'un BOM éventuel en tête (export PMS/Windows) : sinon il se colle au
  // premier en-tête « Room » et casse la détection des colonnes.
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const separator = clean.split('\n')[0].includes(';') ? ';' : ','
  const lines = clean.split('\n').filter((l) => l.trim())
  // En-têtes normalisés : trim() retire espaces, \r de fin de ligne (CRLF) et BOM
  // résiduel pour que indexOf('Room') etc. matchent.
  const headers = parseCsvLine(lines[0], separator).map((h) => h.trim())

  const col = Object.fromEntries(
    [
      ['room', 'Room'],
      ['status', 'Status'],
      ['guestName', 'Guest Name'],
      ['vip', 'VIP'],
      ['adults', 'Adults'],
      ['children', 'Children'],
      ['addons', 'Addons'],
      ['rate', 'Rate'],
      ['stayCount', 'Stay Count'],
      ['roomType', 'Room Type'],
      ['nights', 'No of Nights'],
      ['channel', 'TravelAgent'],
      ['company', 'Company'],
      ['guarantee', 'Guarantee'],
      ['paymentType', 'Payment Type'],
      ['adr', 'Adr'],
      ['arrival', 'Arrival'],
      ['departure', 'Departure'],
    ].map(([key, header]) => [key, headers.indexOf(header)]),
  ) as Record<string, number>

  const missing = REQUIRED_COLUMNS.filter((c) => headers.indexOf(c) === -1)
  if (missing.length > 0) {
    // Message court, sans PII.
    throw new Error(`Colonnes manquantes : ${missing.join(', ')}.`)
  }

  // Un n° de chambre est toujours numérique → écarte l'en-tête, le pied de page
  // « TOTAL ROOMS » et les lignes de continuation des notes multilignes.
  const rows = lines
    .slice(1)
    .map((l) => parseCsvLine(l.trim(), separator))
    .filter((v) => {
      const room = v[col.room]?.trim()
      return room && !isNaN(Number(room))
    })

  // Fichier « du jour » → seulement IN HOUSE / DUE OUT ; archive → tout statut.
  const hasActiveGuests = rows.some((v) => {
    const status = v[col.status]?.trim()
    return status && (status.includes('IN HOUSE') || status.includes('DUE OUT'))
  })

  const strOrNull = (v: string[], i: number): string | null => {
    if (i === -1) return null
    const s = v[i]?.replace(/"/g, '').trim()
    return s ? s : null
  }
  const numOrNull = (v: string[], i: number): number | null => {
    if (i === -1) return null
    const n = parseInt(v[i] ?? '')
    return isNaN(n) ? null : n
  }
  const floatOrNull = (v: string[], i: number): number | null => {
    if (i === -1) return null
    const n = parseFloat((v[i] ?? '').replace(',', '.'))
    return isNaN(n) ? null : n
  }

  const result: ParsedRow[] = []
  for (const v of rows) {
    const status = v[col.status]?.trim() ?? ''
    const departureDate = csvDateToIso(v[col.departure] ?? '')
    if (hasActiveGuests) {
      const present = status.includes('IN HOUSE') || status.includes('DUE OUT')
      // Départ anticipé du matin : un client parti avant l'édition du rapport est
      // déjà « CHECKED OUT ». S'il est parti LE JOUR DU SERVICE, il a dormi la
      // nuit passée et compte au PDJ — on le garde comme un départ. Sa colonne
      // Departure porte l'heure RÉELLE (fiable) du check-out.
      const leftOnServiceDay =
        !!serviceDate &&
        status.includes('CHECKED OUT') &&
        departureDate === serviceDate
      if (!present && !leftOnServiceDay) continue
    } else if (!status) {
      continue
    }

    const addons = v[col.addons] ?? ''
    const rate = v[col.rate] ?? ''
    const hasPDJ = addons.toUpperCase().includes('PDJ')
    const adults = parseInt(v[col.adults]) || 0
    const children = parseInt(v[col.children]) || 0
    const guests = adults + children
    // PDJ inclus = 1 si tarif « BB1PAX », sinon adultes + enfants (règle BB1PAX).
    const breakfastsIncluded = hasPDJ
      ? rate.toUpperCase().includes('BB1PAX')
        ? 1
        : guests
      : 0

    result.push({
      room: Number(v[col.room].trim()),
      status,
      guestName: v[col.guestName]?.replace(/"/g, '').trim() || '',
      vip: Boolean(v[col.vip]?.trim()),
      adults,
      children,
      guests,
      roomType: strOrNull(v, col.roomType),
      nights: numOrNull(v, col.nights),
      ratePlan: strOrNull(v, col.rate),
      channel: strOrNull(v, col.channel),
      company: strOrNull(v, col.company),
      guarantee: strOrNull(v, col.guarantee),
      paymentType: strOrNull(v, col.paymentType),
      addons: strOrNull(v, col.addons),
      adr: floatOrNull(v, col.adr),
      arrivalDate: csvDateToIso(v[col.arrival] ?? ''),
      departureDate,
      stayCount: col.stayCount !== -1 ? parseInt(v[col.stayCount]) || 0 : 0,
      breakfastsIncluded,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Mapping vers lignes DB + RGPD (porté de csvToDbRows, csv.ts:308).
// ---------------------------------------------------------------------------

function csvToDbRows(content: string, fileName: string): DbPdjRow[] {
  const serviceDate = serviceDateFromFilename(fileName)
  if (!serviceDate) {
    throw new Error('Date non extractible du nom de fichier.')
  }

  // Fenêtre de conservation du nom : aujourd'hui ou la veille (Europe/Paris).
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const keepName =
    serviceDate === parisDateStr(now) || serviceDate === parisDateStr(yesterday)

  return parseGuestRows(content, serviceDate).map((r) => ({
    service_date: serviceDate,
    room: r.room,
    guest_name: keepName ? r.guestName || null : null,
    status: r.status,
    vip: r.vip,
    adults: r.adults,
    children: r.children,
    guests: r.guests,
    no_of_nights: r.nights,
    room_type: r.roomType,
    rate_plan: r.ratePlan,
    channel: r.channel,
    company: r.company,
    guarantee: r.guarantee,
    payment_type: r.paymentType,
    addons: r.addons,
    adr: r.adr,
    arrival_date: r.arrivalDate,
    departure_date: r.departureDate,
    stay_count: r.stayCount,
    breakfasts_included: r.breakfastsIncluded,
    source_file: fileName,
  }))
}

// ---------------------------------------------------------------------------
// Point d'entrée de l'Edge Function.
// ---------------------------------------------------------------------------

/**
 * Importe un CSV « In-House Guests » dans `pdj_breakfasts` (upsert idempotent
 * par (service_date, room)). Renvoie le nombre de chambres upsertées.
 *
 * @param admin  client Supabase service_role (bypass RLS).
 * @param csv    contenu texte du CSV.
 * @param filename  nom du fichier (porte la date `_YYYYMMDD` + `source_file`).
 * @throws Error en cas d'erreur bloquante (colonnes manquantes, date illisible,
 *   erreur base) — message court, sans PII.
 */
export async function importInhouse(
  admin: SupabaseClient,
  csv: string,
  filename: string,
  dryRun = false,
): Promise<number> {
  const rows = csvToDbRows(csv, filename)

  // Dédoublonnage final par (service_date, room) : une clé de conflit répétée
  // dans un même lot ferait échouer l'upsert Postgres ON CONFLICT (cf.
  // mergeCsvFiles, csv.ts:416). Le dernier gagne (ordre du fichier).
  const byKey = new Map<string, DbPdjRow>()
  for (const r of rows) byKey.set(`${r.service_date}|${r.room}`, r)
  const deduped = [...byKey.values()]

  // Dry-run : parsing + dédoublonnage faits (throws ci-dessus si erreur), aucune
  // écriture. Sinon, upsert par lots (cf. importRows, service.ts:119). Le payload
  // N'INCLUT PAS breakfasts_served ni served → un réimport ne réinitialise pas la
  // saisie du staff (ON CONFLICT DO UPDATE ne touche que les colonnes fournies).
  if (!dryRun) {
    const CHUNK = 1000
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const { error } = await admin
        .from(PDJ_TABLE)
        .upsert(deduped.slice(i, i + CHUNK), { onConflict: 'service_date,room' })
      if (error)
        throw new Error(`Écriture pdj_breakfasts échouée : ${error.message}`)
    }
  }

  return deduped.length
}
