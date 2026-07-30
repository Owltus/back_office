import type { ComponentProps, ReactNode } from 'react'

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

/** Carte de synthèse analytique = `StatTile` avec deux défauts : accent `primary` et
 * VALEUR COLORÉE (`coloredValue`). Le type dérive de StatTile (pas de recopie manuelle
 * des props) — ajouter un prop à StatTile le rend automatiquement disponible ici. */
export function StatCard({
  accent = 'var(--primary)',
  coloredValue = true,
  ...rest
}: Omit<ComponentProps<typeof StatTile>, 'accent'> & { accent?: string }) {
  return <StatTile accent={accent} coloredValue={coloredValue} {...rest} />
}

/** Petit sous-texte grisé — 2e information d'une carte, rendu sous la valeur.
 * Rendu unique partagé (ex. « 1 234 au total », « 38 % du total »). */
export function subText(content: ReactNode) {
  return (
    <span className="text-[0.7rem] font-medium text-muted-foreground">
      {content}
    </span>
  )
}

/** Sous-texte « X % <suffix> » — la PART qu'une carte représente dans un total
 * (caisse « du total », rapro « des vendues », parking « des réservations »).
 * `undefined` si le total est nul (rien à afficher). */
export function shareSub(part: number, total: number, suffix = 'du total') {
  if (total <= 0) return undefined
  return subText(`${Math.round((part / total) * 100)} % ${suffix}`)
}
