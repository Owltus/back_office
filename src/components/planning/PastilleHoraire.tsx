/*
 * Repère d'un horaire dans les listes (menus du clic droit, volet) : une
 * pastille de sa couleur, puis ses heures. Depuis le 2026-10-31, un horaire
 * n'a plus de code (décision utilisateur : « ce qui importe, ce sont les
 * horaires ») ; la couleur reste un repère discret, le moment se lit dans
 * le groupe (Matin, Soir…).
 */

import { cn } from '#/lib/utils.ts'

/** Pastille ronde de la couleur de l'horaire (décorative). */
export function PastilleHoraire({
  couleur,
  className,
}: {
  couleur: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2.5 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/25',
        className,
      )}
      style={{ background: couleur }}
    />
  )
}
