import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/*
 * Touche de clavier stylée (keycap) : cadre arrondi à léger relief (bord bas plus
 * épais + ombre douce) qui évoque une vraie touche. Accueille un libellé court
 * (Ctrl, Alt, P…) ou une flèche (`KbdArrow`). Thème-aware via les tokens.
 */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-border bg-muted px-1.5 text-[11px] font-semibold leading-none text-foreground shadow-sm',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** Une ligne de raccourci : les touches (keycaps) à gauche, l'effet à droite.
 * Les `keys` acceptent n'importe quel contenu (Kbd, flèches, glyphe souris…). */
export function Shortcut({
  keys,
  children,
}: {
  keys: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex shrink-0 items-center gap-1">{keys}</span>
      <span>{children}</span>
    </div>
  )
}

/** Le « + » discret entre deux touches d'un raccourci. */
export function KbdPlus() {
  return <span className="text-xs text-muted-foreground">+</span>
}

/** Flèche de navigation (chevron net) à placer dans une <Kbd>. */
export function KbdArrow({ dir }: { dir: 'left' | 'right' | 'up' | 'down' }) {
  const d = {
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
  }[dir]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-3.5"
    >
      <path d={d} />
    </svg>
  )
}
