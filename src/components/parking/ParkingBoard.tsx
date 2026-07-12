import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Copy,
  LineChart,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  addDays,
  differenceInCalendarDays,
  format,
  getISOWeek,
  startOfWeek,
} from 'date-fns'
import { fr } from 'date-fns/locale'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { EmptyCanvas } from '#/components/shared/EmptyCanvas.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Tooltip,
  TooltipContent,
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
import { printParkingSheets } from '#/lib/parking/pdf.ts'
import { matchRoom } from '#/lib/parking/pdjMatch.ts'
import { fetchDay as fetchPdjDay } from '#/lib/pdj/service.ts'

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

/* Le fond d'une barre n'est qu'une teinte à 15 % : il vaut presque le fond de la
 * page. Le texte doit donc contraster avec CE fond-là, pas avec la teinte —
 * d'où une encre foncée en clair et claire en sombre, jamais l'une des deux
 * seule (un texte clair sur fond clair devient invisible, et réciproquement). */
const STATUS: Record<Status, { label: string; bar: string; dot: string }> = {
  reserve: {
    label: 'Réservé',
    bar: 'border-slate-400/50 bg-slate-400/15 text-slate-700 dark:text-slate-100',
    dot: 'bg-slate-400',
  },
  paye: {
    label: 'Payé',
    bar: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100',
    dot: 'bg-emerald-500',
  },
  checkout: {
    label: 'Non payé',
    bar: 'border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-100',
    dot: 'bg-orange-500',
  },
}
const STATUS_ORDER: Status[] = ['reserve', 'paye', 'checkout']

const fmtWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const fmtDay = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
})
const fmtDayYear = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

// Géométrie (pixels) d'une barre sur la grille — partagée par ReservationBar et
// le fantôme de placement. Reste côté présentation (dépend des constantes de
// layout locales ROW_H / BAR_PAD_*), le domaine « slots » vivant dans model.ts.
function barRect(
  startDay: number,
  spot: number,
  nights: number,
  offset: number,
  slotW: number,
) {
  return {
    left: (arrivalSlot(startDay) - offset * SLOTS_PER_DAY) * slotW + BAR_PAD_X,
    width: nights * SLOTS_PER_DAY * slotW - BAR_PAD_X * 2,
    top: (spot - 1) * ROW_H + BAR_PAD_Y,
    height: ROW_H - BAR_PAD_Y * 2,
  }
}

// Convertit un évènement souris en case de grille { day (absolu), spot }.
// Partagé par captureCell (clic droit) et l'overlay de placement.
function pointerToCell(
  e: ReactMouseEvent<HTMLDivElement>,
  dayW: number,
  offset: number,
  visibleDays: number,
) {
  const rect = e.currentTarget.getBoundingClientRect()
  const dayIndex = clamp(
    Math.floor((e.clientX - rect.left) / dayW),
    0,
    Math.max(0, visibleDays - 1),
  )
  const spot = clamp(Math.floor((e.clientY - rect.top) / ROW_H) + 1, 1, SPOTS)
  return { day: offset + dayIndex, spot }
}

export function ParkingBoard({ initialDate }: { initialDate?: string }) {
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
  // Statut en attente de justification : « Non payé » ne s'écrit qu'avec un
  // motif. Non nul ⇒ la modale de commentaire s'ouvre en mode obligatoire, et
  // le statut ne partira en base qu'à l'enregistrement.
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null)
  // Presse-papier local = mode placement : dès qu'une copie (nom, durée, statut,
  // commentaire) y est posée par « Copier », un fantôme suit le curseur et un
  // clic pose la copie. `clipboard !== null` EST l'état « placement en cours » ;
  // `ghost` est la case survolée (null tant que la souris n'a pas bougé).
  //
  // Le commentaire fait partie de la copie : c'est ce qui permet à un collage en
  // « Non payé » de porter son motif, sans redemander la justification qu'exige
  // `setStatus`. Le copier sans lui créerait un impayé muet.
  const [clipboard, setClipboard] = useState<{
    client: string
    nights: number
    status: Status
    comment: string
  } | null>(null)
  const [ghost, setGhost] = useState<{ day: number; spot: number } | null>(null)
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

  // Échap annule le mode placement (copie accrochée au curseur).
  useEffect(() => {
    if (!clipboard) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClipboard(null)
        setGhost(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clipboard])

  /*
   * Chargement initial mis en CACHE (lib/query.ts) : revenir sur le planning
   * réaffiche les réservations sans attendre le réseau. La requête ne dépend
   * pas de `startDate`, elle part donc dès le premier rendu, sans attendre le
   * cycle qui pose le lundi de référence.
   *
   * `staleTime: 0` : le temps réel ne tient la vue à jour que TANT QUE la page
   * est montée. Au retour, il faut rattraper ce qui a changé entre-temps — les
   * données du cache s'affichent aussitôt, le refetch les corrige derrière.
   */
  const { data: rows, error: rowsError } = useQuery({
    queryKey: ['parking', 'reservations'],
    queryFn: fetchReservations,
    staleTime: 0,
  })

  useEffect(() => {
    if (rowsError) console.error(rowsError)
  }, [rowsError])

  // Le cache stocke les lignes BRUTES : leur conversion dépend de `startDate`,
  // qui est propre à l'affichage, pas à la donnée.
  useEffect(() => {
    if (!rows || !startDate) return
    setReservations(rows.map((r) => toReservation(r, startDate)))
  }, [rows, startDate])

  // Abonnement Realtime, une fois le lundi de réf. connu. Il patche l'état
  // LOCAL ligne à ligne, sans toucher au cache : dériver l'affichage du cache
  // effacerait les mises à jour optimistes encore en vol (drag, copie).
  useEffect(() => {
    if (!startDate) return

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

  const visibleDays =
    containerW > 0 ? Math.max(1, Math.floor(containerW / MIN_DAY_W)) : 0
  const dayW = visibleDays > 0 ? containerW / visibleDays : MIN_DAY_W
  const slotW = dayW / SLOTS_PER_DAY

  // Décalage (en jours) du jour actuel par rapport au lundi de référence.
  const todayOffset = startDate
    ? differenceInCalendarDays(new Date(), startDate)
    : 0
  // Cadrage "aujourd'hui" : idéalement 2 jours de passé (aujourd'hui en 3e
  // position), mais borné pour ne jamais sortir aujourd'hui de l'écran étroit.
  const framedOffset = todayOffset - Math.min(2, Math.max(0, visibleDays - 1))
  // Index de la colonne "aujourd'hui" dans la fenêtre (-1 si hors champ).
  const rawTodayIndex = todayOffset - offset
  const todayIndex =
    rawTodayIndex >= 0 && rawTodayIndex < visibleDays ? rawTodayIndex : -1

  // Positionnement initial sur un jour ciblé par lien (?date=YYYY-MM-DD, p. ex.
  // depuis le rapport mensuel). Ne s'exécute QU'UNE fois et SEULEMENT si
  // `initialDate` est fourni — l'offset est absolu (jours depuis le lundi de
  // réf.), il n'attend donc pas la mesure de largeur. Sans `initialDate`, ce
  // bloc est inerte et le cadrage « aujourd'hui » ci-dessous reste seul maître.
  const initApplied = useRef(false)
  useEffect(() => {
    if (!startDate || initApplied.current || !initialDate) return
    initApplied.current = true
    const target = new Date(initialDate + 'T00:00:00')
    setOffset(differenceInCalendarDays(target, startDate))
  }, [startDate, initialDate])

  // Cadrage initial appliqué une fois la largeur mesurée (avant toute navigation).
  // Ignoré si un jour a été ciblé par lien (`initialDate`) : il écraserait sinon
  // la semaine visée. Le comportement par défaut (sans lien) est inchangé.
  const framedInit = useRef(false)
  useEffect(() => {
    if (initialDate) return
    if (!startDate || visibleDays <= 0 || framedInit.current) return
    framedInit.current = true
    setOffset(framedOffset)
  }, [startDate, visibleDays, framedOffset, initialDate])

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
    return Array.from({ length: visibleDays }, (_, i) =>
      addDays(startDate, offset + i),
    )
  }, [startDate, offset, visibleDays])

  // Impression : 4 feuilles de suivi, TOUJOURS J-1 / aujourd'hui / J+1 / J+2
  // (relatif au jour réel, indépendant de la fenêtre affichée), 2 tableaux par
  // page en paysage. Chaque feuille est pré-remplie avec les ARRIVÉES du jour
  // (réservation dont l'arrivée == ce jour). Cf. lib/parking/pdf.ts.
  //
  // Rapprochement PDJ (lecture seule) : on essaie de retrouver le n° de chambre
  // de chaque arrivée via le nom, dans les lignes PDJ du même jour. En pratique
  // ça n'aboutit qu'AUJOURD'HUI : la purge RGPD du PDJ efface le nom des jours
  // passés (guest_name = null) — J-1 restera donc vide tant que la rétention PDJ
  // n'aura pas été revue. Correspondance conservatrice (cf. matchRoom).
  //
  // Ctrl+P emprunte la même porte que le bouton (PDF vectoriel, pas le DOM brut).
  async function handleGeneratePdf() {
    const ref = startDate ?? new Date()
    const todayOff = differenceInCalendarDays(new Date(), ref)
    const offsets = [-1, 0, 1, 2].map((k) => todayOff + k)
    const dates = offsets.map((o) => addDays(ref, o))
    // Lignes PDJ des 4 jours (tolérant : un échec/jour vide → pas de matching).
    const pdjByDay = await Promise.all(
      dates.map((d) => fetchPdjDay(format(d, 'yyyy-MM-dd')).catch(() => [])),
    )
    const days = dates.map((date, i) => {
      const pdjRows = pdjByDay[i]
      const rows = reservations
        .filter((r) => r.startDay === offsets[i])
        .map((r) => {
          const room = matchRoom(r.client, pdjRows)
          return {
            spot: r.spot,
            nom: r.client,
            numero: room != null ? String(room) : '',
            facture:
              r.status === 'paye' || r.status === 'checkout' ? 'Oui' : '',
            checkIn: format(date, 'dd/MM'),
            checkOut: format(addDays(date, r.nights), 'dd/MM'),
          }
        })
      return { date, rows }
    })
    const d = days[0].date
    const stamp = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
    void printParkingSheets({ days }, `Feuille_parking_${stamp}`)
  }
  usePrintShortcut(() => void handleGeneratePdf())

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
        bands.push({
          index: start,
          span: end - start + 1,
          week: getISOWeek(days[start]),
        })
        start = -1
      }
    }
    return bands
  }, [days])

  // Insertion optimiste d'une résa (UUID + ajout local + persistance + rollback).
  // Partagée par addReservation et pasteReservation ; retourne l'id créé.
  function insertReservation(
    fields: {
      client: string
      spot: number
      startDay: number
      nights: number
      status: Status
      comment: string
    },
    ref: Date,
  ) {
    const id = crypto.randomUUID()
    const { client, spot, startDay, nights, status, comment } = fields
    setReservations((prev) => [
      ...prev,
      { id, client, spot, startDay, nights, status, comment },
    ])
    createReservation({
      id,
      spot,
      client,
      start_date: startDayToDate(startDay, ref),
      nights,
      status,
      comment,
    }).catch((err) => {
      console.error(err)
      setReservations((prev) => prev.filter((r) => r.id !== id))
    })
    return id
  }

  function addReservation(startDay: number, spot: number) {
    if (!canEdit || !startDate) return
    if (hasOverlap(reservations, spot, startDay, 1)) return // emplacement déjà occupé
    const id = insertReservation(
      { client: '', spot, startDay, nights: 1, status: 'reserve', comment: '' },
      startDate,
    )
    setEditingId(id)
  }

  // « Copier » (menu contextuel ou Ctrl/Cmd+clic) : pose la copie au curseur.
  function copyReservation(r: Reservation) {
    if (!canEdit) return
    setClipboard({
      client: r.client,
      nights: r.nights,
      status: r.status,
      comment: r.comment,
    })
    setGhost(null)
  }

  // Sortie du mode placement (collage effectué, Échap, ou clic droit).
  function cancelPlacing() {
    setClipboard(null)
    setGhost(null)
  }

  // Colle le presse-papier à la case visée : nom, durée, statut ET commentaire
  // copiés ; seuls la place et le jour viennent de la case. Le chevauchement est
  // déjà écarté par l'appelant (clic sur l'overlay).
  function pasteReservation(startDay: number, spot: number) {
    if (!canEdit || !startDate || !clipboard) return
    insertReservation(
      {
        client: clipboard.client,
        spot,
        startDay,
        nights: clipboard.nights,
        status: clipboard.status,
        comment: clipboard.comment,
      },
      startDate,
    )
  }

  function openComment(r: Reservation) {
    setCommentDraft(r.comment)
    setPendingStatus(null)
    setCommentId(r.id)
  }

  function closeComment() {
    // Fermeture sans enregistrer : un statut en attente est abandonné, la
    // réservation garde donc celui qu'elle avait.
    setCommentId(null)
    setPendingStatus(null)
  }

  function saveComment() {
    if (!canEdit) return
    if (commentId === null) return
    const id = commentId
    const comment = commentDraft.trim()
    const status = pendingStatus
    if (status && !comment) return // justification obligatoire
    setReservations((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, comment, status: status ?? r.status } : r,
      ),
    )
    setCommentId(null)
    setPendingStatus(null)
    updateReservation(id, status ? { comment, status } : { comment }).catch(
      console.error,
    )
  }

  function setStatus(id: string, status: Status) {
    if (!canEdit) return
    const current = reservations.find((r) => r.id === id)
    if (!current || current.status === status) return
    /* « Non payé » exige un motif écrit. On ouvre la modale AVANT toute
       écriture : appliquer le statut d'abord, quitte à le retirer si l'hôtelier
       annule, l'aurait diffusé en base — donc, par le temps réel, sur l'écran
       des collègues — le temps de l'aller-retour. Ici, rien ne bouge tant que
       la justification n'est pas saisie ; statut et commentaire partent alors
       ensemble, en une seule requête. */
    if (status === 'checkout') {
      setCommentDraft(current.comment)
      setPendingStatus(status)
      setCommentId(id)
      return
    }
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

  function startInteraction(
    e: ReactPointerEvent,
    res: Reservation,
    mode: Mode,
  ) {
    if (!canEdit) return
    if (!startDate) return
    // Ctrl/Cmd + clic = copie rapide (accroche au curseur), sans déplacement.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      copyReservation(res)
      return
    }
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
        startDay = Math.min(
          orig.startDay + dDay,
          orig.startDay + orig.nights - 1,
        )
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
    pendingCell.current = pointerToCell(e, dayW, offset, visibleDays)
  }

  // Aller directement à une date choisie dans le calendrier (devient le 1er jour affiché).
  function goToDate(date?: Date) {
    if (!date || !startDate) return
    setOffset(differenceInCalendarDays(date, startDate))
    setCalOpen(false)
  }

  // Plage de dates affichée en titre (haut à gauche), façon autres pages.
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

  // Chevauchement de la case survolée pendant un placement — calculé une seule
  // fois par render (réutilisé par le clic ET le rendu rouge/normal du fantôme).
  const ghostInvalid =
    ghost && clipboard
      ? hasOverlap(reservations, ghost.spot, ghost.day, clipboard.nights)
      : false

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
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/* En-tête façon standard : plage de dates à GAUCHE (titre), navigation
          temporelle à DROITE (icône calendrier). La légende est passée sous le
          planning. */}
      <PageHeader
        title={rangeLabel}
        actions={
          <>
            <Tip label="Vue analytique">
              <Button asChild variant="outline" size="icon-sm">
                <Link to="/parking/analytique" aria-label="Vue analytique">
                  <LineChart />
                </Link>
              </Button>
            </Tip>
            <PrintButton
              onClick={handleGeneratePdf}
              iconOnly
              tipLabel="Imprimer les feuilles de suivi (4 jours)"
            />
            <StepNav
              className="ml-1"
              onPrev={() => setOffset((o) => o - STEP)}
              onNext={() => setOffset((o) => o + STEP)}
              prevLabel="Reculer de 3 jours"
              nextLabel="Avancer de 3 jours"
            >
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Choisir une date"
                >
                  <CalendarDays />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  locale={fr}
                  selected={days[0]}
                  defaultMonth={days[0]}
                  onSelect={goToDate}
                />
                <div className="border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setOffset(framedOffset)
                      setCalOpen(false)
                    }}
                    disabled={offset === framedOffset}
                  >
                    Aujourd’hui
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            </StepNav>
          </>
        }
      />

      {/* Planning */}
      <div className="flex overflow-hidden rounded-2xl border border-border bg-card">
        {/* Colonne fixe des places */}
        <div
          className="shrink-0 border-r border-border"
          style={{ width: LABEL_W }}
        >
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
                  <ContextMenuTrigger asChild>
                    {gridBackground}
                  </ContextMenuTrigger>
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
                    onCopy={copyReservation}
                    onRemove={remove}
                  />
                ))}

              {/* Mode placement : overlay capturant la souris + fantôme suivant
                    le curseur. Un clic pose la copie sur la case visée ; il
                    devient rouge (et le clic est sans effet) si elle est occupée. */}
              {clipboard && (
                <>
                  <div
                    className="absolute inset-0 z-20 cursor-copy"
                    onMouseMove={(e) => {
                      const cell = pointerToCell(e, dayW, offset, visibleDays)
                      // Ne re-render que si la case change (pas à chaque pixel).
                      setGhost((prev) =>
                        prev && prev.day === cell.day && prev.spot === cell.spot
                          ? prev
                          : cell,
                      )
                    }}
                    onClick={() => {
                      if (!ghost || ghostInvalid) return
                      pasteReservation(ghost.day, ghost.spot)
                      cancelPlacing()
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      cancelPlacing()
                    }}
                  />
                  {ghost && (
                    <div
                      className={cn(
                        'pointer-events-none absolute z-30 flex items-center rounded-md border px-1.5 text-xs shadow-lg',
                        ghostInvalid
                          ? 'border-rose-500 bg-rose-500/25 text-rose-700 dark:text-rose-50'
                          : STATUS[clipboard.status].bar,
                      )}
                      style={barRect(
                        ghost.day,
                        ghost.spot,
                        clipboard.nights,
                        offset,
                        slotW,
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {clipboard.client || 'Sans nom'}
                      </span>
                      {/* Le commentaire fait partie de la copie : l'annoncer
                          avant le clic, comme sur une barre posée. */}
                      {clipboard.comment && (
                        <MessageSquare className="ml-1 size-3 shrink-0 opacity-70" />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Légende — sous le planning, alignée à droite (déplacée de l'en-tête). */}
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
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

      {/* Modale du commentaire. Double emploi : édition libre depuis le menu
          contextuel, ou justification OBLIGATOIRE d'un passage en « Non payé »
          (`pendingStatus`) — le statut n'est alors écrit qu'avec le motif. */}
      <Dialog
        open={commentId !== null}
        onOpenChange={(open) => {
          if (!open) closeComment()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingStatus ? 'Justifier le non-paiement' : 'Commentaire'}
            </DialogTitle>
            {pendingStatus && (
              <DialogDescription>
                Indiquez pourquoi ce client passe en « Non payé ». Sans motif, le
                statut n'est pas modifié.
              </DialogDescription>
            )}
          </DialogHeader>
          <Textarea
            autoFocus
            rows={4}
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder={
              pendingStatus ? 'Motif du non-paiement…' : 'Ajouter un commentaire…'
            }
          />
          <DialogFooter>
            <Button variant="ghost" onClick={closeComment}>
              Annuler
            </Button>
            <Button
              onClick={saveComment}
              disabled={pendingStatus !== null && !commentDraft.trim()}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  onCopy: (r: Reservation) => void
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
  onCopy,
  onRemove,
}: ReservationBarProps) {
  const st = STATUS[r.status]
  const inputRef = useRef<HTMLInputElement>(null)
  // « Renommer » du menu contextuel : on diffère l'entrée en édition à la
  // fermeture du menu (onCloseAutoFocus), pour que l'input monte APRÈS la gestion
  // de focus de Radix — le curseur s'y pose alors sans lutte, comme à la création.
  const pendingEditRef = useRef(false)
  // À l'ouverture de l'édition (double-clic OU menu contextuel « Renommer »), on
  // pose explicitement focus + sélection dans le champ. Indispensable via le menu
  // contextuel : Radix restitue le focus à sa fermeture, ce qui volait le curseur
  // du champ ; on le (re)pose au frame suivant pour gagner la course.
  useEffect(() => {
    if (!editing) return
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      // Curseur en fin de texte, sans sélection : taper une lettre n'efface pas
      // le nom existant — on écrit à la suite, comme à la création.
      const end = el.value.length
      el.setSelectionRange(end, end)
    })
    return () => cancelAnimationFrame(raf)
  }, [editing])
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
      onPointerDown={
        canEdit ? (e) => onStartInteraction(e, r, 'move') : undefined
      }
      onDoubleClick={canEdit ? () => onStartEdit(r.id) : undefined}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group absolute flex touch-none items-center gap-1.5 rounded-md border px-1.5 text-xs shadow-sm',
        canEdit && 'cursor-grab active:cursor-grabbing',
        st.bar,
      )}
      style={barRect(r.startDay, r.spot, r.nights, offset, slotW)}
    >
      {canEdit && (
        <span
          onPointerDown={(e) => onStartInteraction(e, r, 'resize-left')}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md"
        />
      )}

      {editing ? (
        <input
          ref={inputRef}
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
    <TooltipContent side="top" className="max-w-56 select-none">
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

      <ContextMenuContent
        className="w-44"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (pendingEditRef.current) {
            pendingEditRef.current = false
            onStartEdit(r.id)
          }
        }}
      >
        <ContextMenuItem
          onSelect={() => {
            pendingEditRef.current = true
          }}
        >
          <Pencil />
          Renommer
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onComment(r)}>
          <MessageSquare />
          Commentaire
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopy(r)}>
          <Copy />
          Copier
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuRadioGroup
          value={r.status}
          onValueChange={(v) => onStatus(r.id, v as Status)}
        >
          {STATUS_ORDER.map((s) => (
            <ContextMenuRadioItem key={s} value={s}>
              <span
                className={cn('mr-2 size-2.5 rounded-full', STATUS[s].dot)}
              />
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
