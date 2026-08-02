import { useId } from 'react'

/*
 * Petite souris SVG avec le bouton GAUCHE ou DROIT surligné — illustre un geste
 * du planning parking (clic droit sur une case vide = nouvelle réservation ; clic
 * gauche glissé sur une barre = déplacer). Classes Tailwind (parking n'a pas de
 * feuille CSS dédiée). Source UNIQUE partagée par la légende du planning et le
 * panneau d'aide. Le surlignage est un rectangle CLIPPÉ au corps arrondi, si bien
 * qu'il épouse le coin sans path manuel.
 *
 * `clipPath` a un id UNIQUE par instance (`useId`) : légende et modal d'aide
 * peuvent coexister à l'écran sans collision d'identifiant.
 */
export function MouseGlyph({ side }: { side: 'left' | 'right' }) {
  const clipId = `parking-mouse-${useId().replace(/:/g, '')}`
  const btnX = side === 'left' ? 3 : 10
  return (
    <svg
      className="h-[1.1rem] w-[0.8rem] shrink-0 text-muted-foreground"
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
        className="fill-foreground/60"
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
