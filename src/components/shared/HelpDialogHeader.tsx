import type { ReactNode } from 'react'

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'

/*
 * En-tête simple et commun aux modals d'aide (« ? ») de l'app : une pastille
 * d'icône, un titre, une courte description, et un filet de séparation avec le
 * corps. Garde `DialogTitle`/`DialogDescription` (câblage d'accessibilité Radix)
 * tout en leur donnant une présentation d'en-tête cohérente d'un modal à l'autre.
 */
export function HelpDialogHeader({
  icon,
  title,
  description,
}: {
  /** Icône affichée dans la pastille (optionnelle). */
  icon?: ReactNode
  title: string
  description: string
}) {
  return (
    <DialogHeader className="shrink-0 gap-0 border-b border-border pb-4 text-left">
      <div className="flex items-center gap-3">
        {icon && (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="space-y-1">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
      </div>
    </DialogHeader>
  )
}
