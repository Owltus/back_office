import type { ReactNode } from 'react'

import { chartsGridClass } from '#/components/analytique/gridClasses.ts'

/*
 * Grille des graphiques des pages analytique (`shrink-0`). Par défaut deux colonnes
 * à partir de `lg` (deux graphiques côte à côte, `cols={2}`) ; `cols={1}` force une
 * seule colonne pleine largeur — onglet à graphique unique, ex. Caisse.
 */
/* `chartsGridClass` vit desormais dans `gridClasses.ts` — cf. AnalytiqueCards.tsx. */
export { chartsGridClass } from '#/components/analytique/gridClasses.ts'

export function AnalytiqueCharts({
  children,
  cols = 2,
}: {
  children: ReactNode
  cols?: 1 | 2
}) {
  return <div className={chartsGridClass(cols)}>{children}</div>
}
