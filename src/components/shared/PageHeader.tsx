import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Barre titre + actions d'une page (écran uniquement : print:hidden).
 *
 * - `title` : titre principal (h1).
 * - `meta` : ligne secondaire sous le titre (date, nom de fichier…).
 * - `actions` : zone de boutons alignée à droite.
 */
export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 print:hidden', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        {meta != null && (
          <p className="truncate text-sm text-muted-foreground">{meta}</p>
        )}
      </div>
      {actions != null && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
