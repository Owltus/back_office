import { Skeleton } from '#/components/ui/skeleton.tsx'

/**
 * Squelette de chargement des boards repjour (dashboard / analytique).
 *
 * Reproduit la silhouette « rangée de cartes de synthèse + tableau » pour un
 * chargement PERÇU plus fluide qu'un spinner centré : l'utilisateur voit tout
 * de suite la forme de la page se dessiner. Purement décoratif (aria-hidden).
 */
export function BoardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {/* Cartes de synthèse */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-24" />
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-muted/50 px-3 py-2.5">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ml-auto h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="hidden h-3 w-10 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
