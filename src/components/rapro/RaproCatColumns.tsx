import type { ReactNode } from 'react'

import { CATEGORY_COLOR } from '#/lib/rapro/constants.ts'
import type { DayStatusCounts } from '#/lib/rapro/monthly.ts'

/*
 * Colonnes de catégorie partagées par les deux vues analytique du rapprochement
 * (annuelle et détail mensuel) : en-tête coloré, cellules de comptage et helper
 * de compteur. Une seule source pour les 4 catégories (nettoyée / bloquée /
 * refus / no-show), au code couleur de `CATEGORY_COLOR`. La 1re colonne (Mois /
 * Jour) reste à la charge de l'appelant — elle diffère (libellé, lien).
 */

/** Compteur au code couleur de la catégorie ; un zéro reste discret (grisé),
 * comme sur la grille du rapprochement où un 0 ne s'accentue pas. */
export function coloredCount(n: number, color: string): ReactNode {
  return n === 0 ? (
    <span className="text-muted-foreground/40">0</span>
  ) : (
    <span style={{ color }}>{n}</span>
  )
}

/** En-tête des 4 colonnes de catégorie. `firstLabel` = titre de la 1re colonne. */
export function RaproCatHead({ firstLabel }: { firstLabel: string }) {
  return (
    <tr className="border-b border-border bg-muted">
      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
        {firstLabel}
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.nettoyee }}
      >
        Nettoyée
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.bloquee }}
      >
        Bloquée
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.refus }}
      >
        Refus
      </th>
      <th
        className="px-3 py-2 text-center text-xs font-medium"
        style={{ color: CATEGORY_COLOR.noshow }}
      >
        No-show
      </th>
    </tr>
  )
}

/** Les 4 cellules de comptage colorées d'une ligne (corps ou total). L'appelant
 * fournit la 1re cellule (jour / mois) avant celles-ci. */
export function RaproCatCells({ counts }: { counts: DayStatusCounts }) {
  return (
    <>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium tabular-nums">
        {coloredCount(counts.nettoyee, CATEGORY_COLOR.nettoyee)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
        {coloredCount(counts.bloquee, CATEGORY_COLOR.bloquee)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
        {coloredCount(counts.refus, CATEGORY_COLOR.refus)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-xs tabular-nums">
        {coloredCount(counts.noshow, CATEGORY_COLOR.noshow)}
      </td>
    </>
  )
}
