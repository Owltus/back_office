import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Conteneur standard d'une page : le wrapper commun à toutes les routes.
 *   - `printBleed` : supprime le padding à l'impression (documents pleine
 *     page comme le PDJ A4 ou l'affiche A3) ;
 *   - `fillHeight` : autorise le contenu à rétrécir dans le parent flex
 *     (`min-h-0`), pour les pages dont l'aperçu gère son propre scroll.
 *   - `className` : classes additionnelles (fusionnées). Sert p. ex. à ne borner
 *     la hauteur qu'à partir d'un point de rupture (`lg:min-h-0`) : flux naturel
 *     qui défile sur mobile, aperçu à défilement interne sur grand écran.
 */
export function PageContainer({
  printBleed = false,
  fillHeight = false,
  className,
  children,
}: {
  printBleed?: boolean
  fillHeight?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col p-4 md:p-6',
        fillHeight && 'min-h-0',
        printBleed && 'print:p-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
