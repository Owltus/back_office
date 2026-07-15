/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — métier CSV du portage de l'app "Breakfast Tracker".
 *
 * À partir d'un export CSV du PMS, on construit la liste des clients présents
 * au petit-déjeuner (fonctions pures, sans React ni rendu).
 *
 * Règles métier reprises telles quelles :
 *   - pour un fichier « du jour », on garde les clients « IN HOUSE » / « DUE OUT »
 *     (présents au PDJ) ET les « CHECKED OUT » partis le jour même du service —
 *     départs anticipés du matin quand le rapport est tiré tard (cf.
 *     parseGuestRows) ; pour un fichier archive (aucun statut actif), on garde
 *     toute ligne ayant un statut ;
 *   - PDJ inclus ⟺ la colonne `Addons` contient « PDJ » (insensible à la casse) ;
 *   - nb de PDJ inclus = 1 si tarif « BB1PAX », sinon adultes + enfants.
 *
 * Le parsing (`parseGuestRows`) alimente `csvToDbRows` → lignes DB datées
 * (persistance Supabase, RGPD).
 * ------------------------------------------------------------------------ */

// 80 chambres réparties sur 6 étages (les chambres vides restent affichées).
// Inventaire remonté dans un module partagé (réutilisé par le Rapprochement).
export { ALL_ROOMS } from '#/lib/hotel/rooms.ts'

export const REQUIRED_COLUMNS = [
  'Room',
  'Status',
  'Guest Name',
  'VIP',
  'Adults',
  'Children',
  'Addons',
  'Rate',
] as const

// Découpe une ligne CSV en gérant les guillemets et guillemets échappés ("").
export function parseCsvLine(line: string, separator: string): string[] {
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

// Date extraite du nom de fichier « In-House Guests _YYYYMMDD…csv » (sinon null).
export function dateFromFilename(filename: string): Date | null {
  const match = filename.match(/_(\d{8})/)
  if (!match) return null
  const s = match[1]
  return new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
  )
}

// 'YYYY-MM-DD' à partir des composantes LOCALES d'une Date (Europe/Paris côté
// réception) — sert de clé `service_date` et de comparaison RGPD.
export function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// '24-04-2026 02:54 PM' → '2026-04-24' (date seule, heure écartée). null sinon.
export function csvDateToIso(value: string): string | null {
  const m = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Ligne intermédiaire : tous les champs utiles extraits d'une ligne CSV. */
export interface ParsedRow {
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

/**
 * Parsing partagé : renvoie les lignes clients retenues, tous champs extraits.
 *
 * `serviceDate` ('YYYY-MM-DD', jour du rapport) affine le filtre du fichier « du
 * jour » : un client parti tôt le matin apparaît déjà « CHECKED OUT » sur un
 * rapport tiré tard (au lieu de « DUE OUT » sur le rapport de 2 h). Comme il a
 * dormi la nuit passée, il compte au petit-déjeuner : on le garde si son départ
 * réel tombe le jour du service. Sans `serviceDate`, comportement historique
 * (seuls IN HOUSE / DUE OUT).
 *
 * Ne lit QUE des colonnes situées avant `Res. Notes` (col 26) : les notes
 * libres contiennent des retours à la ligne dans un champ quoté qui casseraient
 * un découpage naïf. On ne mappe donc jamais `Guest Notes`/`Party` (après col 26)
 * ni les colonnes ultra-sensibles (notes, plaque, accompagnants, identifiants).
 */
export function parseGuestRows(
  content: string,
  serviceDate?: string | null,
): ParsedRow[] {
  // Robustesse aux exports PMS/Windows : on retire un éventuel BOM en tête (sinon
  // il se colle au premier en-tête « Room » et fait échouer la détection des
  // colonnes → 0 ligne, faux problème « fichier invalide »).
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const separator = clean.split('\n')[0].includes(';') ? ';' : ','
  const lines = clean.split('\n').filter((l) => l.trim())
  // En-têtes normalisés : `trim()` retire les espaces, le `\r` de fin de ligne
  // (CRLF) et un BOM résiduel — pour que `indexOf('Room')` etc. matchent.
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
    throw new Error(
      `Le fichier CSV ne contient pas toutes les colonnes requises : ${missing.join(', ')}.`,
    )
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
      // Départ anticipé du matin : le client a fait son check-out avant que le
      // rapport soit tiré, donc il est déjà « CHECKED OUT » (au lieu de « DUE
      // OUT »). S'il est parti LE JOUR DU SERVICE, il a dormi la nuit passée et
      // compte au PDJ — on le garde comme un départ. Pour un CHECKED OUT, la
      // colonne Departure porte l'heure RÉELLE du check-out (fiable), là où un
      // DUE OUT porte l'horaire théorique (02:00 PM).
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

/** Ligne DB écrite à l'import (snake_case). Sans consommation ni id/timestamps. */
export interface DbPdjRow {
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

/**
 * Transforme un CSV en lignes DB datées d'après le nom de fichier.
 *
 * RGPD (D2) : le nom du client n'est stocké que pour AUJOURD'HUI et LA VEILLE
 * (J-1, Europe/Paris) — fenêtre nécessaire au rapprochement parking↔PDJ ; tout
 * import d'une date plus ancienne écrit `guest_name = null` mais conserve toutes
 * les stats. Les colonnes ultra-sensibles ne sont jamais mappées (minimisation
 * « by design »).
 */
export function csvToDbRows(content: string, fileName: string): DbPdjRow[] {
  const date = dateFromFilename(fileName)
  if (!date) {
    throw new Error(
      'Date non extractible du nom de fichier : un export « In-House Guests _YYYYMMDD… » est attendu.',
    )
  }
  const serviceDate = localDateStr(date)
  // Fenêtre de conservation du nom : aujourd'hui ou la veille.
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const keepName =
    serviceDate === localDateStr(now) || serviceDate === localDateStr(yesterday)

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

/** Fichier candidat à l'import (nom + contenu déjà lu). */
export interface CsvFileInput {
  name: string
  content: string
}

/** Résultat d'un import multi-fichiers, trié et dédoublonné. */
export interface MergeCsvResult {
  /** Lignes DB prêtes à l'upsert, dédoublonnées par (service_date, room). */
  rows: DbPdjRow[]
  /** Jours distincts importés, du plus récent au plus ancien. */
  dates: string[]
  /** Noms des fichiers retenus (un par jour, la version la plus récente). */
  imported: string[]
  /** Fichiers écartés (non exploitables ou doublon plus ancien) + raison. */
  ignored: { name: string; reason: string }[]
}

/**
 * Fusionne un LOT de fichiers CSV en un jeu de lignes DB propre, robuste au
 * dépôt en masse (dizaines de fichiers hétérogènes) :
 *
 *   - chaque fichier est parsé isolément ; un fichier illisible (colonnes
 *     manquantes, nom sans date, aucune ligne exploitable) est IGNORÉ, pas
 *     bloquant ;
 *   - pour un même jour de service, on ne retient qu'UN fichier — le plus
 *     récent d'après son nom (le timestamp `_YYYYMMDDHHMMSS`) — les autres sont
 *     écartés comme doublons ;
 *   - dédoublonnage final par (service_date, room) : garantit qu'aucune clé de
 *     conflit n'apparaît deux fois dans le payload (sinon l'upsert Postgres
 *     `ON CONFLICT` échoue).
 *
 * Fonction pure : la lecture des fichiers et le filtrage d'extension se font en
 * amont, côté composant.
 */
export function mergeCsvFiles(files: CsvFileInput[]): MergeCsvResult {
  const ignored: { name: string; reason: string }[] = []
  const bestByDate = new Map<string, { name: string; rows: DbPdjRow[] }>()

  for (const f of files) {
    let rows: DbPdjRow[]
    try {
      rows = csvToDbRows(f.content, f.name)
    } catch (err) {
      ignored.push({
        name: f.name,
        reason: err instanceof Error ? err.message : String(err),
      })
      continue
    }
    if (rows.length === 0) {
      ignored.push({ name: f.name, reason: 'Aucune ligne client exploitable.' })
      continue
    }
    const date = rows[0].service_date
    const current = bestByDate.get(date)
    if (!current) {
      bestByDate.set(date, { name: f.name, rows })
    } else if (f.name > current.name) {
      // Nom « plus grand » = timestamp plus tardif → il remplace l'ancien.
      ignored.push({ name: current.name, reason: `Doublon du ${date} écarté.` })
      bestByDate.set(date, { name: f.name, rows })
    } else {
      ignored.push({ name: f.name, reason: `Doublon du ${date} écarté.` })
    }
  }

  // Dédoublonnage final par (service_date, room), tous fichiers confondus.
  const byKey = new Map<string, DbPdjRow>()
  for (const { rows } of bestByDate.values()) {
    for (const r of rows) byKey.set(`${r.service_date}|${r.room}`, r)
  }

  return {
    rows: [...byKey.values()],
    dates: [...bestByDate.keys()].sort((a, b) => (a > b ? -1 : 1)),
    imported: [...bestByDate.values()].map((b) => b.name),
    ignored,
  }
}
