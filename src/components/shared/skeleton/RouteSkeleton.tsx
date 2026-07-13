import { Skeleton } from '#/components/ui/skeleton.tsx'
import { SkeletonCardsRow } from '#/components/shared/skeleton/SkeletonCardsRow.tsx'
import { SkeletonTable } from '#/components/shared/skeleton/SkeletonTable.tsx'

/*
 * Squelette de page au niveau BOOT / GARDE (avant qu'un board ne soit monté),
 * adapté à la ROUTE d'atterrissage.
 *
 * Deux corrections de fond par rapport à l'ancien squelette « dashboard
 * universel » :
 *   1. il réserve TOUJOURS la barre PageHeader (titre + actions). Sans elle, le
 *      contenu descendait d'une ligne (~44 px) à l'arrivée du board — un board
 *      rend son PageHeader hors de sa propre branche de chargement, mais le
 *      squelette boot/garde, lui, remplace la page ENTIÈRE, en-tête compris.
 *   2. il choisit une forme de corps proche de la vraie page (formulaire étroit,
 *      liste, analytique, ou board cartes+tableau par défaut) au lieu de plaquer
 *      des cartes+tableau larges sur un formulaire `/profil` ou une liste
 *      `/comptes` — ce qui provoquait un saut de forme et de largeur.
 *
 * La largeur (`max-w-*`) et l'espacement collent au conteneur réel de chaque
 * famille de page. Décoratif (aria-hidden).
 */

/** Silhouette de la barre PageHeader : titre à gauche, actions à droite. */
function HeaderRow() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </div>
  )
}

export function RouteSkeleton({ pathname }: { pathname: string }) {
  // Profil : carte identité + cartes de formulaire, colonne étroite (max-w-lg).
  if (pathname.startsWith('/profil')) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6" aria-hidden="true">
        <HeaderRow />
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-52" />
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    )
  }

  // Comptes : liste de lignes (colonne max-w-3xl).
  if (pathname.startsWith('/comptes')) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4" aria-hidden="true">
        <HeaderRow />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  // Analytique : cartes + tableau + deux graphes.
  if (pathname.includes('/analytique')) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6" aria-hidden="true">
        <HeaderRow />
        <SkeletonCardsRow count={4} />
        <SkeletonTable cols={5} rows={8} bounded={false} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[268px] rounded-xl" />
          <Skeleton className="h-[268px] rounded-xl" />
        </div>
      </div>
    )
  }

  // Par défaut (repjour, pdj, parking, caisse, rapro, gestion) : cartes + tableau.
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4" aria-hidden="true">
      <HeaderRow />
      <SkeletonCardsRow count={4} />
      <SkeletonTable cols={5} rows={8} bounded={false} />
    </div>
  )
}
