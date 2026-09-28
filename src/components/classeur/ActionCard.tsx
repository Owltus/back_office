import type { DragEvent } from 'react'
import { Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '#/lib/utils.ts'

/**
 * Carte d'action de Registre (liste des classeurs, accueil d'un classeur),
 * dans la grammaire de l'app : carte `bg-card`, icône, titre, sous-titre,
 * survol `bg-accent`. `dashed` distingue la création et l'import ; `busy`
 * remplace l'icône par un `Loader2` et le titre par `titreOccupe`. Les
 * gestionnaires de glisser-déposer passent au bouton (carte Importer).
 */
export function ActionCard({
  icon: Icon,
  title,
  subtitle,
  titreOccupe = 'En cours',
  onClick,
  disabled = false,
  busy = false,
  dashed = false,
  className,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  titreOccupe?: string
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  dashed?: boolean
  className?: string
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
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-4 text-left transition-colors sm:gap-4 sm:px-5',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        dashed && 'border-dashed',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon className="size-5 shrink-0 text-muted-foreground" />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium max-sm:line-clamp-2 max-sm:whitespace-normal">
          {busy ? titreOccupe : title}
        </span>
        {subtitle !== undefined && !busy && (
          <span className="truncate text-xs text-muted-foreground max-sm:line-clamp-2 max-sm:whitespace-normal">
            {subtitle}
          </span>
        )}
      </span>
    </button>
  )
}
