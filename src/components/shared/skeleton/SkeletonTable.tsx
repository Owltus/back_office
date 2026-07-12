import { Skeleton } from '#/components/ui/skeleton.tsx'

/*
 * Tableau en squelette — reflet du tableau réel. `bounded` (défaut) reprend le
 * conteneur borné à défilement interne (`flex min-h-0 flex-1` + `no-scrollbar`),
 * comme les pages analytique ; sinon un tableau à hauteur naturelle (dashboard,
 * gestion). `cols` = nombre de colonnes de valeurs après la colonne libellé.
 * Décoratif (aria-hidden).
 */
export function SkeletonTable({
  cols = 5,
  rows = 10,
  bounded = true,
}: {
  cols?: number
  rows?: number
  bounded?: boolean
}) {
  return (
    <div
      className={
        bounded
          ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card'
          : 'overflow-hidden rounded-xl border border-border bg-card'
      }
      aria-hidden="true"
    >
      <div className="flex shrink-0 items-center gap-4 border-b border-border bg-muted px-3 py-2.5">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="ml-auto h-3 w-10" />
        ))}
      </div>
      <div className={bounded ? 'no-scrollbar min-h-0 flex-1 overflow-hidden' : ''}>
        <div className="divide-y divide-border/50">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2.5">
              <Skeleton className="h-3 w-24" />
              {Array.from({ length: cols }).map((_, j) => (
                <Skeleton key={j} className="ml-auto h-3 w-10" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
