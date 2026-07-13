import { Skeleton } from '#/components/ui/skeleton.tsx'

/*
 * Squelette de chargement des pages analytique — reflet 1:1 du layout construit
 * (cartes de synthèse + tableau borné à défilement interne + graphiques), aux
 * MÊMES classes de mise en page (`shrink-0` pour cartes/graphes, `flex-1` pour le
 * tableau). Rendu à la place du contenu, DANS la colonne flex de `AnalytiqueShell`,
 * pour un chargement perçu fluide et SANS saut de layout à l'arrivée des données.
 * Purement décoratif (aria-hidden).
 */
export function AnalytiqueSkeleton({
  cols = 5,
  charts = 2,
  rows = 10,
  cards = 4,
  cardLines = 3,
}: {
  cols?: number
  charts?: number
  rows?: number
  /** Nombre de cartes de synthèse. 0 = pas de rangée de cartes (ex. Rapro mensuel,
   * qui n'affiche aucune carte — en dessiner 4 les faisait « disparaître » à
   * l'arrivée des données). */
  cards?: number
  /** Lignes par carte : 3 (label + valeur + sous-texte, cas courant) ou 2 (label +
   * valeur seule, ex. cartes Rapro). Évite qu'une carte squelette soit plus haute
   * que la vraie. */
  cardLines?: number
}) {
  return (
    <>
      {/* Cartes de synthèse (masquées si `cards === 0`) */}
      {cards > 0 && (
        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-20" />
              {cardLines >= 3 && <Skeleton className="mt-3 h-3 w-28" />}
            </div>
          ))}
        </div>
      )}

      {/* Tableau : reflet du bornage responsive d'AnalytiqueTable (naturel sous
          lg, borné à partir de lg). */}
      <div
        className="overflow-hidden rounded-xl border border-border bg-card lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
        aria-hidden="true"
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-border bg-muted px-3 py-2.5">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="ml-auto h-3 w-10" />
          ))}
        </div>
        <div className="no-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-hidden">
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

      {/* Graphiques */}
      <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: charts }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-3 h-[220px] w-full rounded-lg" />
          </div>
        ))}
      </div>
    </>
  )
}
