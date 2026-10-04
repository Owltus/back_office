import type { DragEvent } from 'react'
import { Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '#/lib/utils.ts'

/**
 * Carte d'action (liste des classeurs ; l'accueil d'un classeur a ses
 * lignes, `LigneAction`, depuis le 2026-10-04), dans la
 * grammaire de l'app : carte `bg-card`, icône dans un petit carré teinté
 * (`bg-muted`), titre, description sur deux lignes au plus, survol
 * `bg-accent`, anneau de focus clavier. `h-full` : dans une grille, les
 * cartes d'une même rangée ont la même hauteur. `dashed` distingue la
 * création et l'import ; `busy` remplace l'icône par un `Loader2` et le
 * titre par `titreOccupe`. Les gestionnaires de glisser-déposer passent au
 * bouton (carte Importer).
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
        'group/carte flex h-full min-h-11 w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-3.5 text-left transition-colors sm:px-4',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        dashed && 'border-dashed',
        className,
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover/carte:text-foreground"
        data-testid="action-card-icone"
      >
        {busy ? (
          <Loader2 className="size-[18px] animate-spin" />
        ) : (
          <Icon className="size-[18px]" />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        {/* Titre sur deux lignes au plus, jamais coupé d'un « … » au milieu
            d'un mot dans une colonne étroite. */}
        <span className="line-clamp-2 text-sm font-medium">
          {busy ? titreOccupe : title}
        </span>
        {subtitle !== undefined && !busy && (
          // Deux lignes à toute largeur, jamais coupée d'un « … » au milieu
          // d'un mot (audit du 2026-10-04, B5 : « Sauvegarde éditable d… »).
          <span
            className="line-clamp-2 text-xs text-muted-foreground"
            data-testid="action-card-sous-titre"
          >
            {subtitle}
          </span>
        )}
      </span>
    </button>
  )
}
