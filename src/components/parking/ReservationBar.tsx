import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Copy, MessageSquare, Pencil, Trash2 } from 'lucide-react'

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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { arrivalSlot, PMR_GLYPH, SLOTS_PER_DAY } from '#/lib/parking/model.ts'
import type { Mode, Reservation, Status } from '#/lib/parking/model.ts'
import { lastTouchLabel } from '#/lib/parking/format.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Présentation d'une RÉSERVATION sur le planning parking : la barre elle-même,
 * sa palette de statuts, sa géométrie en pixels, et le pictogramme PMR de la
 * colonne des places.
 *
 * Extrait de `ParkingBoard` pour être la SOURCE UNIQUE de ce rendu : le planning
 * l'utilise pour les vraies réservations, et le panneau d'aide
 * (`ParkingHelpPanel`) pour ses exemples illustrés — une légende dessinée à la
 * main finirait par mentir sur ce que le planning affiche.
 *
 * `ReservationBar` ne lit AUCUN état du board : tout passe par ses props, et
 * avec `canEdit={false}` elle est inerte (ni glisser, ni poignées, ni menu).
 */

export const BAR_PAD_X = 2 // marge horizontale d'une barre (px)
export const BAR_PAD_Y = 4 // marge verticale d'une barre (px)

/* Le fond d'une barre n'est qu'une teinte à 15 % : il vaut presque le fond de la
 * page. Le texte doit donc contraster avec CE fond-là, pas avec la teinte —
 * d'où une encre foncée en clair et claire en sombre, jamais l'une des deux
 * seule (un texte clair sur fond clair devient invisible, et réciproquement). */
// Style d'une barre éclaté en `border` / `fill` (teinte 15 %) / `text` / `dot`.
// La teinte `fill` est posée sur un fond OPAQUE (bg-card) : la barre garde son
// rendu habituel MAIS ne laisse rien transparaître dessous (utile en zone
// critique, fond rouge derrière). Le point (`dot`) sert à la légende / au menu.
export const STATUS: Record<
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
  gratuite: {
    label: 'Gratuité',
    border: 'border-sky-500/50',
    fill: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-100',
    dot: 'bg-sky-500',
  },
}
export const STATUS_ORDER: Status[] = ['reserve', 'paye', 'checkout', 'employe', 'gratuite']

// Géométrie (pixels) d'une barre sur la grille — partagée par ReservationBar et
// le fantôme de placement. Reste côté présentation (dépend des constantes de
// layout locales ROW_H / BAR_PAD_*), le domaine « slots » vivant dans model.ts.
export function barRect(
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

// Pictogramme « fauteuil roulant » (PMR), affiché à la place du numéro de la place
// PMR. SVG (potrace) issu de la SOURCE UNIQUE `PMR_GLYPH` (model.ts, partagée avec
// le PDF) ; `currentColor` → suit la couleur du texte, se dimensionne via `className`.
export function PmrGlyph({ className }: { className?: string }) {  return (
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

export function ReservationBar({
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

  // Contenu du survol : le commentaire s'il y en a un, et TOUJOURS la dernière
  // intervention sur la réservation. Séparés par un filet quand les deux sont
  // là, pour que la note du client ne se confonde pas avec l'horodatage.
  const lastTouch = lastTouchLabel(r)
  const tip = (r.comment || lastTouch) && (
    <TooltipContent side="top" className="max-w-56 select-none">
      {r.comment && <span className="block">{r.comment}</span>}
      {lastTouch && (
        <span
          className={cn(
            'block text-[0.7rem] opacity-80',
            r.comment && 'mt-1 border-t border-current/20 pt-1',
          )}
        >
          {lastTouch}
        </span>
      )}
    </TooltipContent>
  )

  // Non interactif : lecture seule (aucun menu d'édition). Pour un éditeur bloqué
  // par la fenêtre de grâce, on explique pourquoi via le tooltip ; sinon on garde
  // le tooltip du commentaire.
  if (!interactive) {
    const info = locked ? (
      <TooltipContent side="top" className="max-w-56 select-none">
        <span className="block">
          Réservation passée — modification réservée à la gestion.
        </span>
        {lastTouch && (
          <span className="mt-1 block border-t border-current/20 pt-1 text-[0.7rem] opacity-80">
            {lastTouch}
          </span>
        )}
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
