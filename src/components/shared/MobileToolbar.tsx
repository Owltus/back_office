import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Cellule de barre d'outils basse mobile : icône au-dessus du libellé,
 * `flex-1`, gabarit natif d'app mobile (pas un bouton de bureau rétréci).
 * Le libellé existe précisément parce que l'infobulle au survol n'existe pas
 * au doigt — une icône seule n'explique plus rien en tactile.
 */
export function ToolbarCell({
  icon,
  label,
  onClick,
  disabled = false,
  ariaLabel,
  bordered = true,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
  /** Filet vertical à gauche de la cellule — faux pour la 1re cellule d'une barre. */
  bordered?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground disabled:pointer-events-none disabled:opacity-40',
        bordered && 'border-l border-border',
      )}
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}

/**
 * Barre d'outils basse fixe sur écran tactile — le conteneur `<nav>` seul
 * (fixed, safe-area, fond flouté) ; les cellules (`ToolbarCell`) sont
 * fournies par l'appelant via `children`. Ne rend rien si `visible` est faux
 * — l'appelant décide (typiquement `isTouchDevice` de `useResponsiveShell`),
 * ce composant ne fait pas sa propre détection pour rester composable avec un
 * hook déjà calculé une fois par board.
 *
 * `onHeightChange` (optionnel) : rapporte la hauteur RÉELLEMENT rendue de la
 * barre (`ResizeObserver`, safe-area incluse) à chaque changement — un
 * appelant qui réserve de la place sous son contenu pour cette barre fixe
 * (padding-bottom) peut alors utiliser cette valeur exacte au lieu de deviner
 * une constante, qui dérive vite d'un appareil à l'autre (safe-area variable).
 */
export function MobileToolbar({
  visible,
  onHeightChange,
  children,
}: {
  visible: boolean
  onHeightChange?: (height: number) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!visible || !onHeightChange) return
    const el = ref.current
    if (!el) return
    const measure = () => onHeightChange(el.offsetHeight)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [visible, onHeightChange])

  if (!visible) return null
  return (
    <nav
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-card/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {children}
    </nav>
  )
}
