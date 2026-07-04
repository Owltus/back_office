import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useStore } from '@tanstack/react-store'
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Coffee,
  Croissant,
  FileUp,
  Printer,
  RotateCcw,
  Star,
  Users,
} from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'
import {
  pdjStore,
  resetPdjData,
  setPdjData,
} from '#/lib/pdjStore.ts'
import type { Guest, GuestMap } from '#/lib/pdjStore.ts'

/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — portage de l'app "Breakfast Tracker".
 *
 * À partir d'un export CSV du PMS, on génère la vue du petit-déjeuner :
 *   - écran : thème sombre de l'app (cartes stats + tableaux par étage) ;
 *   - impression : document blanc A4 portrait, fidèle à l'app d'origine
 *     (grille 3×2, cases à cocher, lignes vertes PDJ, footer stats fixe).
 *
 * Règles métier reprises telles quelles :
 *   - on ne garde que les clients « IN HOUSE » / « DUE OUT » (présents au PDJ) ;
 *   - PDJ inclus ⟺ la colonne `Addons` contient « PDJ » (insensible à la casse) ;
 *   - nb de PDJ inclus = 1 si tarif « BB1PAX », sinon adultes + enfants.
 * ------------------------------------------------------------------------ */

const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i)

// 80 chambres réparties sur 6 étages (les chambres vides restent affichées).
const ALL_ROOMS = [
  ...range(102, 114),
  ...range(201, 214),
  ...range(301, 314),
  ...range(401, 414),
  ...range(501, 514),
  ...range(621, 631),
]

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

// Découpe une ligne CSV en gérant les guillemets et guillemets échappés ("").
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

// Date extraite du nom de fichier « In-House Guests _YYYYMMDD…csv » (sinon null).
function dateFromFilename(filename: string): Date | null {
  const match = filename.match(/_(\d{8})/)
  if (!match) return null
  const s = match[1]
  return new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
  )
}

function processCsv(content: string): GuestMap {
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

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function BreakfastBoard() {
  // Données persistées dans un store module-level : elles survivent à la
  // navigation (le composant peut se démonter sans perdre le CSV chargé).
  const guests = useStore(pdjStore, (s) => s.guests)
  const fileName = useStore(pdjStore, (s) => s.fileName)
  const dateMs = useStore(pdjStore, (s) => s.dateMs)
  const displayDate = dateMs != null ? new Date(dateMs) : new Date()
  // État transitoire, propre à cette instance (non persisté).
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const floors = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const room of ALL_ROOMS) {
      const floor = Math.floor(room / 100)
      const list = map.get(floor)
      if (list) list.push(room)
      else map.set(floor, [room])
    }
    return [...map.entries()].map(([floor, rooms]) => ({ floor, rooms }))
  }, [])

  const stats = useMemo(() => {
    let rooms = 0
    let total = 0
    let breakfasts = 0
    let staying = 0
    let departing = 0
    if (guests) {
      for (const room of ALL_ROOMS) {
        const g = guests[room]
        if (!g) continue
        rooms++
        total += g.guests
        breakfasts += g.breakfastsIncluded
        if (g.status.includes('DUE OUT')) departing++
        else if (g.status.includes('IN HOUSE')) staying++
      }
    }
    return {
      rooms,
      guests: total,
      breakfasts,
      // Clients présents sans PDJ inclus = potentiel de vente de PDJ.
      potential: Math.max(0, total - breakfasts),
      staying,
      departing,
    }
  }, [guests])

  function loadFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError("Le fichier sélectionné n'est pas un CSV valide. Veuillez réessayer.")
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = String(e.target?.result ?? '')
        const parsed = processCsv(content)
        const date = dateFromFilename(file.name)
        setPdjData(parsed, file.name, date ? date.getTime() : Date.now())
        setError('')
      } catch (err) {
        setError(
          `Erreur lors du traitement du fichier : ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
    reader.readAsText(file)
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
    e.target.value = ''
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }

  function reset() {
    resetPdjData()
    setError('')
  }

  // Nomme le PDF « Breakfast_JJ-MM-AAAA » (comme l'app d'origine), le temps de
  // l'impression, puis restaure le titre de l'onglet.
  function handlePrint() {
    const d = displayDate
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const previousTitle = document.title
    document.title = `Breakfast_${dd}-${mm}-${d.getFullYear()}`
    window.print()
    setTimeout(() => {
      document.title = previousTitle
    }, 100)
  }

  const dateLabel = fmtDate.format(displayDate)

  return (
    <div className="pdj-doc flex w-full min-w-0 flex-1 flex-col gap-5">
      {/* En-tête compact (impression uniquement) — titre identique aux
          documents déjà imprimés par l'app d'origine */}
      <div className="pdj-header">
        <h1>Breakfast</h1>
        <span className="pdj-date">{dateLabel}</span>
      </div>

      {!guests ? (
        <>
          {error && <div className="pdj-error print:hidden">{error}</div>}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'empty-canvas flex min-h-[340px] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-10 text-center outline-none transition-colors',
              'hover:border-primary/60 hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring',
              dragging && 'border-primary bg-secondary/40',
            )}
          >
            <div className="rounded-full bg-secondary p-4">
              <FileUp className="size-8 text-muted-foreground" />
            </div>
            <div className="text-base font-medium">
              Glissez votre fichier CSV ici
            </div>
            <div className="text-sm text-muted-foreground">
              ou cliquez pour sélectionner un fichier (.csv)
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={onInputChange}
            />
          </div>
        </>
      ) : (
        <>
          {/* Barre titre + actions (écran uniquement) : tout sur une seule ligne,
              boutons en icône seule pour rester compact en responsive. */}
          <div className="flex items-center gap-3 print:hidden">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold">Petit-déjeuner</h1>
              <p className="truncate text-sm text-muted-foreground">
                {dateLabel} · {fileName}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                onClick={reset}
                aria-label="Charger un autre fichier"
                title="Charger un autre fichier"
              >
                <RotateCcw />
                <span className="hidden lg:inline">Charger un autre fichier</span>
              </Button>
              <Button
                onClick={handlePrint}
                aria-label="Imprimer / PDF"
                title="Imprimer / PDF"
              >
                <Printer />
                <span className="hidden lg:inline">Imprimer / PDF</span>
              </Button>
            </div>
          </div>

          {/* Statistiques (footer fixe en impression) */}
          <div className="pdj-stats">
            <div className="pdj-stats-grid">
              <Stat value={stats.rooms} label="Chambres occupées" icon={BedDouble} accent="#818cf8" />
              <Stat value={stats.guests} label="Clients" icon={Users} accent="#38bdf8" />
              <Stat value={stats.breakfasts} label="PDJ inclus" icon={Coffee} accent="#34d399" />
              <Stat
                value={stats.potential}
                label="PDJ non inclus"
                icon={Croissant}
                accent="#fbbf24"
                printHidden
              />
              <Stat
                value={stats.staying}
                label={
                  <>
                    Recouche
                    <ArrowDown className="pdj-label-arrow" />
                  </>
                }
                icon={ArrowDown}
                accent="#60a5fa"
              />
              <Stat
                value={stats.departing}
                label={
                  <>
                    Départ
                    <ArrowUp className="pdj-label-arrow" />
                  </>
                }
                icon={ArrowUp}
                accent="#fb7185"
              />
            </div>
            {/* Cases « € » à remplir à la main — impression uniquement */}
            <div className="pdj-stats-grid pdj-stats-revenue">
              {['PDJ Inclus €', 'PDJ Extra €', 'Total €'].map((label) => (
                <div key={label} className="pdj-revenue">
                  <div className="pdj-revenue-value">{' '}</div>
                  <div className="pdj-revenue-label">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tableaux par étage */}
          <div className="pdj-floors">
            {floors.map(({ floor, rooms }) => (
              <div key={floor} className="pdj-floor">
                <table>
                  <thead>
                    <tr>
                      <th>Chambre</th>
                      <th>Nom</th>
                      <th className="pdj-c">Statut</th>
                      <th className="pdj-c">Visites</th>
                      <th className="pdj-c">Clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => (
                      <GuestRow key={room} room={room} guest={guests[room]} />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({
  value,
  label,
  icon: Icon,
  accent,
  printHidden,
}: {
  value: number
  label: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  accent: string
  printHidden?: boolean
}) {
  return (
    <div
      className={cn('pdj-stat', printHidden && 'pdj-stat-extra')}
      style={{ '--pdj-accent': accent } as React.CSSProperties}
    >
      <span className="pdj-stat-icon">
        <Icon className="size-5" />
      </span>
      <span className="pdj-stat-body">
        <span className="pdj-stat-value">{value}</span>
        <span className="pdj-stat-label">{label}</span>
      </span>
    </div>
  )
}

function GuestRow({ room, guest }: { room: number; guest?: Guest }) {
  const numGuests = guest?.guests ?? 0
  // Minimum 2 cases pour une grille visuellement régulière entre les lignes.
  const numBoxes = Math.max(2, numGuests)
  const departing = guest?.status.includes('DUE OUT')
  const staying = guest?.status.includes('IN HOUSE')

  return (
    <tr
      className={cn(
        guest && guest.breakfastsIncluded > 0 && 'pdj-included',
        !guest && 'pdj-empty',
      )}
    >
      <td className="pdj-room">{room}</td>
      <td className={cn('pdj-name', guest?.vip && 'pdj-vip')}>
        {guest?.vip && (
          <Star className="pdj-name-star size-3" fill="currentColor" />
        )}
        {guest?.guestName ?? ''}
      </td>
      <td className="pdj-c">
        {departing ? (
          <ArrowUp className="pdj-status-icon" style={{ color: '#EF5350' }} />
        ) : staying ? (
          <ArrowDown className="pdj-status-icon" style={{ color: '#2196F3' }} />
        ) : null}
      </td>
      <td className="pdj-c pdj-stay-count">
        {guest && guest.stayCount > 1 ? guest.stayCount : ' '}
      </td>
      <td className="pdj-c">
        <span className="pdj-checkboxes">
          {Array.from({ length: numBoxes }, (_, i) => (
            <span
              key={i}
              className={cn('pdj-checkbox', i < numGuests && 'pdj-expected')}
            />
          ))}
        </span>
        <span className="pdj-count">{numGuests > 0 ? numGuests : ''}</span>
      </td>
    </tr>
  )
}
