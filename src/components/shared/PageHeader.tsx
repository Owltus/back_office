import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Barre titre + actions d'une page (écran uniquement : print:hidden).
 *
 * Convention d'agencement, commune à toutes les pages :
 *   [leading] [titre + meta] ······················ [actions]
 * et, dans `actions`, la navigation temporelle vient TOUJOURS en dernier, donc
 * collée au bord droit. Seul le parking déroge : son planning se pilote depuis
 * la gauche, via `leading`.
 *
 * - `leading` : bloc optionnel avant le titre (navigation du parking).
 * - `title` : titre principal (h1). Omis, la colonne sert d'espaceur — c'est ce
 *   qui pousse `actions` à droite quand la page n'a pas de titre.
 * - `meta` : ligne secondaire sous le titre (date, nom de fichier…).
 * - `actions` : zone de boutons alignée à droite.
 */
export function PageHeader({
  leading,
  title,
  meta,
  actions,
  className,
}: {
  leading?: ReactNode
  title?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 print:hidden',
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        {title != null && <h1 className="text-xl font-semibold">{title}</h1>}
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
