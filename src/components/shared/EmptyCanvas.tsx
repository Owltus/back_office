import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Canvas pointillé centré (états vides / chargement / dropzone).
 *
 * Ne porte que le tronc commun aux trois usages observés ; le reste
 * (min-h, flex-col, gap, hachures `empty-canvas`, hover…) vient de
 * `className`. Les autres props HTML (role, handlers drag&drop…) sont
 * transmises au div, ce qui permet à la dropzone PDJ de rester interactive.
 */
export function EmptyCanvas({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-border',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
