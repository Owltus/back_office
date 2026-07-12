import { SkeletonCardsRow } from '#/components/shared/skeleton/SkeletonCardsRow.tsx'
import { SkeletonTable } from '#/components/shared/skeleton/SkeletonTable.tsx'

/**
 * Squelette de chargement des boards repjour (dashboard).
 *
 * Silhouette « rangée de cartes de synthèse + tableau » composée à partir du kit
 * partagé (`shared/skeleton/`), pour un chargement PERÇU plus fluide qu'un spinner
 * centré. Non borné (`space-y-4`) : adapté au dashboard qui n'est pas en
 * `fillHeight`. Purement décoratif (aria-hidden porté par chaque bloc).
 */
export function BoardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <SkeletonCardsRow count={4} />
      <SkeletonTable cols={4} rows={rows} bounded={false} />
    </div>
  )
}
