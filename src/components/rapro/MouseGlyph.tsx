import { useId } from 'react'

import { cn } from '#/lib/utils.ts'

/*
 * Petite souris SVG avec le bouton GAUCHE ou DROIT surligné — illustre les deux
 * gestes de la grille du rapprochement. Le surlignage est un rectangle CLIPPÉ au
 * corps arrondi, si bien qu'il épouse le coin du bouton sans path manuel. Bouton
 * gauche en teinte neutre (il pose des couleurs variées), bouton droit en rouge
 * (le liseré). Source UNIQUE partagée par la légende de la grille et le panneau
 * d'aide, pour que le même symbole désigne partout le même geste.
 *
 * `clipPath` a un id UNIQUE par instance (`useId`) : la légende et le modal
 * d'aide peuvent coexister à l'écran sans collision d'identifiant.
 */
export function MouseGlyph({ side }: { side: 'left' | 'right' }) {
  const clipId = `rapro-mouse-${useId().replace(/:/g, '')}`
  const btnX = side === 'left' ? 3 : 10
  return (
    <svg
      className={cn('rapro-mouse', side === 'right' && 'rapro-mouse-right')}
      viewBox="0 0 20 28"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="3" y="2" width="14" height="24" rx="7" />
        </clipPath>
      </defs>
      {/* Bouton surligné (moitié haute, gauche ou droite), clippé au corps. */}
      <rect
        x={btnX}
        y="2"
        width="7"
        height="11"
        className="rapro-mouse-btn"
        clipPath={`url(#${clipId})`}
      />
      {/* Corps + séparation des deux boutons. */}
      <rect
        x="3"
        y="2"
        width="14"
        height="24"
        rx="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line x1="10" y1="2" x2="10" y2="13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
