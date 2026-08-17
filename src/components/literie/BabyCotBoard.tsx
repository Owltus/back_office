import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  addDays,
  differenceInCalendarDays,
  format,
  getISOWeek,
  isSameDay,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarDays, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { SkeletonBlock } from '#/components/shared/skeleton/SkeletonBlock.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import { BabyCotHelpPanel } from '#/components/literie/BabyCotHelpPanel.tsx'
import { useUndoRedoShortcut } from '#/components/shared/useUndoRedoShortcut.ts'
import { useCotHistory } from '#/components/literie/useCotHistory.ts'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Calendar } from '#/components/ui/calendar.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { hasOverlapWithAny } from '#/lib/baby-cots/model.ts'
import type { CotAssignment, DbCotAssignment } from '#/lib/baby-cots/types.ts'
import type { CotAssignmentPatch } from '#/lib/baby-cots/history.ts'
import {
  createAssignment,
  deleteAssignment,
  fetchAssignments,
  fetchCots,
  toCotAssignment,
  updateAssignment,
} from '#/lib/baby-cots/service.ts'
import { canCreateAssignment, canEditAssignment } from '#/lib/baby-cots/editability.ts'
import { supabase } from '#/lib/supabase.ts'
import { clamp, cn } from '#/lib/utils.ts'

/* --------------------------------------------------------------------------
 * Planning des lits parapluie bébé — RÉPLIQUE FIDÈLE du geste d'édition de
 * ParkingBoard.tsx (2026-08-17) : clic DROIT sur une case vide crée
 * l'assignation immédiatement (`label: ''`) et enchaîne sur un renommage EN
 * LIGNE (input dans le bloc) ; double-clic sur un bloc rouvre ce même
 * renommage ; poignées de redimensionnement aux bords ; menu contextuel sur
 * un bloc existant (Renommer / Commentaire / Supprimer). Aucun dialog de
 * création/édition, aucun champ « chambre » — `label` est un texte LIBRE
 * (vide par défaut), exactement comme `client` sur `parking_reservations`
 * (cf. supabase/baby_cot_assignments_label.sql). Écart assumé par rapport à
 * Parking : pas de statut (aucun champ `status` sur les lits bébé) ni de
 * « Copier » (peu de lits, peu de gain) — tout le reste (drag, resize, undo,
 * menu contextuel, commentaire) réplique le même geste.
 *
 * Largeur des colonnes jour : PAS le mécanisme de Parking (ResizeObserver +
 * `containerW` + `dayW` calculé en pixels + `offset`/`panSteps` pixel-perfect).
 * Ici, esprit `.rapro-floors` (`grid-template-columns: repeat(N, 1fr)`) : une
 * fenêtre AFFICHÉE de `VISIBLE_DAYS` jours FIXE, dont les colonnes se
 * répartissent en CSS pur (`grid-template-columns: repeat(VISIBLE_DAYS, 1fr)`
 * pour les bandes mois/jours, positions en POURCENTAGE pour les blocs
 * d'assignation) — c'est le NAVIGATEUR qui étire/rétrécit, aucune mesure JS de
 * largeur, aucun état de pixels. `offset` (jours depuis `range.from`) ne sert
 * qu'à choisir QUELS jours de la fenêtre CHARGÉE (`range`, fixe) sont affichés
 * — navigation par `StepNav` / flèches clavier / bouton « aujourd'hui ».
 * Auto-décalage en bord de geste (drag/resize) : `offset` avance ou recule
 * d'un jour à intervalle régulier tant que le pointeur reste au bord — pas de
 * panoramique pixel (il n'y a pas de scroll), juste un décalage du
 * sous-ensemble de jours affiché. NE PAS RETOUCHER cette partie (sous-chantier
 * juste terminé et validé).
 *
 * Le bloc temps réel (chargement en cache + souscription `postgres_changes` +
 * fusion par id + rattrapage sur coupure silencieuse) est une copie fidèle du
 * pattern durci dans ParkingBoard.tsx — NE PAS LE MODIFIER, ne pas le réinventer
 * partiellement.
 *
 * Portée volontairement réduite par rapport à Parking (peu de lits, cf. plan) :
 *   - chargement TOUJOURS fixe (`LOAD_PAST_DAYS`/`LOAD_FUTURE_DAYS`), pas
 *     d'agrandissement de fenêtre à la navigation (pas de `LOAD_EDGE_GUARD`) :
 *     seul ce qui est AFFICHÉ (la fenêtre `VISIBLE_DAYS` à partir d'`offset`)
 *     change ; les données chargées (`assignments`) couvrent toute la plage fixe.
 *   - pas de mode compact (densité mobile) ni de panoramique par clic-glissé
 *     sur le fond : StepNav + flèches clavier suffisent pour 4 lits.
 *   - dates CALENDAIRES absolues (`startDate`/`endDate`), pas de `startDay`
 *     relatif + demi-journées : une case = un jour entier.
 * ------------------------------------------------------------------------ */

const LOAD_PAST_DAYS = 60 // fenêtre CHARGÉE fixe : 60 jours passés
const LOAD_FUTURE_DAYS = 120 // … 120 jours futurs
const VISIBLE_DAYS = 8 // fenêtre AFFICHÉE fixe (jours) — colonnes en CSS `1fr`, aucune mesure JS
const ROW_H = 44
const HEADER_H = 44 // 2 lignes (jour de semaine + date), même esprit que Parking (HEADER_H=52, 3 lignes avec le taux d'occupation — non pertinent ici)
const LABEL_W = 48 // colonne étroite : juste le numéro du lit (comme Parking, LABEL_W=56)
const EDGE_PX = 48 // zone-bord (pointeur) déclenchant l'auto-décalage de fenêtre
const EDGE_STEP_MS = 180 // cadence de l'auto-décalage (un jour entier, pas de pan pixel)
const STEP = 4 // pas de navigation (jours, moitié de VISIBLE_DAYS) — StepNav + flèches clavier

type Mode = 'move' | 'resize-left' | 'resize-right'

/** 'YYYY-MM-DD' décalé de `delta` jours (heure locale). */
function shiftDate(date: string, delta: number): string {
  return format(addDays(new Date(date + 'T00:00:00'), delta), 'yyyy-MM-dd')
}

export function BabyCotBoard() {
  const { can, pageLevel } = useAuth()
  const canEdit = can('literie', 'ecriture')
  const level = pageLevel('literie')

  // « Aujourd'hui » posé côté client seulement (évite un décalage d'hydratation,
  // même précaution que le lundi de référence de ParkingBoard).
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    setToday(format(new Date(), 'yyyy-MM-dd'))
  }, [])

  // Fenêtre de dates CHARGÉE, FIXE (pas de croissance à la navigation,
  // contrairement au parking) : 60 jours passés / 120 jours futurs suffisent
  // pour un volume de quelques lits.
  const range = useMemo(() => {
    if (!today) return null
    const t = new Date(today + 'T00:00:00')
    return {
      from: format(addDays(t, -LOAD_PAST_DAYS), 'yyyy-MM-dd'),
      to: format(addDays(t, LOAD_FUTURE_DAYS), 'yyyy-MM-dd'),
    }
  }, [today])

  // Nombre total de jours COUVERTS par le chargement — borne `offset` (la
  // fenêtre affichée ne doit jamais sortir des données chargées).
  const totalDays = useMemo(() => {
    if (!range) return 0
    return (
      differenceInCalendarDays(
        new Date(range.to + 'T00:00:00'),
        new Date(range.from + 'T00:00:00'),
      ) + 1
    )
  }, [range])

  function dayIndex(date: string): number {
    if (!range) return 0
    return differenceInCalendarDays(
      new Date(date + 'T00:00:00'),
      new Date(range.from + 'T00:00:00'),
    )
  }

  function dateFromIndex(idx: number): string {
    if (!range) return ''
    return format(addDays(new Date(range.from + 'T00:00:00'), idx), 'yyyy-MM-dd')
  }

  function clampOffset(o: number): number {
    return clamp(o, 0, Math.max(0, totalDays - VISIBLE_DAYS))
  }

  // `offset` = index (0-based depuis `range.from`) du premier jour AFFICHÉ.
  // Pilote UNIQUEMENT quelle tranche de `VISIBLE_DAYS` jours de la fenêtre
  // chargée est visible — jamais de calcul de pixels, jamais de scroll.
  const [offset, setOffset] = useState(0)

  const days = useMemo(() => {
    if (!range) return [] as Date[]
    const from = new Date(range.from + 'T00:00:00')
    return Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(from, offset + i))
  }, [range, offset])

  // Plages de jours ouvrés (lundi→vendredi) visibles, pour le n° de semaine
  // ISO en filigrane — copie fidèle de ParkingBoard (positions en POURCENTAGE
  // de `VISIBLE_DAYS` au lieu de pixels, seule adaptation).
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

  // Cadrage initial sur aujourd'hui (une fois la fenêtre de dates connue) :
  // aujourd'hui à la 3e position visible (2 jours de passé), borné pour ne
  // jamais sortir aujourd'hui de l'écran ni des données chargées.
  const framedInit = useRef(false)
  useEffect(() => {
    if (framedInit.current || !range || !today) return
    framedInit.current = true
    setOffset(clampOffset(dayIndex(today) - Math.min(2, VISIBLE_DAYS - 1)))
  }, [range, today])

  // Raccourcis clavier : ← / → naviguent d'une semaine, Alt ramène à
  // aujourd'hui (ignorés dans un champ de saisie, même garde que ParkingBoard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setOffset((o) => clampOffset(o - STEP))
      else if (e.key === 'ArrowRight') setOffset((o) => clampOffset(o + STEP))
      else if (e.key === 'Alt' && !e.repeat) {
        e.preventDefault()
        goToday()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalDays])

  // Cible du bouton « Aujourd'hui » (sert aussi à son état désactivé).
  const framedOffset =
    range && today ? clampOffset(dayIndex(today) - Math.min(2, VISIBLE_DAYS - 1)) : 0
  function goToday() {
    if (!range || !today) return
    setOffset(framedOffset)
  }

  // Sélecteur de date (calendrier) — même principe que ParkingBoard : cadre
  // la date choisie à la 3e position visible, comme « Aujourd'hui ».
  const [calOpen, setCalOpen] = useState(false)
  // Modal d'aide : tutoriel factuel de la page (bouton « ? » de la barre
  // d'actions) — même principe que ParkingBoard.
  const [helpOpen, setHelpOpen] = useState(false)
  function goToDate(date: Date | undefined) {
    if (!date || !range) return
    const iso = format(date, 'yyyy-MM-dd')
    setOffset(clampOffset(dayIndex(iso) - Math.min(2, VISIBLE_DAYS - 1)))
    setCalOpen(false)
  }

  /*
   * Défilement au clic-glissé (drag-to-scroll) sur une zone vide du planning
   * — copie fidèle de `startPan` de ParkingBoard. Pas de vrai scroll (la
   * fenêtre affichée fait toujours `VISIBLE_DAYS` colonnes qui remplissent la
   * largeur) : le glissé pilote directement `offset`, en PLUS des flèches/
   * clavier/calendrier déjà en place (même mécanisme, une entrée de plus).
   * Tirer vers la droite révèle le passé (offset diminue), vers la gauche le
   * futur. Bouton gauche seulement (le droit ouvre le menu contextuel).
   * Disponible à TOUS les niveaux (navigation, pas édition) — pas de garde
   * `canEdit`. Les blocs/poignées arrêtent la propagation de leur propre
   * `pointerdown` (cf. `startInteraction`), donc aucun conflit avec le
   * déplacement d'une assignation.
   */
  const [panning, setPanning] = useState(false)
  function startPan(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const grid = gridRef.current
    if (!grid) return
    const dayW = grid.getBoundingClientRect().width / VISIBLE_DAYS
    if (dayW <= 0) return
    const startX = e.clientX
    const startOffset = offset
    setPanning(true)
    const onMove = (ev: PointerEvent) => {
      setOffset(clampOffset(startOffset + Math.round((startX - ev.clientX) / dayW)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setPanning(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Lits ACTIFS : ressource ajustable (baby_cots.active), pas une constante figée.
  // `cots` défaut à `[]` tant que non chargé — évite les assertions non-null en
  // aval (gridBackground, positions, gardes de geste) et laisse `loading`
  // (ci-dessous) seul juge de l'affichage du squelette.
  const { data: cotsData } = useQuery({
    queryKey: ['baby-cots', 'cots'],
    queryFn: fetchCots,
    staleTime: 60_000,
  })
  const cots = cotsData ?? []

  /*
   * Chargement BORNÉ à la fenêtre `range`, `staleTime: 0` : le temps réel tient
   * la vue à jour tant que la page est montée ; au retour, le cache s'affiche
   * aussitôt, le refetch corrige derrière. Même principe que ParkingBoard.
   */
  const {
    data: rows,
    error: rowsError,
    refetch: refetchAssignments,
  } = useQuery({
    queryKey: ['baby-cots', 'assignments', range?.from, range?.to],
    queryFn: () => fetchAssignments(range!.from, range!.to),
    enabled: !!range,
    staleTime: 0,
  })

  useEffect(() => {
    if (rowsError) console.error(rowsError)
  }, [rowsError])

  const [assignments, setAssignments] = useState<CotAssignment[]>([])

  // Posé à `true` juste avant un rechargement de RATTRAPAGE (reconnexion temps
  // réel, retour de veille) : le prochain passage de l'effet ci-dessous doit
  // alors REMPLACER l'état plutôt que fusionner — seul moyen de rattraper une
  // suppression manquée pendant la coupure (une fusion ne supprime jamais).
  const hardResyncRef = useRef(false)

  // FUSION par identifiant (jamais d'écrasement, jamais de suppression ici) :
  // les lignes déjà présentes — patchées par le temps réel — sont PRÉSERVÉES ;
  // la tranche chargée met à jour/ajoute par `id`. EXCEPTION : rattrapage forcé
  // (hardResyncRef) → remplacement complet. Cf. ParkingBoard.tsx (même bloc).
  useEffect(() => {
    if (!rows) return
    if (hardResyncRef.current) {
      hardResyncRef.current = false
      setAssignments(rows.map(toCotAssignment))
      return
    }
    setAssignments((prev) => {
      const byId = new Map(prev.map((a) => [a.id, a]))
      for (const row of rows) byId.set(row.id, toCotAssignment(row))
      return [...byId.values()]
    })
  }, [rows])

  // Miroir à jour pour les handlers de drag (closures figées sur un ancien état).
  const assignmentsRef = useRef<CotAssignment[]>([])
  useEffect(() => {
    assignmentsRef.current = assignments
  }, [assignments])

  // Abonnement Realtime : patche l'état LOCAL ligne à ligne, sans toucher au
  // cache. Un poste laissé inactif longtemps (veille, onglet en arrière-plan)
  // peut perdre le socket temps réel SANS événement de coupure émis → on
  // rattrape par un rechargement complet (a) dès que le canal signale une
  // reconnexion après une coupure détectée, ET (b) en filet de sécurité, dès
  // que l'onglet redevient visible/actif ou que le réseau revient. Copie
  // fidèle du fix ParkingBoard.tsx (session courante).
  useEffect(() => {
    const hardResync = () => {
      hardResyncRef.current = true
      void refetchAssignments()
    }

    let dropped = false

    const channel = supabase
      .channel('baby-cot-assignments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'baby_cot_assignments' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id
            setAssignments((prev) => prev.filter((a) => a.id !== id))
          } else {
            const a = toCotAssignment(payload.new as DbCotAssignment)
            setAssignments((prev) => {
              const i = prev.findIndex((x) => x.id === a.id)
              if (i === -1) return [...prev, a]
              const next = prev.slice()
              next[i] = a
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
  }, [refetchAssignments])

  // Conteneur de la grille (lits × jours) : référence de coordonnées pour
  // convertir une position pointeur (clientX/clientY) en jour/ligne pendant un
  // geste. `getBoundingClientRect()` est relu à CHAQUE conversion (pas de
  // largeur mise en cache dans un état React) : la largeur d'une colonne s'en
  // déduit ponctuellement (`rect.width / VISIBLE_DAYS`), sans ResizeObserver ni
  // état de pixels — la mise en page elle-même reste 100 % CSS.
  const gridRef = useRef<HTMLDivElement>(null)

  const loading = !today || !range || cotsData === undefined || rows === undefined

  // Renommage EN LIGNE (input dans le bloc) : id de l'assignation en cours
  // d'édition, ou null. Ni dialog, ni formulaire — même mécanique que
  // `editingId` de ParkingBoard.
  const [editingId, setEditingId] = useState<string | null>(null)

  // Case visée par le dernier clic droit sur une zone vide (pour "Nouvelle
  // assignation"), capturée AVANT l'ouverture du menu contextuel — même
  // mécanique que `pendingCell` de ParkingBoard (le clic droit du navigateur
  // ne donne pas la position finale autrement).
  const pendingCell = useRef<{ cotId: string; dayIdx: number }>({ cotId: '', dayIdx: 0 })

  // Commentaire : petit textarea minimal dans un dialog réduit (titre +
  // champ), PAS le formulaire complet retiré — même principe que la modale de
  // commentaire de ParkingBoard, sans la justification obligatoire (aucun
  // statut sur les lits bébé).
  const [commentId, setCommentId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')

  /* Primitives d'écriture partagées : état local optimiste + persistance
   * Supabase + gardes (temporelle, anti-chevauchement). Utilisées PAR les
   * handlers ET par l'undo/redo — pas de duplication. Chacune renvoie un
   * booléen : false = action refusée/périmée (l'undo saute alors l'entrée).
   * On lit `assignmentsRef.current` (miroir frais) plutôt que `assignments`,
   * pour voir l'état le plus récent même hors cycle de rendu. Réplique le
   * pattern applyCreate/applyDelete/applyUpdate de ParkingBoard.tsx. */

  function toDbPatch(patch: CotAssignmentPatch) {
    const out: Partial<{
      cot_id: string
      label: string
      start_date: string
      end_date: string
      comment: string
    }> = {}
    if (patch.cotId != null) out.cot_id = patch.cotId
    if (patch.label != null) out.label = patch.label
    if (patch.startDate != null) out.start_date = patch.startDate
    if (patch.endDate != null) out.end_date = patch.endDate
    if (patch.comment != null) out.comment = patch.comment
    return out
  }

  function applyCreate(a: CotAssignment): boolean {
    if (!today) return false
    if (!canCreateAssignment(a.startDate, today, level)) return false
    if (hasOverlapWithAny(assignmentsRef.current, a.cotId, a)) return false
    setAssignments((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]))
    createAssignment({
      id: a.id,
      cot_id: a.cotId,
      label: a.label,
      start_date: a.startDate,
      end_date: a.endDate,
      comment: a.comment,
    }).catch((err) => {
      console.error(err)
      setAssignments((prev) => prev.filter((x) => x.id !== a.id))
    })
    return true
  }

  function applyDelete(id: string): boolean {
    if (!today) return false
    const target = assignmentsRef.current.find((x) => x.id === id)
    if (!target) return false
    if (!canEditAssignment(target, today, level)) return false
    setAssignments((prev) => prev.filter((x) => x.id !== id))
    deleteAssignment(id).catch(console.error)
    return true
  }

  // Patche les seuls champs fournis (préserve le reste, dont le travail concurrent).
  function applyUpdate(id: string, patch: CotAssignmentPatch): boolean {
    if (!today) return false
    const target = assignmentsRef.current.find((x) => x.id === id)
    if (!target) return false
    if (!canEditAssignment(target, today, level)) return false
    const geometry = patch.cotId != null || patch.startDate != null || patch.endDate != null
    if (geometry) {
      const cotId = patch.cotId ?? target.cotId
      const startDate = patch.startDate ?? target.startDate
      const endDate = patch.endDate ?? target.endDate
      if (endDate < startDate) return false
      if (!canEditAssignment({ endDate }, today, level)) return false
      if (hasOverlapWithAny(assignmentsRef.current, cotId, { startDate, endDate }, id))
        return false
    }
    setAssignments((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    updateAssignment(id, toDbPatch(patch)).catch(console.error)
    return true
  }

  const { record, undo, redo } = useCotHistory({ applyCreate, applyDelete, applyUpdate })

  // Vrai le temps d'un drag/redimension : neutralise Ctrl+Z pendant le geste
  // (rejouerait une action à moitié posée).
  const interactingRef = useRef(false)

  useUndoRedoShortcut(
    () => {
      if (interactingRef.current) return
      undo()
    },
    () => {
      if (interactingRef.current) return
      redo()
    },
  )

  // Clic droit sur une case vide : crée l'assignation IMMÉDIATEMENT
  // (`label: ''`, 1 NUIT — comme Parking, `endDate` = jour de départ EXCLU,
  // pas le jour cliqué lui-même), l'historise, puis enchaîne sur le
  // renommage en ligne — même geste que `addReservation` de ParkingBoard.
  function addAssignment(cotId: string, dayIdx: number) {
    if (!canEdit || !today || !cotId) return
    const date = dateFromIndex(dayIdx)
    const a: CotAssignment = {
      id: crypto.randomUUID(),
      cotId,
      label: '',
      startDate: date,
      endDate: shiftDate(date, 1),
      comment: '',
    }
    if (!applyCreate(a)) return
    record({ kind: 'create', snapshot: a })
    setEditingId(a.id)
  }

  function rename(id: string, value: string) {
    if (!canEdit) return
    const target = assignments.find((x) => x.id === id)
    if (!target) return
    const label = value.trim()
    if (label === target.label) return
    const before: CotAssignmentPatch = { label: target.label }
    if (!applyUpdate(id, { label })) return
    record({ kind: 'update', id, before, after: { label } })
  }

  function remove(id: string) {
    if (!canEdit) return
    const target = assignments.find((x) => x.id === id)
    if (!target) return
    const snapshot: CotAssignment = { ...target }
    if (!applyDelete(id)) return
    record({ kind: 'delete', snapshot })
  }

  function openComment(a: CotAssignment) {
    setCommentDraft(a.comment)
    setCommentId(a.id)
  }

  function closeComment() {
    setCommentId(null)
  }

  function saveComment() {
    if (!canEdit) return
    if (commentId === null) return
    const id = commentId
    const target = assignments.find((x) => x.id === id)
    if (!target) return
    const comment = commentDraft.trim()
    const before: CotAssignmentPatch = { comment: target.comment }
    if (!applyUpdate(id, { comment })) return
    record({ kind: 'update', id, before, after: { comment } })
    setCommentId(null)
  }

  // ---- Glisser-déposer (déplacer / redimensionner une assignation) --------

  /* Auto-décalage de fenêtre générique : quand le curseur atteint le bord
   * gauche/droit du conteneur, `offset` avance/recule d'un jour à intervalle
   * régulier tant que le pointeur y reste — PAS un panoramique pixel (il n'y a
   * pas de scroll ici, juste un décalage du sous-ensemble de `VISIBLE_DAYS`
   * jours affiché). `onStep` reçoit la direction (-1/+1) à chaque tick, à
   * charge de l'appelant de mettre à jour son propre curseur (`curOffset`) ET
   * de réappliquer la position en cours. */
  function makeEdgePan(onStep: (dir: -1 | 1) => void) {
    let dir = 0
    let intervalId: ReturnType<typeof setInterval> | null = null
    function updateDir(clientX: number) {
      const el = gridRef.current
      if (!el) {
        dir = 0
        return
      }
      const rect = el.getBoundingClientRect()
      const next = clientX < rect.left + EDGE_PX ? -1 : clientX > rect.right - EDGE_PX ? 1 : 0
      if (next === dir) return
      dir = next
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      if (dir !== 0) {
        intervalId = setInterval(() => onStep(dir as -1 | 1), EDGE_STEP_MS)
      }
    }
    function stop() {
      if (intervalId) clearInterval(intervalId)
      intervalId = null
      dir = 0
    }
    return { updateDir, stop }
  }

  function startInteraction(e: ReactPointerEvent, a: CotAssignment, mode: Mode) {
    if (!canEdit || !today || cots.length === 0) return
    if (!canEditAssignment(a, today, level)) return
    e.preventDefault()
    e.stopPropagation()
    interactingRef.current = true
    const orig = { ...a }
    const origRowIdx = cots.findIndex((c) => c.id === a.cotId)
    if (origRowIdx === -1) {
      interactingRef.current = false
      return
    }
    // Curseur de fenêtre LOCAL au geste (pas l'état React `offset`, qui ne se
    // met à jour qu'au rendu suivant) : toujours à jour pour convertir une
    // position pointeur en jour ABSOLU pendant l'auto-décalage.
    let curOffset = offset

    function dayIdxFromClientX(x: number): number {
      const grid = gridRef.current
      if (!grid || totalDays === 0) return 0
      const rect = grid.getBoundingClientRect()
      const dayW = rect.width / VISIBLE_DAYS
      const rel = clamp(Math.floor((x - rect.left) / dayW), 0, VISIBLE_DAYS - 1)
      return clamp(rel + curOffset, 0, totalDays - 1)
    }

    const startDayIdx = dayIdxFromClientX(e.clientX)
    const startY = e.clientY
    let lastX = e.clientX
    let lastY = e.clientY

    function applyPosition() {
      const currentDayIdx = dayIdxFromClientX(lastX)
      const dDay = currentDayIdx - startDayIdx
      const dRow = Math.round((lastY - startY) / ROW_H)
      let rowIdx = origRowIdx
      let startDate = orig.startDate
      let endDate = orig.endDate
      if (mode === 'move') {
        rowIdx = clamp(origRowIdx + dRow, 0, cots.length - 1)
        startDate = shiftDate(orig.startDate, dDay)
        endDate = shiftDate(orig.endDate, dDay)
      } else if (mode === 'resize-right') {
        endDate = shiftDate(orig.endDate, dDay)
        // Au moins 1 nuit : `endDate` (départ, exclu) ne peut pas revenir
        // jusqu'à `startDate` ni le dépasser.
        if (endDate <= orig.startDate) endDate = shiftDate(orig.startDate, 1)
      } else {
        startDate = shiftDate(orig.startDate, dDay)
        if (startDate >= orig.endDate) startDate = shiftDate(orig.endDate, -1)
      }
      const cotId = cots[rowIdx].id
      // Gardes en TEMPS RÉEL (pas seulement au relâchement) : fenêtre de grâce
      // sur la nouvelle fin, et anti-chevauchement — un geste qui violerait
      // l'une ou l'autre est ignoré, l'assignation reste à sa dernière
      // position valide (même principe que ParkingBoard.applyPosition).
      if (!canEditAssignment({ endDate }, today!, level)) return
      if (hasOverlapWithAny(assignmentsRef.current, cotId, { startDate, endDate }, a.id)) return
      setAssignments((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, cotId, startDate, endDate } : x)),
      )
    }

    const edgePan = makeEdgePan((dir) => {
      curOffset = clampOffset(curOffset + dir)
      setOffset(curOffset)
      applyPosition()
    })

    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX
      lastY = ev.clientY
      applyPosition()
      edgePan.updateDir(lastX)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      edgePan.stop()
      interactingRef.current = false
      const r = assignmentsRef.current.find((x) => x.id === a.id)
      if (
        r &&
        (r.cotId !== orig.cotId || r.startDate !== orig.startDate || r.endDate !== orig.endDate)
      ) {
        updateAssignment(a.id, {
          cot_id: r.cotId,
          start_date: r.startDate,
          end_date: r.endDate,
        }).catch(console.error)
        // Historise le geste : patch géométrique (lit/dates) seulement.
        record({
          kind: 'update',
          id: a.id,
          before: { cotId: orig.cotId, startDate: orig.startDate, endDate: orig.endDate },
          after: { cotId: r.cotId, startDate: r.startDate, endDate: r.endDate },
        })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Au clic droit sur une zone vide, on mémorise la case visée (lit + jour) ;
  // "Nouvelle assignation" du menu contextuel l'utilise ensuite. Même
  // mécanique que `captureCell`/`pointerToCell` de ParkingBoard.
  function captureCell(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const dayW = rect.width / VISIBLE_DAYS
    const rel = clamp(Math.floor((e.clientX - rect.left) / dayW), 0, VISIBLE_DAYS - 1)
    const dayIdx = clamp(rel + offset, 0, Math.max(0, totalDays - 1))
    const rowIdx = clamp(Math.floor((e.clientY - rect.top) / ROW_H), 0, Math.max(0, cots.length - 1))
    pendingCell.current = { cotId: cots[rowIdx]?.id ?? '', dayIdx }
  }

  // Position/largeur en POURCENTAGE de la fenêtre affichée (`VISIBLE_DAYS`
  // colonnes égales) — c'est le CSS qui étire, aucun pixel calculé en JS. Le
  // `+2px`/`-4px` (marge visuelle entre blocs) est le seul appoint en pixels,
  // constant et minime, combiné via `calc()`.
  function dayPct(absIdx: number): number {
    return ((absIdx - offset) / VISIBLE_DAYS) * 100
  }

  const todayDate = today ? new Date(today + 'T00:00:00') : null
  // Index (dans la fenêtre AFFICHÉE) de la colonne "aujourd'hui", -1 si hors
  // champ — sert au surlignage plein-hauteur de sa colonne (pas seulement
  // l'en-tête), même principe que ParkingBoard.
  const todayViewIdx = today ? dayIndex(today) - offset : -1
  const gridHeight = Math.max(4, cots.length) * ROW_H

  // Fond de la grille (lignes de jour + lignes de rangée + capture du clic
  // droit). En lecture seule, rendu tel quel ; pour un éditeur, enveloppé
  // dans le menu contextuel « Nouvelle assignation » — même principe que
  // `gridBackground` de ParkingBoard. Les lignes de jour sont en POURCENTAGE
  // (période `100 % / VISIBLE_DAYS`) plutôt qu'en pixels : pas de mesure JS.
  const gridBackground = (
    <div
      className="absolute inset-0"
      onContextMenu={canEdit ? captureCell : undefined}
      style={{
        backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.18) 0 1px, transparent 1px calc(100%/${VISIBLE_DAYS}))`,
      }}
    >
      {cots.map((cot, rowIdx) => (
        <div
          key={cot.id}
          className="absolute inset-x-0 border-t border-border"
          style={{ top: rowIdx * ROW_H, height: ROW_H }}
        />
      ))}
    </div>
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <PageHeader
        title={
          <>
            Lits bébé
            {!loading && days.length > 0 && (
              <span className="ml-1.5 inline-block align-middle text-sm font-normal text-muted-foreground">
                · {format(days[0], 'd MMM', { locale: fr })} –{' '}
                {format(days[days.length - 1], 'd MMM yyyy', { locale: fr })}
              </span>
            )}
          </>
        }
        actions={
          <>
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
            </ButtonGroup>
            <StepNav
              onPrev={() => setOffset((o) => clampOffset(o - STEP))}
              onNext={() => setOffset((o) => clampOffset(o + STEP))}
              prevLabel="Reculer d’une semaine"
              nextLabel="Avancer d’une semaine"
            >
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Choisir une date"
                  disabled={loading}
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
                      goToday()
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

      {rowsError && (
        <Alert variant="destructive">
          <AlertDescription>
            Erreur de chargement du planning. Réessayez plus tard.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex overflow-hidden rounded-2xl border border-border bg-card">
        {/* Colonne fixe des lits */}
        <div className="shrink-0 border-r border-border" style={{ width: LABEL_W }}>
          <div
            className="flex items-center justify-center border-b border-border text-xs font-medium text-muted-foreground"
            style={{ height: HEADER_H }}
          >
            Lit
          </div>
          {!loading &&
            cots.map((cot) => (
              <div
                key={cot.id}
                className="flex items-center justify-center border-t border-border px-2 text-center text-sm font-medium"
                style={{ height: ROW_H }}
              >
                <span className="font-medium tabular-nums" title={cot.label}>
                  {cot.label.match(/\d+/)?.[0] ?? cot.label}
                </span>
              </div>
            ))}
        </div>

        {/* Zone des jours : fenêtre FIXE de VISIBLE_DAYS colonnes, largeurs en
            CSS pur (`grid-template-columns: repeat(N, 1fr)` pour les bandes,
            pourcentages pour les blocs) — remplit toujours exactement la
            largeur disponible, jamais de barre de défilement horizontale. */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {loading ? (
            <div
              className="p-3"
              style={{ height: HEADER_H + Math.max(4, cots.length) * ROW_H }}
            >
              <SkeletonBlock className="h-full rounded-xl" />
            </div>
          ) : (
            <div
              className={cn(
                'relative',
                panning ? 'cursor-grabbing select-none' : 'cursor-grab',
              )}
              style={{ touchAction: 'pan-y' }}
              onPointerDown={startPan}
            >
              {/* Bordures des week-ends, continues sur en-tête + grille —
                  copie fidèle de ParkingBoard (positions en POURCENTAGE de
                  `VISIBLE_DAYS` au lieu de pixels). */}
              {days.map((d, i) => {
                const day = d.getDay()
                if (day !== 6 && day !== 0) return null
                const leftPct =
                  day === 6 ? (i / VISIBLE_DAYS) * 100 : ((i + 1) / VISIBLE_DAYS) * 100
                return (
                  <div
                    key={`we-${i}`}
                    className="pointer-events-none absolute bottom-0 top-0 w-px bg-foreground/15"
                    style={{ left: `${leftPct}%` }}
                  />
                )
              })}

              {/* Bande jours (seule ligne d'en-tête, comme "Place" sur le
                  parking — pas de bande mois séparée) */}
              <div
                className="grid border-b border-border"
                style={{ height: HEADER_H, gridTemplateColumns: `repeat(${VISIBLE_DAYS}, 1fr)` }}
              >
                {days.map((d, i) => {
                  const isToday = todayDate ? isSameDay(d, todayDate) : false
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex flex-col items-center justify-center border-r border-border/50',
                        isToday && 'bg-primary/5',
                      )}
                    >
                      <span
                        className={cn(
                          'text-xs font-medium capitalize',
                          isToday && 'text-foreground',
                        )}
                      >
                        {format(d, 'EEE', { locale: fr })}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {format(d, 'd MMM', { locale: fr })}
                      </span>
                    </div>
                  )
                })}
              </div>
              {/* Lignes des lits + assignations */}
              <div ref={gridRef} className="relative" style={{ height: gridHeight }}>
                {canEdit ? (
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{gridBackground}</ContextMenuTrigger>
                    <ContextMenuContent
                      className="w-44"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <ContextMenuItem
                        onSelect={() =>
                          addAssignment(pendingCell.current.cotId, pendingCell.current.dayIdx)
                        }
                      >
                        <Plus />
                        Nouvelle assignation
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
                    style={{
                      left: `${(b.index / VISIBLE_DAYS) * 100}%`,
                      width: `${(b.span / VISIBLE_DAYS) * 100}%`,
                    }}
                  >
                    <span className="text-4xl font-bold text-foreground/[0.06]">{b.week}</span>
                  </div>
                ))}

                {/* Colonne du jour actuel (fond plein, toute la hauteur —
                    pas seulement l'en-tête) */}
                {todayViewIdx >= 0 && todayViewIdx < VISIBLE_DAYS && (
                  <div
                    className="pointer-events-none absolute top-0 bg-primary/5"
                    style={{
                      left: `${(todayViewIdx / VISIBLE_DAYS) * 100}%`,
                      width: `${(1 / VISIBLE_DAYS) * 100}%`,
                      height: gridHeight,
                    }}
                  />
                )}

                {cots.flatMap((cot, rowIdx) =>
                  assignments
                    .filter((a) => a.cotId === cot.id)
                    .map((a) => {
                      const startIdx = dayIndex(a.startDate)
                      // `endDate` = jour de départ EXCLU (nuitées, comme Parking) : le
                      // bloc s'arrête à la borne du jour de départ, sans le couvrir
                      // (pas de `+ 1`) — la case du jour de départ reste réutilisable.
                      const endIdx = dayIndex(a.endDate)
                      const locked = canEdit && !canEditAssignment(a, today, level)
                      // `+0.5` jour : le bloc démarre à MI-COLONNE du jour d'arrivée et
                      // finit à mi-colonne du jour de départ — À CHEVAL sur les deux
                      // jours limitrophes, comme les réservations du parking (arrivée
                      // après-midi / départ matin), pas flush sur les bords de colonne.
                      // La largeur (nuitées) reste inchangée : décaler les DEUX bords du
                      // même demi-jour ne change que la position, pas la durée affichée.
                      return (
                        <AssignmentBar
                          key={a.id}
                          a={a}
                          canEdit={canEdit}
                          locked={locked}
                          editing={editingId === a.id}
                          style={{
                            left: `calc(${dayPct(startIdx + 0.5)}% + 2px)`,
                            width: `calc(${((endIdx - startIdx) / VISIBLE_DAYS) * 100}% - 4px)`,
                            top: rowIdx * ROW_H + 4,
                            height: ROW_H - 8,
                          }}
                          onStartInteraction={startInteraction}
                          onStartEdit={setEditingId}
                          onStopEdit={() => setEditingId(null)}
                          onRename={rename}
                          onComment={openComment}
                          onRemove={remove}
                        />
                      )
                    }),
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Légende — sous le planning, même agencement que ParkingBoard : gestes
          souris à GAUCHE (le glyphe montre déjà le bouton), commentaire à
          DROITE. Les gestes n'existent qu'en édition ; en lecture seule, le
          commentaire reste aligné à droite. Pas de statuts (aucun champ
          `status` sur les lits bébé). */}
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
              nouvelle assignation
            </span>
            <span className="flex items-center gap-1.5">
              <MouseGlyph side="left" />
              déplacer une assignation
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="size-3" />
            Commentaire
          </span>
        </div>
      </div>

      {/* Modal d'aide : tutoriel factuel de la page (bouton « ? »). Le
          contenu reste en place dessous. */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <HelpDialogHeader
            icon={<HelpGlyph />}
            title="Comment fonctionne le planning des lits bébé"
            description="Attribuer les lits parapluie, jour par jour."
          />
          {/* Seul le corps défile : l'en-tête reste fixe en haut. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BabyCotHelpPanel canEdit={canEdit} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale du commentaire — minimale (titre + textarea), pas le
          formulaire complet retiré. */}
      <Dialog
        open={commentId !== null}
        onOpenChange={(open) => {
          if (!open) closeComment()
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
            <Button variant="ghost" onClick={closeComment}>
              Annuler
            </Button>
            <Button onClick={saveComment}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface AssignmentBarProps {
  a: CotAssignment
  canEdit: boolean
  /** Assignation passée hors fenêtre de grâce : un éditeur `ecriture` ne peut
   * plus la modifier (réservé à la `gestion`). Sans effet pour un lecteur
   * (déjà bridé). */
  locked: boolean
  style: React.CSSProperties
  editing: boolean
  onStartInteraction: (e: ReactPointerEvent, a: CotAssignment, mode: Mode) => void
  onStartEdit: (id: string) => void
  onStopEdit: () => void
  onRename: (id: string, value: string) => void
  onComment: (a: CotAssignment) => void
  onRemove: (id: string) => void
}

function AssignmentBar({
  a,
  canEdit,
  locked,
  style,
  editing,
  onStartInteraction,
  onStartEdit,
  onStopEdit,
  onRename,
  onComment,
  onRemove,
}: AssignmentBarProps) {
  // Interactif = éditeur ET assignation d'actualité. Une assignation passée
  // verrouillée se comporte comme en lecture seule (ni drag, ni poignées, ni
  // menu d'édition), avec un tooltip explicatif à la place.
  const interactive = canEdit && !locked
  const inputRef = useRef<HTMLInputElement>(null)
  // « Renommer » du menu contextuel : on diffère l'entrée en édition à la
  // fermeture du menu (onCloseAutoFocus), pour que l'input monte APRÈS la
  // gestion de focus de Radix — le curseur s'y pose alors sans lutte, comme à
  // la création.
  const pendingEditRef = useRef(false)
  // À l'ouverture de l'édition (double-clic OU menu contextuel « Renommer »),
  // on pose explicitement focus + sélection dans le champ. Indispensable via
  // le menu contextuel : Radix restitue le focus à sa fermeture, ce qui
  // volait le curseur du champ ; on le (re)pose au frame suivant pour gagner
  // la course.
  useEffect(() => {
    if (!editing) return
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      // Curseur en fin de texte, sans sélection : taper une lettre n'efface
      // pas le nom existant — on écrit à la suite, comme à la création.
      const end = el.value.length
      el.setSelectionRange(end, end)
    })
    return () => cancelAnimationFrame(raf)
  }, [editing])
  const commit = (value: string) => {
    onRename(a.id, value)
    onStopEdit()
  }

  // Le bloc lui-même. En lecture seule : ni drag (`onPointerDown`), ni
  // édition inline (`onDoubleClick`), ni poignées de redimensionnement, ni
  // curseur grab.
  const bar = (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={interactive ? (e) => onStartInteraction(e, a, 'move') : undefined}
      onDoubleClick={interactive ? () => onStartEdit(a.id) : undefined}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group absolute flex touch-none items-center gap-1.5 rounded-md border border-primary/50 bg-primary/15 px-1.5 text-xs text-foreground shadow-sm',
        interactive && 'cursor-grab active:cursor-grabbing',
        locked && 'opacity-60',
      )}
      style={style}
    >
      {interactive && (
        <span
          onPointerDown={(e) => onStartInteraction(e, a, 'resize-left')}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md"
        />
      )}

      {editing ? (
        <input
          ref={inputRef}
          defaultValue={a.label}
          placeholder="Nom / chambre"
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
        <span className={cn('min-w-0 flex-1 truncate font-medium', !a.label && 'opacity-50')}>
          {a.label || 'Sans nom'}
        </span>
      )}

      {a.comment && <MessageSquare className="mr-1 size-3 shrink-0 opacity-70" />}

      {interactive && (
        <span
          onPointerDown={(e) => onStartInteraction(e, a, 'resize-right')}
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-md"
        />
      )}
    </div>
  )

  const tip = a.comment && (
    <TooltipContent side="top" className="max-w-56 select-none">
      {a.comment}
    </TooltipContent>
  )

  // Non interactif : lecture seule (aucun menu d'édition). Pour un éditeur
  // bloqué par la fenêtre de grâce, on explique pourquoi via le tooltip ;
  // sinon on garde le tooltip du commentaire.
  if (!interactive) {
    const info = locked ? (
      <TooltipContent side="top" className="max-w-56 select-none">
        Assignation passée — modification réservée à la gestion.
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
            onStartEdit(a.id)
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
        <ContextMenuItem onSelect={() => onComment(a)}>
          <MessageSquare />
          Commentaire
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onRemove(a.id)}>
          <Trash2 />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
