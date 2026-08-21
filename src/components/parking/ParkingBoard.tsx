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
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { SkeletonBlock } from '#/components/shared/skeleton/SkeletonBlock.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import { ParkingHelpPanel } from '#/components/parking/ParkingHelpPanel.tsx'
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
  PMR_GLYPH,
  PMR_SPOT,
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
import {
  canCreateReservation,
  canEditReservation,
  clampSpanToEditable,
} from '#/lib/parking/editability.ts'
import { useParkingHistory } from '#/components/parking/useParkingHistory.ts'
import { useUndoRedoShortcut } from '#/components/shared/useUndoRedoShortcut.ts'
import type { ReservationPatch } from '#/lib/parking/history.ts'
import { printParkingSheets } from '#/lib/parking/pdf.ts'
import { fmtPctInt } from '#/lib/parking/format.ts'
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
const COMPACT_DAY_W = 64 // largeur minimale d'un jour en mode compact (téléphone)
// Compact : les rangées s'ÉTIRENT pour remplir la hauteur disponible (pas de vide
// sous le tableau). Bornes de sécurité + réserve pour la légende / marges sous la
// carte (au-delà, la page défile plutôt que d'écraser les rangées).
const COMPACT_MIN_ROW_H = 30
const COMPACT_MAX_ROW_H = 60
const COMPACT_BOTTOM_GAP = 64
const ROW_H = 44
const HEADER_H = 52
const LABEL_W = 56
const STEP = 3 // pas de navigation (jours)

/* Fenêtre de données CHARGÉE (bornée). Le planning ne télécharge que les
 * réservations autour de la période consultée, pas tout l'historique. La fenêtre
 * ne fait que S'AGRANDIR quand on navigue près d'un bord (jamais rétrécir), et se
 * réinitialise au montage. `STAY_LOOKBACK` = marge amont pour capter les séjours
 * démarrés juste avant la fenêtre mais qui débordent dedans (bornage par
 * start_date, la date de fin n'étant pas indexée). */
const LOAD_PAST_DAYS = 90 // passé chargé au départ
const LOAD_FUTURE_DAYS = 180 // futur chargé au départ
const LOAD_EXPAND_DAYS = 120 // taille d'un agrandissement
const LOAD_EDGE_GUARD = 21 // on étend quand la vue arrive à ≤ N jours d'un bord
const STAY_LOOKBACK_DAYS = 45 // marge amont pour les séjours débordant dans la vue
const BAR_PAD_X = 2 // marge horizontale d'une barre (px)
const BAR_PAD_Y = 4 // marge verticale d'une barre (px)

/* Le fond d'une barre n'est qu'une teinte à 15 % : il vaut presque le fond de la
 * page. Le texte doit donc contraster avec CE fond-là, pas avec la teinte —
 * d'où une encre foncée en clair et claire en sombre, jamais l'une des deux
 * seule (un texte clair sur fond clair devient invisible, et réciproquement). */
// Style d'une barre éclaté en `border` / `fill` (teinte 15 %) / `text` / `dot`.
// La teinte `fill` est posée sur un fond OPAQUE (bg-card) : la barre garde son
// rendu habituel MAIS ne laisse rien transparaître dessous (utile en zone
// critique, fond rouge derrière). Le point (`dot`) sert à la légende / au menu.
const STATUS: Record<
  Status,
  { label: string; border: string; fill: string; text: string; dot: string }
> = {
  reserve: {
    label: 'Réservé',
    border: 'border-slate-400/50',
    fill: 'bg-slate-400/15',
    text: 'text-slate-700 dark:text-slate-100',
    dot: 'bg-slate-400',
  },
  paye: {
    label: 'Payé',
    border: 'border-emerald-500/50',
    fill: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-100',
    dot: 'bg-emerald-500',
  },
  checkout: {
    label: 'Non payé',
    border: 'border-orange-500/50',
    fill: 'bg-orange-500/15',
    text: 'text-orange-700 dark:text-orange-100',
    dot: 'bg-orange-500',
  },
  employe: {
    label: 'Employé',
    border: 'border-violet-500/50',
    fill: 'bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-100',
    dot: 'bg-violet-500',
  },
}
const STATUS_ORDER: Status[] = ['reserve', 'paye', 'checkout', 'employe']

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
  rowH: number,
) {
  return {
    left: (arrivalSlot(startDay) - offset * SLOTS_PER_DAY) * slotW + BAR_PAD_X,
    width: nights * SLOTS_PER_DAY * slotW - BAR_PAD_X * 2,
    top: (spot - 1) * rowH + BAR_PAD_Y,
    height: rowH - BAR_PAD_Y * 2,
  }
}

// Convertit un évènement souris en case de grille { day (absolu), spot }.
// Partagé par captureCell (clic droit) et l'overlay de placement.
function pointerToCell(
  e: ReactMouseEvent<HTMLDivElement>,
  dayW: number,
  offset: number,
  visibleDays: number,
  rowH: number,
) {
  const rect = e.currentTarget.getBoundingClientRect()
  const dayIndex = clamp(
    Math.floor((e.clientX - rect.left) / dayW),
    0,
    Math.max(0, visibleDays - 1),
  )
  const spot = clamp(Math.floor((e.clientY - rect.top) / rowH) + 1, 1, SPOTS)
  return { day: offset + dayIndex, spot }
}

// Pictogramme « fauteuil roulant » (PMR), affiché à la place du numéro de la place
// PMR. SVG (potrace) issu de la SOURCE UNIQUE `PMR_GLYPH` (model.ts, partagée avec
// le PDF) ; `currentColor` → suit la couleur du texte, se dimensionne via `className`.
function PmrGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={PMR_GLYPH.viewBox}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <g transform={PMR_GLYPH.transform} stroke="none">
        {PMR_GLYPH.paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  )
}

// Affichage COMPACT (téléphone / petit écran, < 768px — breakpoint aligné sur la
// Navbar). En compact, le planning passe en LECTURE SEULE côté front (créer /
// déplacer / redimensionner par glisser-déposer tactile est ingérable) et masque
// les noms — on ne voit que les zones colorées, et seul le panoramique jours reste.
// Règle purement front : la RLS demeure l'unique autorité des droits.
function useIsCompact(): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setCompact(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return compact
}

export function ParkingBoard({ initialDate }: { initialDate?: string }) {
  const { can, pageLevel } = useAuth()
  // Seuls les niveaux Écriture / Gestion peuvent modifier ; Lecture = consultation.
  const isCompact = useIsCompact()
  // En affichage compact (téléphone), l'édition est désactivée CÔTÉ FRONT : lecture
  // seule, seul le panoramique jours reste. `canEdit` porte « droit d'écrire ET pas
  // en compact » → tous les points d'édition (création, déplacement, redim, menus)
  // s'en déduisent automatiquement. (La RLS reste l'autorité réelle des droits.)
  const canEdit = can('parking', 'ecriture') && !isCompact
  // Niveau effectif sur le parking : sert au verrou TEMPOREL par réservation.
  // Écriture agit sur l'actualité (présent, futur, passé récent, séjours en
  // cours) ; seule la gestion peut modifier le passé verrouillé (cf.
  // lib/parking/editability.ts).
  const level = pageLevel('parking')
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [offset, setOffset] = useState(0)
  // Fenêtre de dates CHARGÉE (bornes 'YYYY-MM-DD' sur start_date). null tant que le
  // premier cadrage n'est pas posé → la requête attend. S'agrandit à la navigation.
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  // Défilement au clic-glissé (drag-to-scroll) : vrai le temps d'un panoramique,
  // pour le curseur « grabbing » et la neutralisation de la sélection de texte.
  const [panning, setPanning] = useState(false)
  const [containerW, setContainerW] = useState(0)
  // Hauteur du haut de la timeline au bas du viewport (mesurée) → sert à étirer les
  // rangées pour remplir l'écran en compact. 0 tant que non mesurée.
  const [availH, setAvailH] = useState(0)
  const [reservations, setReservations] = useState<Reservation[]>([])
  // Échec d'écriture (création/déplacement) rejeté par la base — affiché plutôt
  // qu'un rollback silencieux (contrainte anti-chevauchement `EXCLUDE`, voir
  // supabase/parking_no_overlap.sql). Effacé au début de l'action suivante.
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [calOpen, setCalOpen] = useState(false)
  // Modal d'aide : tutoriel factuel de la page (bouton « ? » de la barre d'actions).
  const [helpOpen, setHelpOpen] = useState(false)
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
  // Vrai le temps d'un drag/redimension : neutralise Ctrl+Z pendant le geste.
  const interactingRef = useRef(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  // Case visée par le dernier clic droit sur une zone vide (pour "Nouvelle réservation").
  const pendingCell = useRef<{ day: number; spot: number }>({ day: 0, spot: 1 })

  // Lundi de référence, calculé côté client (évite un décalage d'hydratation).
  useEffect(() => {
    setStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }, [])

  // Fenêtre de données initiale (autour d'aujourd'hui), posée une fois côté client
  // — même précaution d'hydratation que le lundi de référence.
  useEffect(() => {
    if (range) return
    const today = new Date()
    setRange({
      from: format(
        addDays(today, -(LOAD_PAST_DAYS + STAY_LOOKBACK_DAYS)),
        'yyyy-MM-dd',
      ),
      to: format(addDays(today, LOAD_FUTURE_DAYS), 'yyyy-MM-dd'),
    })
  }, [range])

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
   * Chargement BORNÉ à la fenêtre `range`, mis en CACHE par (from, to) : revenir
   * sur le planning réaffiche les réservations sans attendre le réseau. On ne
   * télécharge plus tout l'historique — seulement la période consultée, étendue à
   * la navigation (cf. l'effet d'agrandissement).
   *
   * `staleTime: 0` : le temps réel tient la vue à jour TANT QUE la page est montée.
   * Au retour, les données du cache s'affichent aussitôt, le refetch corrige derrière.
   */
  const {
    data: rows,
    error: rowsError,
    refetch: refetchReservations,
  } = useQuery({
    queryKey: ['parking', 'reservations', range?.from, range?.to],
    queryFn: () => fetchReservations(range!.from, range!.to),
    enabled: !!range,
    staleTime: 0,
  })

  useEffect(() => {
    if (rowsError) console.error(rowsError)
  }, [rowsError])

  // Posé à `true` juste avant un rechargement de RATTRAPAGE (reconnexion temps
  // réel, retour de veille) : le prochain passage de l'effet ci-dessous doit
  // alors REMPLACER l'état plutôt que fusionner, seul moyen de rattraper une
  // suppression manquée pendant la coupure (une fusion ne supprime jamais).
  const hardResyncRef = useRef(false)

  // FUSION par identifiant (jamais d'écrasement, jamais de suppression ici) : les
  // lignes déjà présentes — patchées par le temps réel, ou modifiées en vol (drag,
  // copie) — sont PRÉSERVÉES ; la tranche chargée met à jour / ajoute par `id`. Les
  // suppressions passent par le canal realtime (en direct) et par le rechargement
  // propre au montage (état vide → vérité de la fenêtre). C'est ce qui garantit que
  // borner/agrandir la fenêtre n'efface jamais une mise à jour temps réel.
  // EXCEPTION : rattrapage forcé (hardResyncRef) → remplacement complet, cf. ci-dessus.
  useEffect(() => {
    if (!rows || !startDate) return
    if (hardResyncRef.current) {
      hardResyncRef.current = false
      setReservations(rows.map((row) => toReservation(row, startDate)))
      return
    }
    setReservations((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]))
      for (const row of rows) byId.set(row.id, toReservation(row, startDate))
      return [...byId.values()]
    })
  }, [rows, startDate])

  // Abonnement Realtime, une fois le lundi de réf. connu. Il patche l'état
  // LOCAL ligne à ligne, sans toucher au cache : dériver l'affichage du cache
  // effacerait les mises à jour optimistes encore en vol (drag, copie).
  //
  // Un poste laissé inactif longtemps (veille, onglet en arrière-plan) peut
  // perdre le socket temps réel SANS qu'aucun événement de coupure ne soit
  // émis (le système d'exploitation gèle la connexion, ne la ferme pas
  // proprement) → le planning reste figé sur l'état d'avant la veille alors
  // que d'autres postes ont continué à modifier des réservations. On rattrape
  // par un rechargement complet (a) dès que le canal signale une reconnexion
  // après une coupure détectée, ET (b) en filet de sécurité, dès que l'onglet
  // redevient visible/actif ou que le réseau revient — sans attendre que le
  // canal le signale lui-même.
  useEffect(() => {
    if (!startDate) return

    const hardResync = () => {
      hardResyncRef.current = true
      void refetchReservations()
    }

    let dropped = false

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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (dropped) {
            dropped = false
            hardResync()
          }
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          dropped = true
        }
      })

    const onVisibility = () => {
      if (document.visibilityState === 'visible') hardResync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', hardResync)
    window.addEventListener('online', hardResync)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', hardResync)
      window.removeEventListener('online', hardResync)
      void supabase.removeChannel(channel)
    }
  }, [startDate, refetchReservations])

  // Mesure de la largeur (→ nombre de jours) ET de la hauteur disponible sous la
  // timeline (→ étirement des rangées en compact). Recalculées au redimensionnement
  // du conteneur (RO) et de la fenêtre (rotation, clavier virtuel, reflow d'en-tête).
  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const measure = () => {
      setContainerW(el.clientWidth)
      setAvailH(window.innerHeight - el.getBoundingClientRect().top)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [startDate])

  // Largeur mini d'un jour : réduite en compact → colonnes plus étroites, plus de
  // jours visibles à l'écran (on ne montre que les zones colorées, pas les noms).
  const dayMinW = isCompact ? COMPACT_DAY_W : MIN_DAY_W
  const visibleDays =
    containerW > 0 ? Math.max(1, Math.floor(containerW / dayMinW)) : 0
  const dayW = visibleDays > 0 ? containerW / visibleDays : dayMinW
  const slotW = dayW / SLOTS_PER_DAY
  // Densité en compact : en-tête + colonne des places rétrécis, et rangées ÉTIRÉES
  // pour remplir la hauteur disponible (14 rangées occupent tout l'écran, sans vide
  // dessous). Bornées entre un mini et un maxi ; au-delà du mini, la page défile.
  const headerH = isCompact ? 52 : HEADER_H
  const labelW = isCompact ? 40 : LABEL_W
  const rowH = isCompact
    ? Math.max(
        COMPACT_MIN_ROW_H,
        Math.min(
          COMPACT_MAX_ROW_H,
          Math.floor((availH - headerH - COMPACT_BOTTOM_GAP) / SPOTS),
        ),
      )
    : ROW_H

  // Agrandissement de la fenêtre chargée quand la vue approche d'un bord (jamais de
  // rétrécissement). Un seul agrandissement couvre même un saut lointain (lien
  // ?date=…) : on prend la borne la plus large entre « +1 palier » et « couvrir la
  // vue ». Le lookback amont capte les séjours débordant dans la vue.
  useEffect(() => {
    if (!startDate || !range || visibleDays <= 0) return
    const visFrom = addDays(startDate, offset)
    const visTo = addDays(startDate, offset + visibleDays - 1)
    const rangeFrom = new Date(range.from + 'T00:00:00')
    const rangeTo = new Date(range.to + 'T00:00:00')
    const earlier = (a: Date, b: Date) => (a < b ? a : b)
    const later = (a: Date, b: Date) => (a > b ? a : b)

    let nextFrom = range.from
    let nextTo = range.to
    if (
      differenceInCalendarDays(visFrom, rangeFrom) <=
      LOAD_EDGE_GUARD + STAY_LOOKBACK_DAYS
    ) {
      nextFrom = format(
        earlier(
          addDays(rangeFrom, -LOAD_EXPAND_DAYS),
          addDays(visFrom, -(STAY_LOOKBACK_DAYS + LOAD_EDGE_GUARD)),
        ),
        'yyyy-MM-dd',
      )
    }
    if (differenceInCalendarDays(rangeTo, visTo) <= LOAD_EDGE_GUARD) {
      nextTo = format(
        later(addDays(rangeTo, LOAD_EXPAND_DAYS), addDays(visTo, LOAD_EDGE_GUARD)),
        'yyyy-MM-dd',
      )
    }
    if (nextFrom !== range.from || nextTo !== range.to) {
      setRange({ from: nextFrom, to: nextTo })
    }
  }, [startDate, range, offset, visibleDays])

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

  // Occupation + alerte "zone critique" de chaque jour affiché.
  // - occupancy : toutes les places occupées (personnel 13 & 14 « en over »
  //   COMPRIS au numérateur) rapportées aux 12 places CLIENT → DÉPASSE 100 %
  //   dès qu'une place tampon 13/14 est prise.
  // - critical : les 12 places client sont TOUTES prises ET on déborde sur le
  //   personnel (13/14) → l'entête du jour passe en rouge (surbooking).
  // Une place n'ayant jamais deux réservations le même jour (hasOverlap
  // l'interdit), compter les réservations couvrant le jour revient à compter les
  // places distinctes. Le décalage absolu du jour i est `offset + i`.
  const dayInfo = useMemo(() => {
    const clientSpots = FIRST_STAFF_SPOT - 1 // 12 places client
    return days.map((_, i) => {
      const o = offset + i
      let occ = 0
      let clientOcc = 0
      let staffOcc = 0
      for (const r of reservations) {
        if (r.startDay <= o && o < r.startDay + r.nights) {
          occ++
          if (r.spot < FIRST_STAFF_SPOT) clientOcc++
          else staffOcc++
        }
      }
      return {
        occupancy: (occ / clientSpots) * 100,
        critical: clientOcc >= clientSpots && staffOcc > 0,
      }
    })
  }, [days, offset, reservations])

  // Impression : 4 feuilles de suivi, TOUJOURS J-1 / aujourd'hui / J+1 / J+2
  // (relatif au jour réel, indépendant de la fenêtre affichée), 2 tableaux par
  // page en paysage. Chaque feuille est pré-remplie avec les clients PRÉSENTS ce
  // jour-là — pas seulement les arrivées : un séjour de plusieurs nuits occupe sa
  // place tous les jours, du jour d'arrivée jusqu'à la veille du départ (une résa
  // de `nights` nuits à partir de `startDay` occupe les jours startDay …
  // startDay+nights-1, comme la barre à l'écran). Check-in / check-out affichent
  // les VRAIES dates d'arrivée et de départ du séjour (pas le jour de la feuille),
  // pour qu'un client déjà là se lise comme tel. Cf. lib/parking/pdf.ts.
  //
  // Rapprochement PDJ (lecture seule) : on essaie de retrouver le n° de chambre
  // de chaque client via le nom, dans les lignes PDJ du même jour. En pratique
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
        // Présent ce jour-là : arrivé au plus tard ce jour, pas encore reparti.
        .filter(
          (r) =>
            r.startDay <= offsets[i] && offsets[i] < r.startDay + r.nights,
        )
        .map((r) => {
          const room = matchRoom(r.client, pdjRows)
          return {
            spot: r.spot,
            nom: r.client,
            numero: room != null ? String(room) : '',
            // Colonne « Facturé? » : reflète le statut. `checkout` = « Non payé »
            // (cf. STATUS) → surtout PAS « Oui ». `reserve` (en attente de paiement)
            // reste vide, à compléter à la main.
            facture:
              r.status === 'paye'
                ? 'Oui'
                : r.status === 'checkout'
                  ? 'Non'
                  : '',
            // Vraies dates du séjour (indépendantes du jour de la feuille).
            checkIn: format(addDays(ref, r.startDay), 'dd/MM'),
            checkOut: format(addDays(ref, r.startDay + r.nights), 'dd/MM'),
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

  /* Primitives d'écriture partagées : état local optimiste + persistance
   * Supabase + gardes (temporelle, anti-chevauchement). Utilisées PAR les
   * handlers ET par l'undo/redo — pas de duplication. Chacune renvoie un
   * booléen : false = action refusée/périmée (l'undo saute alors l'entrée).
   * On lit `reservationsRef.current` (miroir frais) plutôt que `reservations`,
   * pour voir l'état le plus récent même hors cycle de rendu. */

  // Reservation (startDay relatif) → patch DbReservation (start_date absolu).
  // Ne convertit que les clés présentes.
  function toDbPatch(
    patch: ReservationPatch,
    ref: Date,
  ): Partial<Omit<DbReservation, 'id'>> {
    const out: Partial<Omit<DbReservation, 'id'>> = {}
    if (patch.client != null) out.client = patch.client
    if (patch.spot != null) out.spot = patch.spot
    if (patch.nights != null) out.nights = patch.nights
    if (patch.status != null) out.status = patch.status
    if (patch.comment != null) out.comment = patch.comment
    if (patch.startDay != null) out.start_date = startDayToDate(patch.startDay, ref)
    return out
  }

  // Message d'erreur pour un rejet d'écriture par la base. `23P01` = violation
  // de la contrainte anti-chevauchement `EXCLUDE` (place déjà prise sur cette
  // période) — cas normal quand deux modifications concurrentes se croisent,
  // le contrôle client (`hasOverlap`) n'ayant pas encore vu l'autre écriture.
  function describeWriteError(err: unknown): string {
    const code = (err as { code?: string } | null)?.code
    if (code === '23P01') {
      return 'Cette place est déjà occupée sur cette période (une autre modification vient de la prendre) — action annulée.'
    }
    const message = err instanceof Error ? err.message : String(err)
    return `L'enregistrement a échoué — ${message}`
  }

  // Insère une résa (nouvelle, collée, ou ré-insérée par un undo de suppression).
  function applyCreate(res: Reservation): boolean {
    if (!startDate) return false
    if (!canCreateReservation(res.startDay, todayOffset, level)) return false
    if (hasOverlap(reservationsRef.current, res.spot, res.startDay, res.nights))
      return false
    setActionError(null)
    setReservations((prev) =>
      prev.some((r) => r.id === res.id) ? prev : [...prev, res],
    )
    createReservation({
      id: res.id,
      spot: res.spot,
      client: res.client,
      start_date: startDayToDate(res.startDay, startDate),
      nights: res.nights,
      status: res.status,
      comment: res.comment,
    }).catch((err) => {
      console.error(err)
      setReservations((prev) => prev.filter((r) => r.id !== res.id))
      setActionError(describeWriteError(err))
    })
    return true
  }

  function applyDelete(id: string): boolean {
    const target = reservationsRef.current.find((r) => r.id === id)
    if (!target) return false
    if (!canEditReservation(target, todayOffset, level)) return false
    setReservations((prev) => prev.filter((r) => r.id !== id))
    deleteReservation(id).catch(console.error)
    return true
  }

  // Patche les seuls champs fournis (préserve le reste, dont le travail concurrent).
  function applyUpdate(id: string, patch: ReservationPatch): boolean {
    if (!startDate) return false
    const target = reservationsRef.current.find((r) => r.id === id)
    if (!target) return false
    if (!canEditReservation(target, todayOffset, level)) return false
    const geometry =
      patch.spot != null || patch.startDay != null || patch.nights != null
    if (geometry) {
      const spot = patch.spot ?? target.spot
      const startDay = patch.startDay ?? target.startDay
      const nights = patch.nights ?? target.nights
      if (hasOverlap(reservationsRef.current, spot, startDay, nights, id))
        return false
    }
    setActionError(null)
    const before = target
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    )
    updateReservation(id, toDbPatch(patch, startDate)).catch((err) => {
      console.error(err)
      setReservations((prev) => prev.map((r) => (r.id === id ? before : r)))
      setActionError(describeWriteError(err))
    })
    return true
  }

  const { record, undo, redo } = useParkingHistory({
    applyCreate,
    applyDelete,
    applyUpdate,
  })

  // Ctrl+Z / Ctrl+Y : inerte pendant un geste (drag) ou un placement (copie
  // accrochée au curseur), sinon rejouerait une action à moitié posée.
  useUndoRedoShortcut(
    () => {
      if (interactingRef.current || clipboard) return
      undo()
    },
    () => {
      if (interactingRef.current || clipboard) return
      redo()
    },
  )

  function addReservation(startDay: number, spot: number) {
    if (!canEdit || !startDate) return
    const res: Reservation = {
      id: crypto.randomUUID(),
      client: '',
      spot,
      startDay,
      nights: 1,
      status: 'reserve',
      comment: '',
    }
    if (!applyCreate(res)) return
    record({ kind: 'create', snapshot: res })
    setEditingId(res.id)
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
    const res: Reservation = {
      id: crypto.randomUUID(),
      client: clipboard.client,
      spot,
      startDay,
      nights: clipboard.nights,
      status: clipboard.status,
      comment: clipboard.comment,
    }
    // La garde du passé verrouillé (borne sur l'arrivée) est dans applyCreate.
    if (!applyCreate(res)) return
    record({ kind: 'create', snapshot: res })
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
    const target = reservations.find((r) => r.id === id)
    if (!target) return
    const comment = commentDraft.trim()
    const status = pendingStatus
    if (status && !comment) return // justification obligatoire
    // Patch limité aux champs touchés (le statut ne part qu'avec sa justification).
    const after: ReservationPatch = status ? { comment, status } : { comment }
    const before: ReservationPatch = status
      ? { comment: target.comment, status: target.status }
      : { comment: target.comment }
    if (!applyUpdate(id, after)) return
    record({ kind: 'update', id, before, after })
    setCommentId(null)
    setPendingStatus(null)
  }

  function setStatus(id: string, status: Status) {
    if (!canEdit) return
    const current = reservations.find((r) => r.id === id)
    if (!current || current.status === status) return
    if (!canEditReservation(current, todayOffset, level)) return
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
    const before: ReservationPatch = { status: current.status }
    if (!applyUpdate(id, { status })) return
    record({ kind: 'update', id, before, after: { status } })
  }

  function rename(id: string, value: string) {
    if (!canEdit) return
    const target = reservations.find((r) => r.id === id)
    if (!target) return
    const client = value.trim()
    if (client === target.client) return
    const before: ReservationPatch = { client: target.client }
    if (!applyUpdate(id, { client })) return
    record({ kind: 'update', id, before, after: { client } })
  }

  function remove(id: string) {
    if (!canEdit) return
    const target = reservations.find((r) => r.id === id)
    if (!target) return
    const snapshot: Reservation = { ...target }
    if (!applyDelete(id)) return
    record({ kind: 'delete', snapshot })
  }

  function startInteraction(
    e: ReactPointerEvent,
    res: Reservation,
    mode: Mode,
  ) {
    if (!canEdit) return
    if (!startDate) return
    // Ctrl/Cmd + clic = copie rapide (accroche au curseur), sans déplacement.
    // Copier reste permis même sur une résa passée (elle sera recréée dans
    // l'actualité) ; seuls déplacement et redimensionnement sont verrouillés.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      copyReservation(res)
      return
    }
    // Déplacer/redimensionner le passé verrouillé exige la gestion.
    if (!canEditReservation(res, todayOffset, level)) return
    e.preventDefault()
    e.stopPropagation()
    interactingRef.current = true
    const startX = e.clientX
    const startY = e.clientY
    const orig = { ...res }
    const w = dayW
    const startOffset = offset

    /*
     * Auto-défilement au bord (edge auto-scroll) : quand le curseur atteint le
     * bord gauche/droit du planning pendant un geste, la vue AVANCE toute seule
     * dans les jours — on étend ou déplace un séjour AU-DELÀ de la fenêtre visible
     * sans lâcher la souris.
     *
     * Le planning panoramique en changeant `offset` ; la position d'une barre se
     * déduisait jusqu'ici du seul déplacement du curseur. Il faut donc AJOUTER les
     * jours auto-défilés (`panSteps`) au delta, sinon la barre décrocherait du
     * curseur à chaque cran de défilement.
     */
    const timelineEl = timelineRef.current
    const EDGE = 48 // largeur de la zone-bord déclenchant l'auto-défilement (px)
    const PAN_MS = 100 // cadence de l'auto-défilement (~10 jours/s)
    let lastX = e.clientX
    let lastY = e.clientY
    let panSteps = 0 // jours défilés par l'auto-scroll depuis le début du geste
    let panDir = 0 // -1 (passé), 0 (aucun), +1 (futur)
    let rafId = 0
    let lastTick = 0

    // Applique la position visée depuis la DERNIÈRE position du curseur + les
    // jours auto-défilés. Appelé au déplacement ET à chaque tick d'auto-scroll.
    const applyPosition = () => {
      const dDay = Math.round((lastX - startX) / w) + panSteps
      const dRow = Math.round((lastY - startY) / rowH)
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
      // Écriture : borne le geste au domaine éditable (le début ne recule pas dans
      // le passé verrouillé, la fin n'y est pas ramenée). La gestion n'est pas bridée.
      ;({ startDay, nights } = clampSpanToEditable(
        { startDay, nights },
        orig,
        mode,
        todayOffset,
        level,
      ))
      setReservations((prev) => {
        // Geste refusé si la position visée chevauche une autre réservation.
        if (hasOverlap(prev, spot, startDay, nights, res.id)) return prev
        return prev.map((r) =>
          r.id === res.id ? { ...r, spot, startDay, nights } : r,
        )
      })
    }

    // Boucle d'auto-défilement : tant que le curseur reste sur un bord, on avance
    // d'un jour toutes les PAN_MS et on réapplique la position (curseur immobile
    // sur le bord → la barre suit le défilement, le séjour s'étend).
    const tick = (t: number) => {
      if (panDir === 0) {
        rafId = 0
        return
      }
      if (lastTick === 0 || t - lastTick >= PAN_MS) {
        lastTick = t
        panSteps += panDir
        setOffset(startOffset + panSteps)
        applyPosition()
      }
      rafId = requestAnimationFrame(tick)
    }

    // Détermine la direction d'auto-défilement selon la proximité des bords.
    const updatePanDir = () => {
      if (!timelineEl) {
        panDir = 0
        return
      }
      const rect = timelineEl.getBoundingClientRect()
      panDir =
        lastX < rect.left + EDGE ? -1 : lastX > rect.right - EDGE ? 1 : 0
      if (panDir !== 0 && rafId === 0) {
        lastTick = 0
        rafId = requestAnimationFrame(tick)
      }
    }

    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX
      lastY = ev.clientY
      applyPosition()
      updatePanDir()
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (rafId) cancelAnimationFrame(rafId)
      interactingRef.current = false
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
        // Historise le geste : patch géométrique (place/jour/durée) seulement.
        record({
          kind: 'update',
          id: res.id,
          before: {
            spot: orig.spot,
            startDay: orig.startDay,
            nights: orig.nights,
          },
          after: { spot: r.spot, startDay: r.startDay, nights: r.nights },
        })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Au clic droit sur une zone vide, on mémorise la case visée ;
  // "Nouvelle réservation" du menu contextuel l'utilise ensuite.
  function captureCell(e: ReactMouseEvent<HTMLDivElement>) {
    pendingCell.current = pointerToCell(e, dayW, offset, visibleDays, rowH)
  }

  /*
   * Défilement au clic-glissé (drag-to-scroll), sur une zone vide du planning.
   *
   * Changement de paradigme demandé — SANS scrollbar et SANS conteneur défilant :
   * le planning n'a pas de vrai scroll (fenêtre de `visibleDays` colonnes qui
   * remplit la largeur), il PANORAMIQUE en changeant `offset` (jours depuis le
   * lundi de réf.). Le glissé pilote donc ce MÊME `offset` — la logique de base
   * (flèches, clavier, calendrier) reste intacte et fonctionne en parallèle ;
   * on ne fait qu'ajouter une nouvelle entrée sur le même mécanisme.
   *
   * Le pas est le jour (largeur d'une colonne) : « attraper » la grille et tirer
   * vers la droite révèle le passé (offset diminue), tirer à gauche, le futur.
   * Disponible à TOUS les rôles (c'est de la navigation, pas de l'édition). Les
   * barres, poignées et champ d'édition arrêtent la propagation de leur propre
   * `pointerdown` → aucun conflit avec le déplacement d'une réservation.
   */
  function startPan(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return // bouton gauche seulement (le droit ouvre le menu)
    if (clipboard) return // pas pendant un placement (copie accrochée au curseur)
    const startX = e.clientX
    const startOffset = offset
    const w = dayW
    setPanning(true)
    const onMove = (ev: PointerEvent) => {
      // `dDay` absolu depuis le point de départ → insensible aux re-rendus.
      setOffset(startOffset + Math.round((startX - ev.clientX) / w))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setPanning(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Aller directement à une date choisie dans le calendrier (devient le 1er jour affiché).
  function goToDate(date?: Date) {
    if (!date || !startDate) return
    setOffset(differenceInCalendarDays(date, startDate))
    setCalOpen(false)
  }

  // Plage de dates affichée en titre (haut à gauche), façon autres pages. En
  // compact, le titre est VIDE : les jours/dates figurent déjà dans l'en-tête
  // des colonnes, et l'année ne dit rien d'utile (on la connaît déjà) — ne fait
  // que prendre de la place dans une barre déjà serrée sur petit écran.
  const rangeLabel = (() => {
    if (days.length === 0 || isCompact) return ''
    const first = days[0]
    const last = days[days.length - 1]
    return first.getFullYear() === last.getFullYear()
      ? `${fmtDay.format(first)} – ${fmtDayYear.format(last)}`
      : `${fmtDayYear.format(first)} – ${fmtDayYear.format(last)}`
  })()

  // Gate de PREMIER affichage seulement : l'en-tête et la colonne des places
  // sont rendus tout de suite, seul le corps du planning part en squelette tant
  // que le lundi de réf. (`startDate`), le cache (`rows`) ou la mesure de largeur
  // (`visibleDays`, via le ResizeObserver sur `timelineRef`) manquent. Une fois
  // les trois prêts, `loading` retombe à false — aucun squelette persistant, et
  // les patchs realtime/optimistes de l'état local `reservations` ne passent
  // jamais par ici.
  const loading = !startDate || rows === undefined || visibleDays === 0

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
          `repeating-linear-gradient(to bottom, rgba(148,163,184,0.10) 0 1px, transparent 1px ${rowH}px)`,
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
            {/* Groupe « actions de page » : aide + vue analytique + impression. */}
            <ButtonGroup>
              <Tip label="Comment ça marche">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setHelpOpen(true)}
                  aria-label="Comment ça marche"
                >
                  <HelpGlyph />
                </Button>
              </Tip>
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
            </ButtonGroup>
            {/* Groupe « navigation temporelle », collé au bord droit. */}
            <StepNav
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

      {actionError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Planning */}
      <div className="flex overflow-hidden rounded-2xl border border-border bg-card">
        {/* Colonne fixe des places */}
        <div
          className="shrink-0 border-r border-border"
          style={{ width: labelW }}
        >
          <div
            className="flex items-center justify-center text-xs font-medium text-muted-foreground"
            style={{ height: headerH }}
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
              style={{ height: rowH }}
            >
              {s === PMR_SPOT ? (
                <span
                  role="img"
                  aria-label="Place PMR (personne à mobilité réduite)"
                  title="Place PMR (personne à mobilité réduite)"
                >
                  <PmrGlyph className="size-7" />
                </span>
              ) : (
                <span className="font-medium tabular-nums">{s}</span>
              )}
            </div>
          ))}
        </div>

        {/* Zone des jours (sans scrollbar : navigation par flèches). Le conteneur
            porteur de `timelineRef` reste TOUJOURS monté — c'est lui que mesure
            le ResizeObserver ; seul son contenu bascule en squelette pendant le
            chargement, sinon la largeur ne serait jamais mesurée et le gate
            resterait bloqué. */}
        <div ref={timelineRef} className="min-w-0 flex-1 overflow-hidden">
          {loading ? (
            // Reflet du corps : même hauteur que la colonne des places (en-tête
            // + rangées) pour ne pas provoquer de saut au passage au planning.
            <div
              className="p-3"
              style={{ height: headerH + SPOTS * rowH }}
            >
              <SkeletonBlock className="h-full rounded-xl" />
            </div>
          ) : (
          <div
            className={cn(
              'relative',
              panning ? 'cursor-grabbing select-none' : 'cursor-grab',
            )}
            // `touch-action: pan-y` : le glissé HORIZONTAL nous revient (panoramique),
            // le défilement VERTICAL de la page reste au navigateur (tactile).
            style={{ width: '100%', touchAction: 'pan-y' }}
            onPointerDown={startPan}
          >
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

            {/* En-tête des jours. En zone critique (12 places client pleines +
                débordement sur le personnel 13/14), tout l'entête passe en rouge. */}
            <div className="flex" style={{ height: headerH }}>
              {days.map((d, i) => {
                const info = dayInfo[i]
                const critical = info.critical
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex flex-col items-center justify-center border-l border-border first:border-l-0',
                      critical
                        ? 'bg-rose-500/10'
                        : i === todayIndex && 'bg-primary/5',
                    )}
                    style={{ width: dayW }}
                    title={
                      critical
                        ? 'Zone critique : places client pleines, débordement sur les places personnel (13 et 14).'
                        : undefined
                    }
                  >
                    <span
                      className={cn(
                        'text-xs font-medium capitalize',
                        critical && 'text-rose-600 dark:text-rose-300',
                      )}
                    >
                      {fmtWeekday.format(d)}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] text-muted-foreground',
                        critical && 'text-rose-500/80 dark:text-rose-300/80',
                      )}
                    >
                      {fmtDay.format(d)}
                    </span>
                    {/* Taux d'occupation du jour (base 12 places client, personnel
                        13/14 « en over » → >100 %), arrondi ; rouge en zone critique. */}
                    <span
                      className={cn(
                        'text-[10px] font-medium tabular-nums',
                        critical
                          ? 'text-rose-500 dark:text-rose-400'
                          : 'text-sky-400',
                      )}
                    >
                      {fmtPctInt(info.occupancy)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Grille + réservations */}
            <div className="relative" style={{ height: SPOTS * rowH }}>
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
                    height: (FIRST_STAFF_SPOT - 1) * rowH,
                  }}
                />
              )}

              {/* Bandes des places personnel */}
              {SPOTS_LIST.filter((s) => s >= FIRST_STAFF_SPOT).map((s) => (
                <div
                  key={s}
                  className="pointer-events-none absolute left-0 right-0 bg-primary/5"
                  style={{ top: (s - 1) * rowH, height: rowH }}
                />
              ))}

              {/* Zone critique (surbooking) : le FOND de toute la colonne devient
                  rouge (aplat, en-tête déjà rouge à part). Il est posé DERRIÈRE les
                  barres, qui restent TRANSLUCIDES → on voit le rouge à travers les
                  zones de réservation (empilement voulu : fond rouge + zones
                  transparentes par-dessus). */}
              {days.map((_, i) =>
                dayInfo[i]?.critical ? (
                  <div
                    key={`crit-${i}`}
                    className="pointer-events-none absolute bg-rose-500/10"
                    style={{
                      left: i * dayW,
                      width: dayW,
                      top: 0,
                      height: SPOTS * rowH,
                    }}
                  />
                ) : null,
              )}

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
                    locked={canEdit && !canEditReservation(r, todayOffset, level)}
                    offset={offset}
                    slotW={slotW}
                    rowH={rowH}
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
                      const cell = pointerToCell(e, dayW, offset, visibleDays, rowH)
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
                          : cn(
                              STATUS[clipboard.status].border,
                              STATUS[clipboard.status].fill,
                              STATUS[clipboard.status].text,
                            ),
                      )}
                      style={barRect(
                        ghost.day,
                        ghost.spot,
                        clipboard.nights,
                        offset,
                        slotW,
                        rowH,
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
          )}
        </div>
      </div>

      {/* Légende — sous le planning. Gestes souris à GAUCHE (le glyphe montre déjà
          le bouton, façon rapro), statuts couleur à DROITE. Les gestes n'existent
          qu'en édition ; en lecture seule, les statuts restent alignés à droite. */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-6 gap-y-2 text-xs',
          canEdit ? 'justify-between' : 'justify-end',
        )}
      >
        {canEdit && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MouseGlyph side="right" />
              nouvelle réservation
            </span>
            <span className="flex items-center gap-1.5">
              <MouseGlyph side="left" />
              déplacer une réservation
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
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

      {/* Modal d'aide : tutoriel factuel de la page (bouton « ? »). Le contenu
          reste en place dessous. */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <HelpDialogHeader
            icon={<HelpGlyph />}
            title="Comment fonctionne le planning parking"
            description="Attribuer les places de parking, jour par jour."
          />
          {/* Seul le corps défile : l'en-tête reste fixe en haut. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ParkingHelpPanel canEdit={canEdit} />
          </div>
        </DialogContent>
      </Dialog>

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
          {/* Raccourci pour le motif le plus courant : remplace le brouillon
              d'un clic, au lieu de le taper à chaque fois. Uniquement en
              justification de « Non payé » (pas en commentaire libre). */}
          {pendingStatus && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setCommentDraft('À régler au checkout')}
              >
                À régler au checkout
              </Button>
            </div>
          )}
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
  /** Résa passée hors fenêtre de grâce : un éditeur `ecriture` ne peut plus la
   * modifier (réservé à la `gestion`). Sans effet pour un lecteur (déjà bridé). */
  locked: boolean
  offset: number
  slotW: number
  rowH: number
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
  locked,
  offset,
  slotW,
  rowH,
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
  // Interactif = éditeur ET résa d'actualité. Une résa passée verrouillée se
  // comporte comme en lecture seule (ni drag, ni poignées, ni menu d'édition),
  // avec un tooltip explicatif à la place.
  const interactive = canEdit && !locked
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
        interactive ? (e) => onStartInteraction(e, r, 'move') : undefined
      }
      onDoubleClick={interactive ? () => onStartEdit(r.id) : undefined}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group absolute flex touch-none items-center gap-1.5 rounded-md border px-1.5 text-xs shadow-sm',
        interactive && 'cursor-grab active:cursor-grabbing',
        locked && 'opacity-60',
        st.border,
        st.fill,
        st.text,
      )}
      style={barRect(r.startDay, r.spot, r.nights, offset, slotW, rowH)}
    >
      {interactive && (
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

      {interactive && (
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

  // Non interactif : lecture seule (aucun menu d'édition). Pour un éditeur bloqué
  // par la fenêtre de grâce, on explique pourquoi via le tooltip ; sinon on garde
  // le tooltip du commentaire.
  if (!interactive) {
    const info = locked ? (
      <TooltipContent side="top" className="max-w-56 select-none">
        Réservation passée — modification réservée à la gestion.
      </TooltipContent>
    ) : (
      tip
    )
    return (
      <Tooltip>
        <TooltipTrigger asChild>{bar}</TooltipTrigger>
        {info}
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
