import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Conteneur standard d'une page : le wrapper commun à toutes les routes.
 *   - `printBleed` : supprime le padding à l'impression (documents pleine
 *     page comme le PDJ A4 ou l'affiche A3) ;
 *   - `fillHeight` : autorise le contenu à rétrécir dans le parent flex
 *     (`min-h-0`), pour les pages dont l'aperçu gère son propre scroll.
 */
export function PageContainer({
  printBleed = false,
  fillHeight = false,
  children,
}: {
  printBleed?: boolean
  fillHeight?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col p-4 md:p-6',
        fillHeight && 'min-h-0',
        printBleed && 'print:p-0',
      )}
    >
      {children}
    </div>
  )
}
