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
import { ALL_ROOMS, localDateStr, mergeCsvFiles } from '#/lib/pdj/csv.ts'
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

// Date longue et lisible pour le titre de page (façon repjour).
const fmtTitle = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function BreakfastBoard() {
  const { role } = useAuth()
  const canEdit = role === 'super_utilisateur' || role === 'admin'
  const queryClient = useQueryClient()

  // Jour courant (Europe/Paris) figé au montage : jour affiché par défaut, repère
  // RGPD, et borne « la plus récente » de la navigation.
  const today = useMemo(() => localDateStr(new Date()), [])

  // On affiche TOUJOURS le jour courant par défaut (jamais le dernier jour
  // importé, qui serait obsolète) ; l'utilisateur peut ensuite remonter le temps.
  const [selectedDate, setSelectedDate] = useState(today)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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
    purgeOldGuestNames(today)
      .then(() => queryClient.invalidateQueries({ queryKey: ['pdj'] }))
      .catch((err) => console.error('[pdj] purge RGPD échouée', err))
  }, [canEdit, queryClient, today])

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
  const longDate = fmtTitle.format(displayDate)
  const titleDate = longDate.charAt(0).toUpperCase() + longDate.slice(1)

  // Jours parcourables : les jours réellement importés PLUS le jour courant
  // (toujours présent, même sans données, pour pouvoir revenir sur « aujourd'hui »
  // et son import). Triés du plus récent au plus ancien.
  const navDates = useMemo(() => {
    const set = new Set(dates)
    set.add(today)
    return [...set].sort((a, b) => (a > b ? -1 : 1))
  }, [dates, today])

  // Navigation entre ces jours : jamais de jour vide « au milieu », et le contrôle
  // ne grandit pas dans le temps.
  const dateIdx = navDates.indexOf(selectedDate)
  const gotoOlder = () => {
    if (dateIdx >= 0 && dateIdx < navDates.length - 1)
      setSelectedDate(navDates[dateIdx + 1])
  }
  const gotoNewer = () => {
    if (dateIdx > 0) setSelectedDate(navDates[dateIdx - 1])
  }
  // Sélecteur de date : cale sur le jour parcourable le plus proche.
  function selectNearestDate(target: string) {
    if (!target || navDates.length === 0) return
    if (navDates.includes(target)) {
      setSelectedDate(target)
      return
    }
    const t = new Date(target + 'T00:00:00').getTime()
    let best = navDates[0]
    let bestDiff = Infinity
    for (const d of navDates) {
      const diff = Math.abs(new Date(d + 'T00:00:00').getTime() - t)
      if (diff < bestDiff) {
        bestDiff = diff
        best = d
      }
    }
    setSelectedDate(best)
  }

  // Import d'un LOT de fichiers (drop ou sélection multiple). On trie d'abord
  // sur l'extension, puis `mergeCsvFiles` valide/dédoublonne : les fichiers
  // illisibles ou en doublon sont ignorés sans bloquer l'import du reste.
  async function loadFiles(fileList: File[]) {
    if (!canEdit || fileList.length === 0) return
    setError('')
    setNotice('')

    const csvFiles = fileList.filter((f) =>
      f.name.toLowerCase().endsWith('.csv'),
    )
    const nonCsv = fileList.length - csvFiles.length
    if (csvFiles.length === 0) {
      setError('Aucun fichier .csv dans la sélection.')
      return
    }

    try {
      const inputs = await Promise.all(
        csvFiles.map(async (f) => ({ name: f.name, content: await f.text() })),
      )
      const result = mergeCsvFiles(inputs)

      if (result.rows.length === 0) {
        setError(
          'Aucune donnée exploitable : fichiers invalides ou mal nommés (attendu « In-House Guests _YYYYMMDD… »).',
        )
        return
      }

      await importRows(result.rows)
      await queryClient.invalidateQueries({ queryKey: ['pdj'] })

      // On se place sur le jour le plus pertinent du lot : aujourd'hui s'il en
      // fait partie, sinon le jour importé le plus récent.
      setSelectedDate(result.dates.includes(today) ? today : result.dates[0])

      if (result.ignored.length > 0)
        console.warn('[pdj] fichiers ignorés à l’import', result.ignored)

      const ignored = result.ignored.length + nonCsv
      const nbFiles = result.imported.length
      const nbDays = result.dates.length
      setNotice(
        `${nbFiles} fichier${nbFiles > 1 ? 's' : ''} importé${nbFiles > 1 ? 's' : ''} ` +
          `(${nbDays} jour${nbDays > 1 ? 's' : ''})` +
          (ignored > 0
            ? ` — ${ignored} ignoré${ignored > 1 ? 's' : ''}.`
            : '.'),
      )
    } catch (err) {
      setError(
        `Erreur lors du traitement des fichiers : ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    void loadFiles(e.target.files ? Array.from(e.target.files) : [])
    e.target.value = ''
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    void loadFiles(Array.from(e.dataTransfer.files))
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

  // L'en-tête (titre du jour + navigation + import) est présent dès qu'il y a des
  // données à afficher OU d'autres jours à parcourir. La navigation ne s'affiche
  // que s'il existe un autre jour que « aujourd'hui » où aller.
  const canNavigate = navDates.length > 1

  return (
    <div className="pdj-doc flex w-full min-w-0 flex-1 flex-col gap-5">
      {/* En-tête compact (impression uniquement). */}
      <div className="pdj-header">
        <h1>Breakfast</h1>
        <span className="pdj-date">{dateLabel}</span>
      </div>

      {/* Input fichier caché (multi-fichiers), déclenché par la zone vide ou le
          bouton Importer. */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

      {error && <div className="pdj-error print:hidden">{error}</div>}
      {notice && (
        <div className="rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500 print:hidden">
          {notice}
        </div>
      )}

      {(hasData || canNavigate) && (
        <PageHeader
          title={titleDate}
          actions={
            <>
              {canNavigate && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={gotoOlder}
                    disabled={dateIdx < 0 || dateIdx >= navDates.length - 1}
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
              <PrintButton
                onClick={handlePrint}
                responsiveLabel
                disabled={!hasData}
              />
            </>
          }
        />
      )}

      {!hasData ? (
        canEdit ? (
          // Jour courant (ou jour sélectionné) sans rapport : on NE retombe PAS
          // sur d'anciennes données, on propose l'import.
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
              Glissez vos fichiers CSV ici
            </div>
            <div className="text-sm text-muted-foreground">
              un ou plusieurs .csv — les fichiers invalides sont ignorés
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
        )
      ) : (
        <>
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
  // Double-clic sur la ligne (si des couverts existent) : tout servir / annuler.
  const canServe = canEdit && numGuests > 0

  return (
    <tr
      onDoubleClick={
        canServe
          ? () => onServe(room, served === numGuests ? 0 : numGuests)
          : undefined
      }
      title={canServe ? 'Double-clic : tout servir / annuler' : undefined}
      className={cn(
        row && row.breakfasts_included > 0 && 'pdj-included',
        !row && 'pdj-empty',
        canServe && 'cursor-pointer select-none',
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
                onDoubleClick={(e) => e.stopPropagation()}
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
