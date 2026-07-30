import type { ReactNode } from 'react'

import { StatTile } from '#/components/shared/StatTile.tsx'
import { cn } from '#/lib/utils.ts'

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
/** Classe de la grille de cartes — source UNIQUE, partagée avec le squelette de
 * chargement (`AnalytiqueSkeleton`) pour qu'ils ne dérivent jamais l'un de l'autre. */
export function cardsGridClass(cols: number): string {
  return cn(
    'grid shrink-0 grid-cols-2 gap-3',
    cols === 6 && 'sm:grid-cols-3 lg:grid-cols-6',
    cols === 5 && 'sm:grid-cols-5',
    cols !== 5 && cols !== 6 && 'sm:grid-cols-4',
  )
}

export function AnalytiqueCardsGrid({
  children,
  cols = 4,
}: {
  children: ReactNode
  /** Colonnes à partir de `sm` : 4 (défaut), 5 (ex. Rapro « Vendues ») ou 6 (PDJ :
   * 6 moyennes → 2 sur mobile, 3 sur tablette, 6 sur grand écran). */
  cols?: 4 | 5 | 6
}) {
  return <div className={cardsGridClass(cols)}>{children}</div>
}

export function StatCard({
  label,
  value,
  sub,
  reference,
  accent = 'var(--primary)',
  hint,
  printHidden,
  className,
  children,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  /** Référence de comparaison (budget / objectif) → valeur affichée en fraction. */
  reference?: ReactNode
  /** Couleur du liseré (défaut primary). */
  accent?: string
  /** Explication au survol (tooltip). */
  hint?: string
  /** Masquer à l'impression (relayé à StatTile). */
  printHidden?: boolean
  /** Classes supplémentaires (relayées à StatTile). */
  className?: string
  children?: ReactNode
}) {
  return (
    <StatTile
      label={label}
      value={value}
      accent={accent}
      reference={reference}
      sub={sub}
      hint={hint}
      printHidden={printHidden}
      className={className}
    >
      {children}
    </StatTile>
  )
}

/** Sous-texte « X % <suffix> » — 2e information d'une carte : la PART qu'elle
 * représente dans un total (ex. caisse « du total », rapro « des vendues », parking
 * « des réservations »). `undefined` si le total est nul (rien à afficher). Partagé
 * pour un rendu identique partout. */
export function shareSub(part: number, total: number, suffix = 'du total') {
  if (total <= 0) return undefined
  return (
    <span className="text-[0.7rem] font-medium text-muted-foreground">
      {`${Math.round((part / total) * 100)} % ${suffix}`}
    </span>
  )
}
