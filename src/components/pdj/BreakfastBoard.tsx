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
  RotateCcw,
  Star,
  Users,
} from 'lucide-react'

import { EmptyCanvas } from '#/components/shared/EmptyCanvas.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'
import { printWithTitle } from '#/lib/print.ts'
import {
  pdjStore,
  resetPdjData,
  setPdjData,
} from '#/lib/pdjStore.ts'
import {
  ALL_ROOMS,
  dateFromFilename,
  processCsv,
} from '#/lib/pdj/csv.ts'
import type { Guest } from '#/lib/pdj/csv.ts'

/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — portage de l'app "Breakfast Tracker".
 *
 * À partir d'un export CSV du PMS (métier dans #/lib/pdj/csv.ts), on génère
 * la vue du petit-déjeuner :
 *   - écran : thème sombre de l'app (cartes stats + tableaux par étage) ;
 *   - impression : document blanc A4 portrait, fidèle à l'app d'origine
 *     (grille 3×2, cases à cocher, lignes vertes PDJ, footer stats fixe).
 * ------------------------------------------------------------------------ */

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
    printWithTitle(`Breakfast_${dd}-${mm}-${d.getFullYear()}`)
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
          <EmptyCanvas
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
              'empty-canvas min-h-[340px] cursor-pointer flex-col gap-3 p-10 text-center outline-none transition-colors',
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
          </EmptyCanvas>
        </>
      ) : (
        <>
          {/* Barre titre + actions (écran uniquement) : tout sur une seule ligne,
              boutons en icône seule pour rester compact en responsive. */}
          <PageHeader
            title="Petit-déjeuner"
            meta={
              <>
                {dateLabel} · {fileName}
              </>
            }
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={reset}
                  aria-label="Charger un autre fichier"
                  title="Charger un autre fichier"
                >
                  <RotateCcw />
                  <span className="hidden lg:inline">
                    Charger un autre fichier
                  </span>
                </Button>
                <PrintButton onClick={handlePrint} responsiveLabel />
              </>
            }
          />

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
