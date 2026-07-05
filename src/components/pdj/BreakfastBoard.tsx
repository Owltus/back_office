import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Croissant,
  FileUp,
  Star,
  UtensilsCrossed,
  Users,
} from 'lucide-react'

import { EmptyCanvas } from '#/components/shared/EmptyCanvas.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Button } from '#/components/ui/button.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { cn } from '#/lib/utils.ts'
import { printWithTitle } from '#/lib/print.ts'
import { ALL_ROOMS, csvToDbRows, localDateStr } from '#/lib/pdj/csv.ts'
import {
  fetchDay,
  fetchServiceDates,
  importRows,
  purgeOldGuestNames,
  setServed,
} from '#/lib/pdj/service.ts'
import type { PdjDayRow } from '#/lib/pdj/service.ts'

/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — portage de l'app "Breakfast Tracker", désormais
 * PERSISTÉ dans Supabase (table pdj_breakfasts) et conforme RGPD.
 *
 *   - un jour de service à la fois, chargé depuis la base (useQuery), avec un
 *     sélecteur de jour (historique) ;
 *   - import CSV daté (upsert idempotent) réservé aux rôles super/admin ;
 *   - saisie de consommation « PDJ servi » par chambre (persistée) ;
 *   - purge RGPD des noms des jours écoulés au montage (rôles habilités).
 *
 * Rendu écran : thème sombre (cartes stats + tableaux par étage). Impression :
 * document A4 portrait fidèle (cases à cocher au stylo, footer stats fixe).
 * ------------------------------------------------------------------------ */

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function BreakfastBoard() {
  const { role } = useAuth()
  const canEdit = role === 'super_utilisateur' || role === 'admin'
  const queryClient = useQueryClient()

  const [selectedDate, setSelectedDate] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Jours de service disponibles (du plus récent au plus ancien).
  const { data: dates = [] } = useQuery({
    queryKey: ['pdj', 'dates'],
    queryFn: fetchServiceDates,
  })

  // Purge RGPD au montage (une seule fois, rôles habilités) : efface les noms
  // des jours écoulés, garde les stats. Idempotent, silencieux si rien à purger.
  const purgedRef = useRef(false)
  useEffect(() => {
    if (purgedRef.current || !canEdit) return
    purgedRef.current = true
    purgeOldGuestNames(localDateStr(new Date()))
      .then(() => queryClient.invalidateQueries({ queryKey: ['pdj'] }))
      .catch((err) => console.error('[pdj] purge RGPD échouée', err))
  }, [canEdit, queryClient])

  // Sélection par défaut : le jour le plus récent une fois la liste chargée.
  useEffect(() => {
    if (!selectedDate && dates.length > 0) setSelectedDate(dates[0])
  }, [dates, selectedDate])

  // Lignes du jour sélectionné.
  const { data: dayRows = [] } = useQuery({
    queryKey: ['pdj', 'day', selectedDate],
    queryFn: () => fetchDay(selectedDate),
    enabled: !!selectedDate,
  })

  const byRoom = useMemo(() => {
    const map = new Map<number, PdjDayRow>()
    for (const r of dayRows) map.set(r.room, r)
    return map
  }, [dayRows])

  const hasData = dayRows.length > 0
  const sourceFile = dayRows[0]?.source_file ?? ''

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
    let served = 0
    let staying = 0
    let departing = 0
    for (const room of ALL_ROOMS) {
      const g = byRoom.get(room)
      if (!g) continue
      rooms++
      total += g.guests
      breakfasts += g.breakfasts_included
      served += g.breakfasts_served
      if (g.status.includes('DUE OUT')) departing++
      else if (g.status.includes('IN HOUSE')) staying++
    }
    return {
      rooms,
      guests: total,
      breakfasts,
      served,
      potential: Math.max(0, total - breakfasts),
      staying,
      departing,
    }
  }, [byRoom])

  const displayDate = selectedDate
    ? new Date(selectedDate + 'T00:00:00')
    : new Date()
  const dateLabel = fmtDate.format(displayDate)

  // Navigation entre les jours RÉELLEMENT importés (dates triées du + récent au
  // + ancien) : jamais de jour vide, et le contrôle ne grandit pas dans le temps.
  const dateIdx = dates.indexOf(selectedDate)
  const gotoOlder = () => {
    if (dateIdx >= 0 && dateIdx < dates.length - 1)
      setSelectedDate(dates[dateIdx + 1])
  }
  const gotoNewer = () => {
    if (dateIdx > 0) setSelectedDate(dates[dateIdx - 1])
  }
  // Sélecteur de date : cale sur le jour importé le plus proche (les jours sans
  // rapport n'existent pas en base).
  function selectNearestDate(target: string) {
    if (!target || dates.length === 0) return
    if (dates.includes(target)) {
      setSelectedDate(target)
      return
    }
    const t = new Date(target + 'T00:00:00').getTime()
    let best = dates[0]
    let bestDiff = Infinity
    for (const d of dates) {
      const diff = Math.abs(new Date(d + 'T00:00:00').getTime() - t)
      if (diff < bestDiff) {
        bestDiff = diff
        best = d
      }
    }
    setSelectedDate(best)
  }

  async function loadFile(file: File) {
    if (!canEdit) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(
        "Le fichier sélectionné n'est pas un CSV valide. Veuillez réessayer.",
      )
      return
    }
    try {
      const content = await file.text()
      const rows = csvToDbRows(content, file.name)
      await importRows(rows)
      await queryClient.invalidateQueries({ queryKey: ['pdj'] })
      if (rows[0]) setSelectedDate(rows[0].service_date)
      setError('')
    } catch (err) {
      setError(
        `Erreur lors du traitement du fichier : ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
    e.target.value = ''
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files.item(0)
    if (file) void loadFile(file)
  }

  // Saisie « PDJ servi » d'une chambre : mise à jour optimiste du cache puis
  // persistance ; en cas d'échec (ex. RLS), on resynchronise.
  function handleServe(room: number, n: number) {
    if (!canEdit || !selectedDate) return
    queryClient.setQueryData<PdjDayRow[]>(['pdj', 'day', selectedDate], (old) =>
      old?.map((r) =>
        r.room === room ? { ...r, breakfasts_served: n, served: n > 0 } : r,
      ),
    )
    setServed(selectedDate, room, n).catch((err) => {
      console.error('[pdj] enregistrement de la consommation échoué', err)
      void queryClient.invalidateQueries({
        queryKey: ['pdj', 'day', selectedDate],
      })
    })
  }

  function handlePrint() {
    const d = displayDate
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    printWithTitle(`Breakfast_${dd}-${mm}-${d.getFullYear()}`)
  }

  const showEmptyState = dates.length === 0 && !hasData

  return (
    <div className="pdj-doc flex w-full min-w-0 flex-1 flex-col gap-5">
      {/* En-tête compact (impression uniquement). */}
      <div className="pdj-header">
        <h1>Breakfast</h1>
        <span className="pdj-date">{dateLabel}</span>
      </div>

      {/* Input fichier caché, déclenché par la zone vide ou le bouton Importer. */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={onInputChange}
      />

      {showEmptyState ? (
        <>
          {error && <div className="pdj-error print:hidden">{error}</div>}
          {canEdit ? (
            <EmptyCanvas
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  inputRef.current?.click()
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
            </EmptyCanvas>
          ) : (
            <EmptyCanvas className="empty-canvas min-h-[340px] flex-col gap-3 text-center text-muted-foreground">
              <Coffee className="size-10 opacity-40" />
              <p className="text-sm font-medium">
                Aucune donnée de petit-déjeuner disponible.
              </p>
              <p className="text-xs">
                Un responsable doit importer le rapport du jour.
              </p>
            </EmptyCanvas>
          )}
        </>
      ) : (
        <>
          {error && <div className="pdj-error print:hidden">{error}</div>}

          <PageHeader
            title="Petit-déjeuner"
            meta={
              <>
                {dateLabel}
                {sourceFile ? ` · ${sourceFile}` : ''}
              </>
            }
            actions={
              <>
                {dates.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={gotoOlder}
                      disabled={dateIdx < 0 || dateIdx >= dates.length - 1}
                      aria-label="Jour précédent"
                    >
                      <ChevronLeft />
                    </Button>
                    <DatePickerButton
                      value={selectedDate}
                      onChange={selectNearestDate}
                      ariaLabel="Choisir un jour"
                    />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={gotoNewer}
                      disabled={dateIdx <= 0}
                      aria-label="Jour suivant"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                )}
                {canEdit && (
                  <Button
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                    aria-label="Importer un CSV"
                    title="Importer un CSV"
                  >
                    <FileUp />
                    <span className="hidden lg:inline">Importer</span>
                  </Button>
                )}
                <PrintButton onClick={handlePrint} responsiveLabel />
              </>
            }
          />

          {/* Statistiques (footer fixe en impression). */}
          <div className="pdj-stats">
            <div className="pdj-stats-grid">
              <Stat
                value={stats.rooms}
                label="Chambres occupées"
                icon={BedDouble}
                accent="#818cf8"
              />
              <Stat
                value={stats.guests}
                label="Clients"
                icon={Users}
                accent="#38bdf8"
              />
              <Stat
                value={stats.breakfasts}
                label="PDJ inclus"
                icon={Coffee}
                accent="#34d399"
              />
              <Stat
                value={stats.served}
                label="PDJ servis"
                icon={UtensilsCrossed}
                accent="#22d3ee"
                printHidden
              />
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
              {/* « Départ » : dans le PDF uniquement (masquée à l'écran pour
                  garder une rangée de KPI équilibrée). */}
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
                printOnly
              />
            </div>
            {/* Cases « € » à remplir à la main — impression uniquement. */}
            <div className="pdj-stats-grid pdj-stats-revenue">
              {['PDJ Inclus €', 'PDJ Extra €', 'Total €'].map((label) => (
                <div key={label} className="pdj-revenue">
                  <div className="pdj-revenue-value"> </div>
                  <div className="pdj-revenue-label">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tableaux par étage. */}
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
                      <GuestRow
                        key={room}
                        room={room}
                        row={byRoom.get(room)}
                        canEdit={canEdit}
                        onServe={handleServe}
                      />
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
  printOnly,
}: {
  value: number
  label: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  accent: string
  printHidden?: boolean
  printOnly?: boolean
}) {
  return (
    <div
      className={cn(
        'pdj-stat',
        printHidden && 'pdj-stat-extra',
        printOnly && 'pdj-stat-print-only',
      )}
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

function GuestRow({
  room,
  row,
  canEdit,
  onServe,
}: {
  room: number
  row?: PdjDayRow
  canEdit: boolean
  onServe: (room: number, n: number) => void
}) {
  const numGuests = row?.guests ?? 0
  const served = row?.breakfasts_served ?? 0
  // Minimum 2 cases pour une grille visuellement régulière (impression papier).
  const numBoxes = Math.max(2, numGuests)
  const departing = row?.status.includes('DUE OUT')
  const staying = row?.status.includes('IN HOUSE')

  return (
    <tr
      className={cn(
        row && row.breakfasts_included > 0 && 'pdj-included',
        !row && 'pdj-empty',
      )}
    >
      <td className="pdj-room">{room}</td>
      <td className={cn('pdj-name', row?.vip && 'pdj-vip')}>
        {row?.vip && (
          <Star className="pdj-name-star size-3" fill="currentColor" />
        )}
        {row ? (row.guest_name ?? '—') : ''}
      </td>
      <td className="pdj-c">
        {departing ? (
          <ArrowUp className="pdj-status-icon" style={{ color: '#EF5350' }} />
        ) : staying ? (
          <ArrowDown className="pdj-status-icon" style={{ color: '#2196F3' }} />
        ) : null}
      </td>
      <td className="pdj-c pdj-stay-count">
        {row && row.stay_count > 1 ? row.stay_count : ' '}
      </td>
      <td className="pdj-c">
        {/* Impression : cases à cocher. Celles marquées « servi » à l'écran
            (i < served) sont pré-remplies (miroir du DOM) ; le reste est à
            cocher au stylo. */}
        <span className="pdj-checkboxes">
          {Array.from({ length: numBoxes }, (_, i) => (
            <span
              key={i}
              className={cn(
                'pdj-checkbox',
                i < numGuests && 'pdj-expected',
                i < served && 'pdj-checked',
              )}
            />
          ))}
        </span>
        {/* Écran : contrôle interactif « servi / attendu » (persisté). */}
        {numGuests > 0 && (
          <span className="inline-flex items-center gap-1 print:hidden">
            {Array.from({ length: numGuests }, (_, i) => (
              <button
                key={i}
                type="button"
                disabled={!canEdit}
                onClick={() => onServe(room, served === i + 1 ? i : i + 1)}
                aria-label={`Servi ${i + 1} sur ${numGuests}`}
                title={`${served} / ${numGuests} servis`}
                className={cn(
                  'size-3.5 rounded-[3px] border transition-colors',
                  i < served
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-muted-foreground/40 bg-transparent',
                  canEdit
                    ? 'cursor-pointer hover:border-emerald-400'
                    : 'cursor-default',
                )}
              />
            ))}
          </span>
        )}
      </td>
    </tr>
  )
}
