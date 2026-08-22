import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * Barre titre + actions d'une page (écran uniquement : print:hidden).
 *
 * Convention d'agencement, commune à toutes les pages :
 *   [leading] [titre + meta] ······················ [actions]
 * et, dans `actions`, la navigation temporelle vient TOUJOURS en dernier, donc
 * collée au bord droit.
 *
 * - `leading` : bloc optionnel avant le titre. Aucune page ne l'utilise
 *   aujourd'hui (Parking pilote son planning depuis `actions`, à droite,
 *   comme les autres pages) — prop conservée pour un besoin futur de bloc de
 *   navigation à gauche du titre.
 * - `title` : titre principal (h1). Omis (`undefined` OU chaîne vide — les deux
 *   traités pareil, en test de vérité, pas `!= null`), toute la ligne titre
 *   disparaît (plus de div vide qui réserverait quand même sa hauteur via le
 *   `gap` du conteneur — le vide repéré entre la Navbar et les cartes en
 *   mobile sur Rapprochement, une fois titre ET badge confiés à la Navbar).
 *   Sinon, tronqué (`truncate`) plutôt que renvoyé à la ligne : un h1 qui
 *   enjambe deux lignes fait dériver la pastille d'état vers une ligne qui ne
 *   lui correspond pas (le bug repéré en mobile sur Rapprochement).
 * - `badge` : pastille d'état posée juste après le titre, sur la même ligne
 *   (voir `LockBadge`). Hors du h1 : c'est un état, pas un bout de titre.
 *   `shrink-0` : ne cède jamais sa place au titre, reste toujours visible.
 * - `badgeAlign` : `'start'` (défaut) colle la pastille juste après le titre,
 *   partout. `'end'` ne change rien au-delà du seuil de bascule (toujours
 *   collée au titre) mais, en dessous, l'envoie au bord droit de la ligne —
 *   plus net qu'accolée à un titre déjà tronqué (demande explicite sur
 *   Caisse/PDJ/Rapprochement, pas généralisée aux autres pages sans le leur
 *   demander).
 * - `badgeAlignBreakpoint` : seuil de cette bascule — `'lg'` (1024px, défaut,
 *   Caisse/PDJ), qui doit rester aligné sur le seuil hamburger de la Navbar
 *   (fixe pour toute l'app), PAS sur un seuil de mise en page propre à une
 *   page (ex. la grille chambres/KPI de Rapprochement, 768px, sans rapport).
 *   `'none'` (Rapprochement) : ne revient JAMAIS à `start`, la pastille reste
 *   au bord droit à toutes les tailles — demandé explicitement là, pas un
 *   défaut à généraliser sans qu'on le redemande.
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
 * - `actionsAlign` : `'responsive'` (défaut, ci-dessus) ou `'end'` — les
 *   sous-groupes restent COLLÉS ENSEMBLE au bord droit à TOUTE largeur,
 *   jamais écartés aux deux bords même en fenêtre étroite. Réservé aux `actions`
 *   dont l'appelant garantit déjà qu'elles ne s'affichent QUE sur ordinateur
 *   à la souris (Rapprochement : tout ce bloc disparaît sur écran tactile,
 *   remplacé par la barre basse) — le repli « écarté aux deux bords », pensé
 *   pour la portée du pouce sur téléphone, n'a alors plus de sens : à la
 *   souris, un rétrécissement de fenêtre ne justifie pas de séparer les
 *   groupes, seulement de les laisser (au pire) passer à la ligne ensemble.
 */
export function PageHeader({
  leading,
  title,
  badge,
  badgeAlign = 'start',
  badgeAlignBreakpoint = 'lg',
  badgeWidth,
  meta,
  actions,
  actionsAlign = 'responsive',
  className,
}: {
  leading?: ReactNode
  title?: ReactNode
  badge?: ReactNode
  badgeAlign?: 'start' | 'end'
  badgeAlignBreakpoint?: 'lg' | 'none'
  badgeWidth?: string
  meta?: ReactNode
  actions?: ReactNode
  actionsAlign?: 'responsive' | 'end'
  className?: string
}) {
  // Rien à montrer nulle part : `null`, pas un `<div>` vide. Un élément rendu,
  // même sans contenu visible à l'intérieur, reste un item flex à part entière
  // pour le CONTENEUR PARENT — son `gap` réserve quand même de la place autour
  // de lui. Seul `null` sort vraiment PageHeader du flux (Rapprochement, en
  // dessous de 640px : titre/badge confiés à la Navbar, actions à la barre
  // d'outils basse — tout absent au sens strict, pas juste masqué en CSS).
  if (leading == null && !title && badge == null && meta == null && actions == null) {
    return null
  }
  return (
    <div
      className={cn(
        'flex flex-col gap-3 print:hidden sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
    >
      {leading}
      {(title || badge != null || meta != null) && (
        <div className="min-w-0 flex-1">
          {(title || badge != null) && (
            <div
              className={cn(
                'flex min-w-0 flex-nowrap items-center gap-2',
                badgeAlign === 'end' &&
                  (badgeAlignBreakpoint === 'none'
                    ? 'justify-between'
                    : 'justify-between lg:justify-start'),
              )}
            >
              {title && (
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
      )}
      {actions != null && (
        <div
          className={cn(
            'flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:flex-nowrap',
            actionsAlign === 'end' ? 'justify-end' : 'justify-between sm:justify-end',
          )}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
