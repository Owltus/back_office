import type { ReactNode } from 'react'

/*
 * Grille des graphiques des pages analytique (`shrink-0`, 1 colonne puis 2 en
 * large). Accepte 1 ou 2 `KpiLineChart` selon l'onglet.
 */
export function AnalytiqueCharts({ children }: { children: ReactNode }) {
  return (
    <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
  )
}
