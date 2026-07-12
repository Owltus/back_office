import { Skeleton } from '#/components/ui/skeleton.tsx'
import { SkeletonCardsRow } from '#/components/shared/skeleton/SkeletonCardsRow.tsx'
import { SkeletonTable } from '#/components/shared/skeleton/SkeletonTable.tsx'

/**
 * Squelette de chargement du dashboard repjour (rapport journalier) — reflet de
 * son layout : 4 cartes de synthèse, la barre de progression (acquis/projeté vs
 * budget) puis le tableau des indicateurs (5 lignes). Composé sur le kit partagé.
 * Non borné (`space-y-4`, le dashboard n'est pas en `fillHeight`). Décoratif.
 */
export function BoardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <SkeletonCardsRow count={4} />
      {/* Barre de progression + légende (comme le vrai bloc entre cartes et tableau) */}
      <div className="rounded-xl border border-border bg-card p-4" aria-hidden="true">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="mt-3 flex flex-wrap gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-24" />
          ))}
        </div>
      </div>
      <SkeletonTable cols={4} rows={rows} bounded={false} />
    </div>
  )
}
