import type { ReactNode } from 'react'

/*
 * Conteneur de tableau des pages analytique : en-tête de colonnes collant, barre
 * de défilement masquée (`no-scrollbar`). La coquille possède le comportement ; le
 * board fournit le contenu via les slots `head` (contenu du `thead`) et `children`
 * (`tbody`, plus un `tfoot` éventuel).
 *
 * Bornage RESPONSIVE (cf. AnalytiqueShell) : sous `lg`, la carte prend sa hauteur
 * naturelle (tous les mois affichés, la page défile) ; à partir de `lg`, elle est
 * bornée (`lg:flex lg:min-h-0 lg:flex-1`) et son corps défile en interne. Le
 * `overflow-x-auto` interne autorise un défilement horizontal sur écran étroit, à
 * l'intérieur des coins arrondis (l'`overflow-hidden` externe les préserve).
 */
export function AnalytiqueTable({
  head,
  children,
}: {
  head: ReactNode
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="no-scrollbar overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">{head}</thead>
          {children}
        </table>
      </div>
    </div>
  )
}
