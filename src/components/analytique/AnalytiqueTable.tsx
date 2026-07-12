import type { ReactNode } from 'react'

/*
 * Conteneur de tableau des pages analytique : carte bornée à défilement interne
 * (`flex min-h-0 flex-1`), en-tête de colonnes collant, barre de défilement
 * masquée (`no-scrollbar`). La coquille possède le comportement ; le board fournit
 * le contenu via les slots `head` (contenu du `thead`) et `children` (`tbody`, plus
 * un `tfoot` éventuel).
 */
export function AnalytiqueTable({
  head,
  children,
}: {
  head: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">{head}</thead>
          {children}
        </table>
      </div>
    </div>
  )
}
