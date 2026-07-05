import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  addDays,
  differenceInCalendarDays,
  getISOWeek,
  startOfWeek,
} from 'date-fns'
import { fr } from 'date-fns/locale'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { EmptyCanvas } from '#/components/shared/EmptyCanvas.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Calendar } from '#/components/ui/calendar.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { clamp, cn } from '#/lib/utils.ts'
import {
  FIRST_STAFF_SPOT,
  SLOTS_PER_DAY,
  SPOTS,
  SPOTS_LIST,
  arrivalSlot,
  hasOverlap,
} from '#/lib/parking/model.ts'
import type { Mode, Reservation, Status } from '#/lib/parking/model.ts'
import { supabase } from '#/lib/supabase.ts'
import {
  createReservation,
  deleteReservation,
  fetchReservations,
  startDayToDate,
  toReservation,
  updateReservation,
} from '#/lib/parking/service.ts'
import type { DbReservation } from '#/lib/parking/service.ts'

/* --------------------------------------------------------------------------
 * Planning parking — persistance Supabase + synchro Realtime.
 *
 * `startDay` d'une réservation = décalage ABSOLU en jours par rapport au
 * lundi de référence (peut être négatif = passé). La fenêtre affichée pane
 * via `offset` (flèches / clavier) → navigation illimitée passé/futur.
 * ------------------------------------------------------------------------ */

const MIN_DAY_W = 140 // largeur minimale d'un jour (les colonnes remplissent la largeur)
const ROW_H = 44
const HEADER_H = 52
const LABEL_W = 56
const STEP = 3 // pas de navigation (jours)
const BAR_PAD_X = 2 // marge horizontale d'une barre (px)
const BAR_PAD_Y = 4 // marge verticale d'une barre (px)

const STATUS: Record<Status, { label: string; bar: string; dot: string }> = {
  confirme: {
    label: 'Confirmé',
    bar: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100',
    dot: 'bg-emerald-500',
  },
  attente: {
    label: 'En attente',
    bar: 'border-amber-500/50 bg-amber-500/15 text-amber-100',
    dot: 'bg-amber-500',
  },
  annule: {
    label: 'Annulé',
    bar: 'border-rose-500/50 bg-rose-500/10 text-rose-200/80',
    dot: 'bg-rose-500',
  },
}
const STATUS_ORDER: Status[] = ['confirme', 'attente', 'annule']

const fmtWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })
const fmtDayYear = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function ParkingBoard() {
  const { role } = useAuth()
  // Seuls super_utilisateur et admin peuvent modifier ; `utilisateur` = lecture seule.
  const canEdit = role === 'super_utilisateur' || role === 'admin'
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [offset, setOffset] = useState(0)
  const [containerW, setContainerW] = useState(0)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [calOpen, setCalOpen] = useState(false)
  const [commentId, setCommentId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  // Miroir de `reservations` lisible dans les closures de drag (état le plus récent).
  const reservationsRef = useRef<Reservation[]>([])
  const timelineRef = useRef<HTMLDivElement>(null)
  // Case visée par le dernier clic droit sur une zone vide (pour "Nouvelle réservation").
  const pendingCell = useRef<{ day: number; spot: number }>({ day: 0, spot: 1 })

  // Lundi de référence, calculé côté client (évite un décalage d'hydratation).
  useEffect(() => {
    setStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }, [])

  // Miroir à jour pour les handlers de drag (closures figées sur un ancien état).
  useEffect(() => {
    reservationsRef.current = reservations
  }, [reservations])

  // Chargement initial + abonnement Realtime, une fois le lundi de réf. connu.
  useEffect(() => {
    if (!startDate) return
    fetchReservations()
      .then((rows) => setReservations(rows.map((r) => toReservation(r, startDate))))
      .catch(console.error)

    const channel = supabase
      .channel('parking-reservations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parking_reservations' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id
            setReservations((prev) => prev.filter((r) => r.id !== id))
          } else {
            const res = toReservation(payload.new as DbReservation, startDate)
            setReservations((prev) => {
              const i = prev.findIndex((r) => r.id === res.id)
              if (i === -1) return [...prev, res]
              const next = prev.slice()
              next[i] = res
              return next
            })
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [startDate])

  // Mesure de la largeur disponible → nombre de jours affichés.
  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width)
    })
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [startDate])

  const visibleDays = containerW > 0 ? Math.max(1, Math.floor(containerW / MIN_DAY_W)) : 0
  const dayW = visibleDays > 0 ? containerW / visibleDays : MIN_DAY_W
  const slotW = dayW / SLOTS_PER_DAY

  // Décalage (en jours) du jour actuel par rapport au lundi de référence.
  const todayOffset = startDate ? differenceInCalendarDays(new Date(), startDate) : 0
  // Cadrage "aujourd'hui" : idéalement 2 jours de passé (aujourd'hui en 3e
  // position), mais borné pour ne jamais sortir aujourd'hui de l'écran étroit.
  const framedOffset = todayOffset - Math.min(2, Math.max(0, visibleDays - 1))
  // Index de la colonne "aujourd'hui" dans la fenêtre (-1 si hors champ).
  const rawTodayIndex = todayOffset - offset
  const todayIndex =
    rawTodayIndex >= 0 && rawTodayIndex < visibleDays ? rawTodayIndex : -1

  // Cadrage initial appliqué une fois la largeur mesurée (avant toute navigation).
  const framedInit = useRef(false)
  useEffect(() => {
    if (!startDate || visibleDays <= 0 || framedInit.current) return
    framedInit.current = true
    setOffset(framedOffset)
  }, [startDate, visibleDays, framedOffset])

  // Raccourcis clavier : ← / → naviguent, Alt ramène à aujourd'hui.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setOffset((o) => o - STEP)
      else if (e.key === 'ArrowRight') setOffset((o) => o + STEP)
      else if (e.key === 'Alt' && !e.repeat) {
        e.preventDefault()
        setOffset(framedOffset)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [framedOffset])

  const days = useMemo(() => {
    if (!startDate || visibleDays <= 0) return [] as Date[]
    return Array.from({ length: visibleDays }, (_, i) => addDays(startDate, offset + i))
  }, [startDate, offset, visibleDays])

  // Plages de jours ouvrés (lundi→vendredi) visibles, pour le n° de semaine ISO.
  const weekBands = useMemo(() => {
    const bands: { index: number; span: number; week: number }[] = []
    let start = -1
    for (let i = 0; i < days.length; i++) {
      const wd = days[i].getDay()
      const weekday = wd >= 1 && wd <= 5
      if (weekday && start === -1) start = i
      if (start !== -1 && (!weekday || i === days.length - 1)) {
        const end = weekday ? i : i - 1
        bands.push({ index: start, span: end - start + 1, week: getISOWeek(days[start]) })
        start = -1
      }
    }
    return bands
  }, [days])

  function addReservation(startDay: number, spot: number) {
    if (!canEdit) return
    if (!startDate) return
    if (hasOverlap(reservations, spot, startDay, 1)) return // emplacement déjà occupé
    const id = crypto.randomUUID()
    setReservations((prev) => [
      ...prev,
      { id, client: '', spot, startDay, nights: 1, status: 'attente', comment: '' },
    ])
    setEditingId(id)
    createReservation({
      id,
      spot,
      client: '',
      start_date: startDayToDate(startDay, startDate),
      nights: 1,
      status: 'attente',
      comment: '',
    }).catch((err) => {
      console.error(err)
      setReservations((prev) => prev.filter((r) => r.id !== id))
    })
  }

  function openComment(r: Reservation) {
    setCommentDraft(r.comment)
    setCommentId(r.id)
  }

  function saveComment() {
    if (!canEdit) return
    if (commentId === null) return
    const id = commentId
    const comment = commentDraft.trim()
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, comment } : r)),
    )
    setCommentId(null)
    updateReservation(id, { comment }).catch(console.error)
  }

  function setStatus(id: string, status: Status) {
    if (!canEdit) return
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r)),
    )
    updateReservation(id, { status }).catch(console.error)
  }

  function rename(id: string, value: string) {
    if (!canEdit) return
    const client = value.trim()
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, client } : r)),
    )
    updateReservation(id, { client }).catch(console.error)
  }

  function remove(id: string) {
    if (!canEdit) return
    setReservations((prev) => prev.filter((r) => r.id !== id))
    deleteReservation(id).catch(console.error)
  }

  function startInteraction(e: ReactPointerEvent, res: Reservation, mode: Mode) {
    if (!canEdit) return
    if (!startDate) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const orig = { ...res }

    const onMove = (ev: PointerEvent) => {
      const dDay = Math.round((ev.clientX - startX) / dayW)
      const dRow = Math.round((ev.clientY - startY) / ROW_H)
      let spot = orig.spot
      let startDay = orig.startDay
      let nights = orig.nights
      if (mode === 'move') {
        spot = clamp(orig.spot + dRow, 1, SPOTS)
        startDay = orig.startDay + dDay
      } else if (mode === 'resize-right') {
        nights = Math.max(1, orig.nights + dDay)
      } else {
        startDay = Math.min(orig.startDay + dDay, orig.startDay + orig.nights - 1)
        nights = orig.nights - (startDay - orig.startDay)
      }
      setReservations((prev) => {
        // Geste refusé si la position visée chevauche une autre réservation.
        if (hasOverlap(prev, spot, startDay, nights, res.id)) return prev
        return prev.map((r) =>
          r.id === res.id ? { ...r, spot, startDay, nights } : r,
        )
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      // Persiste la position FINALE si elle a changé (lecture de l'état à jour).
      const r = reservationsRef.current.find((x) => x.id === res.id)
      if (
        r &&
        (r.spot !== orig.spot ||
          r.startDay !== orig.startDay ||
          r.nights !== orig.nights)
      ) {
        updateReservation(res.id, {
          spot: r.spot,
          start_date: startDayToDate(r.startDay, startDate),
          nights: r.nights,
        }).catch(console.error)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Au clic droit sur une zone vide, on mémorise la case visée ;
  // "Nouvelle réservation" du menu contextuel l'utilise ensuite.
  function captureCell(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const dayIndex = clamp(
      Math.floor((e.clientX - rect.left) / dayW),
      0,
      Math.max(0, visibleDays - 1),
    )
    const spot = clamp(Math.floor((e.clientY - rect.top) / ROW_H) + 1, 1, SPOTS)
    pendingCell.current = { day: offset + dayIndex, spot }
  }

  // Aller directement à une date choisie dans le calendrier (devient le 1er jour affiché).
  function goToDate(date?: Date) {
    if (!date || !startDate) return
    setOffset(differenceInCalendarDays(date, startDate))
    setCalOpen(false)
  }

  const rangeLabel = (() => {
    if (days.length === 0) return ''
    const first = days[0]
    const last = days[days.length - 1]
    return first.getFullYear() === last.getFullYear()
      ? `${fmtDay.format(first)} – ${fmtDayYear.format(last)}`
      : `${fmtDayYear.format(first)} – ${fmtDayYear.format(last)}`
  })()

  if (!startDate) {
    return (
      <EmptyCanvas className="min-h-[300px] text-sm text-muted-foreground">
        Chargement du planning…
      </EmptyCanvas>
    )
  }

  // Fond de grille (lignes de jour / midi / rangées). En lecture seule, il est
  // rendu tel quel ; pour un éditeur, on l'enveloppe dans le menu contextuel
  // « Nouvelle réservation ».
  const gridBackground = (
    <div
      className="absolute inset-0"
      onContextMenu={canEdit ? captureCell : undefined}
      style={{
        backgroundImage: [
          `repeating-linear-gradient(to right, rgba(148,163,184,0.18) 0 1px, transparent 1px ${dayW}px)`,
          `repeating-linear-gradient(to right, transparent 0 ${slotW}px, rgba(148,163,184,0.08) ${slotW}px ${slotW + 1}px, transparent ${slotW + 1}px ${dayW}px)`,
          `repeating-linear-gradient(to bottom, rgba(148,163,184,0.10) 0 1px, transparent 1px ${ROW_H}px)`,
        ].join(','),
      }}
    />
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* En-tête : navigation + légende */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex w-full items-center justify-between gap-1.5 md:w-auto md:justify-start">
            <Button
              variant="outline"
              size="icon"
              aria-label="Reculer de 3 jours"
              onClick={() => setOffset((o) => o - STEP)}
            >
              <ChevronLeft />
            </Button>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="min-w-[13rem] text-sm font-medium tabular-nums"
                >
                  {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  locale={fr}
                  selected={days[0]}
                  defaultMonth={days[0]}
                  onSelect={goToDate}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="icon"
              aria-label="Avancer de 3 jours"
              onClick={() => setOffset((o) => o + STEP)}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Aujourd'hui"
              title="Aujourd'hui (Alt)"
              onClick={() => setOffset(framedOffset)}
              disabled={offset === framedOffset}
            >
              <CalendarDays />
            </Button>
          </div>

          <div className="ml-auto hidden flex-wrap items-center gap-3 text-xs md:flex">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-full', STATUS[s].dot)} />
                {STATUS[s].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MessageSquare className="size-3" />
              Commentaire
            </span>
          </div>
        </div>

        {/* Planning */}
        <div className="flex overflow-hidden rounded-2xl border border-border bg-card">
          {/* Colonne fixe des places */}
          <div className="shrink-0 border-r border-border" style={{ width: LABEL_W }}>
            <div
              className="flex items-center justify-center text-xs font-medium text-muted-foreground"
              style={{ height: HEADER_H }}
            >
              Place
            </div>
            {SPOTS_LIST.map((s) => (
              <div
                key={s}
                className={cn(
                  'flex items-center justify-center border-t border-border text-sm',
                  s >= FIRST_STAFF_SPOT && 'bg-primary/5',
                )}
                style={{ height: ROW_H }}
              >
                <span className="font-medium tabular-nums">{s}</span>
              </div>
            ))}
          </div>

          {/* Zone des jours (sans scrollbar : navigation par flèches) */}
          <div ref={timelineRef} className="min-w-0 flex-1 overflow-hidden">
            <div className="relative" style={{ width: '100%' }}>
              {/* Bordures des week-ends, continues sur en-tête + grille */}
              {days.map((d, i) => {
                const day = d.getDay()
                if (day !== 6 && day !== 0) return null
                const left = day === 6 ? i * dayW : (i + 1) * dayW
                return (
                  <div
                    key={`we-${i}`}
                    className="pointer-events-none absolute bottom-0 top-0 w-px bg-foreground/15"
                    style={{ left }}
                  />
                )
              })}

              {/* En-tête des jours */}
              <div className="flex" style={{ height: HEADER_H }}>
                {days.map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex flex-col items-center justify-center border-l border-border first:border-l-0',
                      i === todayIndex && 'bg-primary/5',
                    )}
                    style={{ width: dayW }}
                  >
                    <span className="text-xs font-medium capitalize">
                      {fmtWeekday.format(d)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {fmtDay.format(d)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grille + réservations */}
              <div className="relative" style={{ height: SPOTS * ROW_H }}>
                {/* Fond : lignes de jour / midi / rangées + clic droit pour ajouter.
                    En lecture seule (utilisateur), pas de menu contextuel : on
                    rend le fond seul (clic droit navigateur inoffensif). */}
                {canEdit ? (
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{gridBackground}</ContextMenuTrigger>
                    <ContextMenuContent
                      className="w-44"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <ContextMenuItem
                        onSelect={() =>
                          addReservation(
                            pendingCell.current.day,
                            pendingCell.current.spot,
                          )
                        }
                      >
                        <Plus />
                        Nouvelle réservation
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ) : (
                  gridBackground
                )}

                {/* Numéro de semaine ISO en filigrane (lundi → vendredi) */}
                {weekBands.map((b) => (
                  <div
                    key={`wk-${b.index}`}
                    className="pointer-events-none absolute bottom-0 top-0 flex select-none items-center justify-center"
                    style={{ left: b.index * dayW, width: b.span * dayW }}
                  >
                    <span className="text-8xl font-bold text-foreground/[0.06]">
                      {b.week}
                    </span>
                  </div>
                ))}

                {/* Colonne du jour actuel (s'arrête avant les places personnel
                    pour ne pas superposer les deux fonds) */}
                {todayIndex >= 0 && (
                  <div
                    className="pointer-events-none absolute top-0 bg-primary/5"
                    style={{
                      left: todayIndex * dayW,
                      width: dayW,
                      height: (FIRST_STAFF_SPOT - 1) * ROW_H,
                    }}
                  />
                )}

                {/* Bandes des places personnel */}
                {SPOTS_LIST.filter((s) => s >= FIRST_STAFF_SPOT).map((s) => (
                  <div
                    key={s}
                    className="pointer-events-none absolute left-0 right-0 bg-primary/5"
                    style={{ top: (s - 1) * ROW_H, height: ROW_H }}
                  />
                ))}

                {/* Réservations (uniquement celles visibles dans la fenêtre) */}
                {reservations
                  .filter(
                    (r) =>
                      r.startDay + r.nights >= offset &&
                      r.startDay <= offset + visibleDays,
                  )
                  .map((r) => (
                    <ReservationBar
                      key={r.id}
                      r={r}
                      canEdit={canEdit}
                      offset={offset}
                      slotW={slotW}
                      editing={editingId === r.id}
                      onStartInteraction={startInteraction}
                      onStartEdit={setEditingId}
                      onStopEdit={() => setEditingId(null)}
                      onRename={rename}
                      onStatus={setStatus}
                      onComment={openComment}
                      onRemove={remove}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modale d'édition du commentaire */}
        <Dialog
          open={commentId !== null}
          onOpenChange={(open) => {
            if (!open) setCommentId(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Commentaire</DialogTitle>
            </DialogHeader>
            <Textarea
              autoFocus
              rows={4}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Ajouter un commentaire…"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCommentId(null)}>
                Annuler
              </Button>
              <Button onClick={saveComment}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

interface ReservationBarProps {
  r: Reservation
  canEdit: boolean
  offset: number
  slotW: number
  editing: boolean
  onStartInteraction: (e: ReactPointerEvent, r: Reservation, mode: Mode) => void
  onStartEdit: (id: string) => void
  onStopEdit: () => void
  onRename: (id: string, value: string) => void
  onStatus: (id: string, status: Status) => void
  onComment: (r: Reservation) => void
  onRemove: (id: string) => void
}

function ReservationBar({
  r,
  canEdit,
  offset,
  slotW,
  editing,
  onStartInteraction,
  onStartEdit,
  onStopEdit,
  onRename,
  onStatus,
  onComment,
  onRemove,
}: ReservationBarProps) {
  const st = STATUS[r.status]
  const commit = (value: string) => {
    onRename(r.id, value)
    onStopEdit()
  }

  // La barre elle-même. En lecture seule : ni drag (`onPointerDown`), ni édition
  // inline (`onDoubleClick`), ni poignées de redimensionnement, ni curseur grab.
  const bar = (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={canEdit ? (e) => onStartInteraction(e, r, 'move') : undefined}
      onDoubleClick={canEdit ? () => onStartEdit(r.id) : undefined}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group absolute flex touch-none items-center gap-1.5 rounded-md border px-1.5 text-xs shadow-sm',
        canEdit && 'cursor-grab active:cursor-grabbing',
        st.bar,
      )}
      style={{
        left: (arrivalSlot(r.startDay) - offset * SLOTS_PER_DAY) * slotW + BAR_PAD_X,
        width: r.nights * SLOTS_PER_DAY * slotW - BAR_PAD_X * 2,
        top: (r.spot - 1) * ROW_H + BAR_PAD_Y,
        height: ROW_H - BAR_PAD_Y * 2,
      }}
    >
      {canEdit && (
        <span
          onPointerDown={(e) => onStartInteraction(e, r, 'resize-left')}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md"
        />
      )}

      {editing ? (
        <input
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          defaultValue={r.client}
          placeholder="Nom du client"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            else if (e.key === 'Escape') onStopEdit()
          }}
          className="w-full min-w-0 bg-transparent font-medium outline-none placeholder:text-current placeholder:opacity-50"
        />
      ) : (
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-medium',
            !r.client && 'opacity-50',
          )}
        >
          {r.client || 'Sans nom'}
        </span>
      )}

      {r.comment && (
        <MessageSquare className="mr-1 size-3 shrink-0 opacity-70" />
      )}

      {canEdit && (
        <span
          onPointerDown={(e) => onStartInteraction(e, r, 'resize-right')}
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-md"
        />
      )}
    </div>
  )

  const tip = r.comment && (
    <TooltipContent side="top" className="max-w-56">
      {r.comment}
    </TooltipContent>
  )

  // Lecture seule : tooltip conservé, mais aucun menu contextuel d'édition.
  if (!canEdit) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{bar}</TooltipTrigger>
        {tip}
      </Tooltip>
    )
  }

  return (
    <ContextMenu>
      <Tooltip>
        <ContextMenuTrigger asChild>
          <TooltipTrigger asChild>{bar}</TooltipTrigger>
        </ContextMenuTrigger>
        {tip}
      </Tooltip>

      <ContextMenuContent className="w-44" onCloseAutoFocus={(e) => e.preventDefault()}>
        <ContextMenuItem onSelect={() => onStartEdit(r.id)}>
          <Pencil />
          Renommer
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onComment(r)}>
          <MessageSquare />
          Commentaire
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuRadioGroup
          value={r.status}
          onValueChange={(v) => onStatus(r.id, v as Status)}
        >
          {STATUS_ORDER.map((s) => (
            <ContextMenuRadioItem key={s} value={s}>
              <span className={cn('mr-2 size-2.5 rounded-full', STATUS[s].dot)} />
              {STATUS[s].label}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onRemove(r.id)}>
          <Trash2 />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
