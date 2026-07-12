import { Skeleton } from '#/components/ui/skeleton.tsx'

/*
 * Rangée de cartes de synthèse en squelette — mêmes classes que les vraies cartes
 * (`grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4`, `rounded-xl border bg-card
 * p-4`) pour ne rien décaler à l'arrivée des données. `withBar` esquisse une barre
 * de progression (cartes budget) plutôt qu'un sous-texte. Décoratif (aria-hidden).
 */
export function SkeletonCardsRow({
  count = 4,
  withBar = false,
}: {
  count?: number
  withBar?: boolean
}) {
  return (
    <div
      className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-20" />
          {withBar ? (
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          ) : (
            <Skeleton className="mt-3 h-3 w-28" />
          )}
        </div>
      ))}
    </div>
  )
}
