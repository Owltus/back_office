import { range } from '#/lib/utils.ts'

/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — métier CSV du portage de l'app "Breakfast Tracker".
 *
 * À partir d'un export CSV du PMS, on construit la liste des clients présents
 * au petit-déjeuner (fonctions pures, sans React ni rendu).
 *
 * Règles métier reprises telles quelles :
 *   - on ne garde que les clients « IN HOUSE » / « DUE OUT » (présents au PDJ) ;
 *   - PDJ inclus ⟺ la colonne `Addons` contient « PDJ » (insensible à la casse) ;
 *   - nb de PDJ inclus = 1 si tarif « BB1PAX », sinon adultes + enfants.
 * ------------------------------------------------------------------------ */

export interface Guest {
  room: number
  status: string
  guestName: string
  vip: boolean
  guests: number // adultes + enfants (bébés exclus côté PMS)
  breakfastsIncluded: number
  stayCount: number
}

export type GuestMap = Record<number, Guest>

// 80 chambres réparties sur 6 étages (les chambres vides restent affichées).
export const ALL_ROOMS = [
  ...range(102, 114),
  ...range(201, 214),
  ...range(301, 314),
  ...range(401, 414),
  ...range(501, 514),
  ...range(621, 631),
]

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

export function processCsv(content: string): GuestMap {
  const separator = content.split('\n')[0].includes(';') ? ';' : ','
  const lines = content.split('\n').filter((l) => l.trim())
  const headers = parseCsvLine(lines[0], separator)

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
      ['stayCount', 'Stay Count'], // optionnelle
    ].map(([key, header]) => [key, headers.indexOf(header)]),
  ) as Record<string, number>

  const missing = REQUIRED_COLUMNS.filter((c) => headers.indexOf(c) === -1)
  if (missing.length > 0) {
    throw new Error(
      `Le fichier CSV ne contient pas toutes les colonnes requises : ${missing.join(', ')}.`,
    )
  }

  // Deux passes : on détecte d'abord la présence de clients actifs.
  // Fichier « du jour » → on ne garde que IN HOUSE / DUE OUT.
  // Fichier archive → on garde toute ligne ayant un statut.
  const rows = lines
    .slice(1)
    .map((l) => parseCsvLine(l.trim(), separator))
    .filter((v) => {
      const room = v[col.room]?.trim()
      return room && !isNaN(Number(room)) // un n° de chambre est toujours numérique
    })

  const hasActiveGuests = rows.some((v) => {
    const status = v[col.status]?.trim()
    return status && (status.includes('IN HOUSE') || status.includes('DUE OUT'))
  })

  const guests: GuestMap = {}
  for (const v of rows) {
    const status = v[col.status]?.trim()
    if (hasActiveGuests) {
      if (!status || (!status.includes('IN HOUSE') && !status.includes('DUE OUT'))) {
        continue
      }
    } else if (!status) {
      continue
    }

    const addons = v[col.addons] ?? ''
    const rate = v[col.rate] ?? ''
    const hasPDJ = addons.toUpperCase().includes('PDJ')
    const numAdults = parseInt(v[col.adults]) || 0
    const numChildren = parseInt(v[col.children]) || 0
    const numGuests = numAdults + numChildren

    let breakfastsIncluded = 0
    if (hasPDJ) {
      // BB1PAX = 1 seul PDJ ; sinon 1 PDJ par client.
      breakfastsIncluded = rate.toUpperCase().includes('BB1PAX') ? 1 : numGuests
    }

    const room = Number(v[col.room].trim())
    guests[room] = {
      room,
      status: status ?? '',
      guestName: v[col.guestName]?.replace(/"/g, '').trim() || 'Non renseigné',
      vip: Boolean(v[col.vip]?.trim()),
      guests: numGuests,
      breakfastsIncluded,
      stayCount: col.stayCount !== -1 ? parseInt(v[col.stayCount]) || 0 : 0,
    }
  }

  return guests
}
