import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'

/*
 * Bloc générique en squelette — un rectangle plein paramétrable par `className`
 * (hauteur/largeur/arrondi). Pour les zones sans structure de tableau/formulaire
 * (aperçu affichage, grille parking). Décoratif (aria-hidden).
 */
export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={cn('w-full', className)} aria-hidden="true" />
}
