import type { ComponentProps, ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Cadre « en-tête fixe + contenu qui défile » de la page d'un chapitre et
 * des quatre pages de détail (décision utilisateur du 2026-10-04 : « que la
 * barre de défilement soit dans le contenu, en dehors de la zone de la barre
 * d'outils »).
 *
 * La page tient EXACTEMENT dans la hauteur du `<main class="app-scroll">`
 * (chaîne flex `min-h-0` depuis `ClasseurShell`) : le `<main>` ne défile
 * plus, seule la ZONE sous l'en-tête défile, avec sa propre barre.
 *
 * Les deux blocs mangent la marge du `PageContainer` (`p-4 md:p-6`) puis la
 * rendent en rembourrage : la barre de défilement de la zone tombe au BORD
 * DROIT de la fenêtre, le contenu défile jusqu'au bord bas, et les anneaux
 * de focus ne sont pas rognés. L'en-tête réserve la MÊME gouttière que la
 * zone (`scrollbar-gutter: stable`, qui vaut aussi pour `overflow: hidden`) :
 * ses boutons restent alignés sur le bord droit du contenu, que la zone
 * défile ou non, sans saut quand la barre apparaît. Barres superposées
 * (téléphone) : gouttière nulle des deux côtés.
 */
export function PageAvecEnTete({
  entete,
  children,
  className,
  ...props
}: {
  entete: ReactNode
  children: ReactNode
} & Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div
      className={cn('flex min-h-0 w-full flex-1 flex-col', className)}
      {...props}
    >
      <div
        data-page-en-tete=""
        className="-mx-4 -mt-4 flex shrink-0 flex-col gap-3 overflow-hidden px-4 pt-4 pb-3 [scrollbar-gutter:stable] md:-mx-6 md:-mt-6 md:px-6 md:pt-6 print:overflow-visible"
      >
        {entete}
      </div>
      <div
        data-page-zone=""
        className="-mx-4 -mb-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4 [scrollbar-gutter:stable] md:-mx-6 md:-mb-6 md:px-6 md:pb-6 print:overflow-visible"
      >
        {children}
      </div>
    </div>
  )
}
