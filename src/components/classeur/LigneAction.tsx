import type { DragEvent } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '#/lib/utils.ts'

/**
 * Ligne d'action du panneau de l'accueil d'un classeur (décision
 * utilisateur du 2026-10-04 : un panneau en liste, façon page de réglages,
 * à la place de la grille de tuiles jugée « éclatée »).
 *
 * Toutes les lignes ont la MÊME hauteur (`h-14`, `h-16` au doigt) : icône
 * dans un carré à gauche, titre et description sur UNE ligne chacun au
 * centre (la description passe sur deux lignes sous `sm` plutôt que
 * d'être coupée : elles tiennent dans la même hauteur), chevron à droite
 * (un `Loader2` quand l'action est en cours).
 * `creation` teinte le carré de l'icône (Nouveau chapitre) ; `survolDepot`
 * montre qu'un fichier glissé peut être lâché sur la ligne (Importer).
 */
export function LigneAction({
  icon: Icon,
  title,
  description,
  titreOccupe,
  onClick,
  disabled = false,
  busy = false,
  creation = false,
  survolDepot = false,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  icon: LucideIcon
  title: string
  description: string
  /** Titre affiché pendant l'action (« Export en cours... »). */
  titreOccupe?: string
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  creation?: boolean
  survolDepot?: boolean
  onDragEnter?: (e: DragEvent<HTMLButtonElement>) => void
  onDragOver?: (e: DragEvent<HTMLButtonElement>) => void
  onDragLeave?: (e: DragEvent<HTMLButtonElement>) => void
  onDrop?: (e: DragEvent<HTMLButtonElement>) => void
}) {
  const inactif = disabled || busy
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactif}
      aria-busy={busy || undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-ligne-action=""
      className={cn(
        'flex h-14 w-full items-center gap-3 px-4 text-left transition-colors pointer-coarse:h-16',
        'hover:bg-muted/50',
        'focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
        'disabled:pointer-events-none disabled:opacity-50',
        survolDepot && 'bg-primary/10 hover:bg-primary/10',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md',
          creation || survolDepot
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-foreground/80',
        )}
        data-testid="ligne-action-icone"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {busy && titreOccupe !== undefined ? titreOccupe : title}
        </span>
        <span
          className="text-xs text-muted-foreground max-sm:line-clamp-2 sm:truncate"
          data-testid="ligne-action-description"
        >
          {survolDepot ? 'Déposez le fichier ici' : description}
        </span>
      </span>
      {busy ? (
        <Loader2
          className="size-4 shrink-0 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </button>
  )
}
