import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/*
 * Grille des graphiques des pages analytique (`shrink-0`). Par défaut deux colonnes
 * à partir de `lg` (deux graphiques côte à côte, `cols={2}`) ; `cols={1}` force une
 * seule colonne pleine largeur — onglet à graphique unique, ex. Caisse.
 */
/** Classe de la grille de graphiques — source UNIQUE, partagée avec le squelette
 * de chargement (`AnalytiqueSkeleton`). */
export function chartsGridClass(cols: number): string {
  return cn('grid shrink-0 grid-cols-1 gap-4', cols > 1 && 'lg:grid-cols-2')
}

export function AnalytiqueCharts({
  children,
  cols = 2,
}: {
  children: ReactNode
  cols?: 1 | 2
}) {
  return <div className={chartsGridClass(cols)}>{children}</div>
}
