import type { ReactNode } from 'react'

import { StatTile } from '#/components/shared/StatTile.tsx'

/*
 * Grille et carte de synthèse des pages analytique. La grille (`shrink-0`,
 * jusqu'à 4 colonnes) est partagée ; chaque board fournit ses libellés/valeurs.
 *
 * `StatCard` délègue au composant unifié `StatTile` (style « Tuile, valeur
 * seule ») : liseré de couleur à gauche + libellé + valeur, `sub`/`children`
 * pour les cartes enrichies (note secondaire, barre de progression budget de
 * repjour…). `accent` par défaut = primary (les pages qui codent une couleur —
 * ex. rapro — la passent explicitement).
 */
export function AnalytiqueCardsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  reference,
  accent = 'var(--primary)',
  children,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  /** Référence de comparaison (budget / objectif) → valeur affichée en fraction. */
  reference?: ReactNode
  /** Couleur du liseré (défaut primary). */
  accent?: string
  children?: ReactNode
}) {
  return (
    <StatTile
      label={label}
      value={value}
      accent={accent}
      reference={reference}
      sub={sub}
    >
      {children}
    </StatTile>
  )
}
