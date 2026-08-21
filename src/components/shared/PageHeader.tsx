import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Barre titre + actions d'une page (écran uniquement : print:hidden).
 *
 * Convention d'agencement, commune à toutes les pages :
 *   [leading] [titre + meta] ······················ [actions]
 * et, dans `actions`, la navigation temporelle vient TOUJOURS en dernier, donc
 * collée au bord droit. Seul le parking déroge : son planning se pilote depuis
 * la gauche, via `leading`.
 *
 * - `leading` : bloc optionnel avant le titre (navigation du parking).
 * - `title` : titre principal (h1). Omis, la colonne sert d'espaceur — c'est ce
 *   qui pousse `actions` à droite quand la page n'a pas de titre. Tronqué
 *   (`truncate`) plutôt que renvoyé à la ligne : un h1 qui enjambe deux lignes
 *   fait dériver la pastille d'état vers une ligne qui ne lui correspond pas
 *   (le bug repéré en mobile sur Rapprochement).
 * - `badge` : pastille d'état posée juste après le titre, sur la même ligne
 *   (voir `LockBadge`). Hors du h1 : c'est un état, pas un bout de titre.
 *   `shrink-0` : ne cède jamais sa place au titre, reste toujours visible.
 * - `badgeAlign` : `'start'` (défaut) colle la pastille juste après le titre,
 *   partout. `'end'` ne change rien au-delà de `sm` (toujours collée au
 *   titre) mais, en dessous, l'envoie au bord droit de la ligne — plus net
 *   qu'accolée à un titre déjà tronqué (demande explicite sur Rapprochement,
 *   pas généralisée aux autres pages sans le leur demander).
 * - `badgeWidth` : n'a d'effet qu'avec `badgeAlign="end"`, sous `sm`. Étire la
 *   pastille ELLE-MÊME (pas juste un conteneur autour) à cette largeur — sert
 *   à l'aligner pile sur le bloc du dessous qu'elle surplombe (typiquement la
 *   navigation temporelle, elle aussi collée au bord droit sur sa propre
 *   ligne) : classe Tailwind arbitraire, ex. `'w-[94px]'`. Sans elle, la
 *   pastille garde sa largeur de contenu (bord droit aligné, bord gauche non).
 * - `meta` : ligne secondaire sous le titre (date, nom de fichier…).
 * - `actions` : zone de boutons alignée à droite. Sous `sm` (640px), la barre
 *   n'a plus la largeur pour tenir titre + pastille + actions sur une seule
 *   ligne : les actions passent en pleine largeur, sur leur propre ligne, les
 *   sous-groupes (outils de page / navigation temporelle) écartés aux deux
 *   bords (`justify-between`) plutôt qu'entassés à droite avec un flou de
 *   priorité — le même repli que `.rapro-floors`/`.rapro-stats` : un seul
 *   palier net (empilé / une ligne), pas un entre-deux bâtard.
 */
export function PageHeader({
  leading,
  title,
  badge,
  badgeAlign = 'start',
  badgeWidth,
  meta,
  actions,
  className,
}: {
  leading?: ReactNode
  title?: ReactNode
  badge?: ReactNode
  badgeAlign?: 'start' | 'end'
  badgeWidth?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 print:hidden sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        {(title != null || badge != null) && (
          <div
            className={cn(
              'flex min-w-0 flex-nowrap items-center gap-2',
              badgeAlign === 'end' && 'justify-between sm:justify-start',
            )}
          >
            {title != null && (
              <h1 className="min-w-0 truncate text-xl font-semibold">{title}</h1>
            )}
            {badge != null && (
              <div
                className={cn(
                  'shrink-0',
                  badgeAlign === 'end' &&
                    badgeWidth &&
                    cn(
                      badgeWidth,
                      'sm:w-auto',
                      '[&>*]:flex [&>*]:w-full [&>*]:justify-center',
                      'sm:[&>*]:inline-flex sm:[&>*]:w-auto',
                    ),
                )}
              >
                {badge}
              </div>
            )}
          </div>
        )}
        {meta != null && (
          <p className="truncate text-sm text-muted-foreground">{meta}</p>
        )}
      </div>
      {actions != null && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:flex-nowrap sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}
