import { useMatchMedia } from '#/components/shared/useMatchMedia.ts'

/**
 * Les deux media queries structurantes du mode tactile de l'app, réunies en
 * un seul hook pour ne plus les recalculer séparément à chaque board :
 *  - `isNavbarMobile` : la Navbar globale est en mode hamburger (identité de
 *    page dans la Navbar plutôt que dans l'en-tête de page). Seuil FIXE pour
 *    toute l'app (1024px) — à ne jamais faire dériver par board.
 *  - `isTouchDevice` : détection tactile RÉELLE `(hover:none) and
 *    (pointer:coarse)`, PAS une largeur — un ordinateur en fenêtre étroite
 *    garde la barre du haut, une tablette tactile large a la barre basse.
 */
export function useResponsiveShell(): {
  isNavbarMobile: boolean
  isTouchDevice: boolean
} {
  const isNavbarMobile = useMatchMedia('(max-width: 1023.98px)')
  const isTouchDevice = useMatchMedia('(hover: none) and (pointer: coarse)')
  return { isNavbarMobile, isTouchDevice }
}

/** Même détection que `isTouchDevice`, mais synchrone (pas un Hook) — pour les
 * handlers qui doivent ouvrir un `window.open()` dans le même tick que le
 * geste utilisateur (contournement du bloqueur de popups à l'impression). */
export function isTouchDeviceNow(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}
