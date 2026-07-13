import { Skeleton } from '#/components/ui/skeleton.tsx'
import { SkeletonTable } from '#/components/shared/skeleton/SkeletonTable.tsx'

/**
 * Squelette de chargement du dashboard repjour (rapport journalier) — reflet
 * FIDÈLE de son layout réel (voir SummaryCards + KPITable) : trois cartes de
 * synthèse à deux lignes (la 1ʳᵉ pleine largeur sur mobile), la barre de
 * progression du mois, puis le tableau des indicateurs (5 lignes × 5 colonnes de
 * valeurs). Les dimensions et la grille (`sm:grid-cols-3`) collent au réel pour
 * ne rien décaler à l'arrivée des données.
 *
 * Pourquoi 3 cartes et non 4 : la 4ᵉ (« Pris depuis la veille ») est optionnelle
 * — masquée dès qu'il n'y a rien à comparer. Modéliser le socle GARANTI (3) évite
 * de dessiner une carte fantôme qui disparaîtrait ; au pire elle glisse à côté.
 *
 * Placé dans un conteneur `space-y-4` (cf. DashboardBoard) : le bloc cartes+barre
 * est en `space-y-3` interne, comme SummaryCards. Décoratif (aria-hidden).
 */
export function BoardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="space-y-3">
        {/* Cartes de synthèse : 2 sur mobile (1ʳᵉ pleine largeur), 3 dès sm */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4 ${
                i === 0 ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="mt-2 h-7 w-24" />
            </div>
          ))}
        </div>

        {/* Barre de progression du mois + légende (mêmes marges que le vrai bloc) */}
        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm sm:px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
      </div>

      {/* Tableau des indicateurs : 5 colonnes de valeurs (Jour, Cumul, Projeté,
          Budget, Écart) après le libellé. Hauteur naturelle (dashboard non borné). */}
      <SkeletonTable cols={5} rows={rows} bounded={false} />
    </div>
  )
}
