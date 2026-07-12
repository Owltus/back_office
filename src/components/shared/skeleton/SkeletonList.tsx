import { Skeleton } from '#/components/ui/skeleton.tsx'

/*
 * Liste de lignes en squelette — avatar rond + deux lignes de texte + une action à
 * droite. Pour les listes (Comptes). Décoratif (aria-hidden).
 */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border bg-card"
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      ))}
    </div>
  )
}
