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
 * - `actions` : zone de boutons alignée à droite.
 *   SOURIS (`pointer-fine`, media query CSS — PAS un seuil de largeur) :
 *   TOUJOURS une seule ligne, actions collées au bord droit, à N'IMPORTE
 *   quelle largeur de fenêtre. Avant, ce repli était piloté par `sm`
 *   (640px, un seuil de VIEWPORT) : sur ordinateur, rétrécir la fenêtre
 *   sous 640px faisait basculer tout le bloc en mode « tactile » (titre
 *   empilé, actions en pleine largeur, sous-groupes écartés aux deux
 *   bords — un des groupes atterrissait à GAUCHE) puis revenait à droite
 *   en réélargissant : oscillation gauche/droite incohérente à la souris,
 *   pourtant jamais tactile (retour utilisateur — « toujours à droite »).
 *   `pointer-fine:*` prime sur `flex-col`/`sm:*` car Tailwind émet les
 *   utilitaires à variante APRÈS l'utilitaire nu de même propriété, donc
 *   le media query pointeur l'emporte dès qu'il matche, indépendamment de
 *   la largeur. Le titre (`min-w-0 flex-1 truncate`) absorbe tout le
 *   rétrécissement à la place ; les actions (`shrink-0`) gardent leur
 *   largeur pleine.
 *   TACTILE (`pointer: coarse`, aucun changement) : sous `sm` (640px), la
 *   barre n'a plus la largeur pour tenir titre + pastille + actions sur
 *   une seule ligne : les actions passent en pleine largeur, sur leur
 *   propre ligne, les sous-groupes (outils de page / navigation
 *   temporelle) écartés aux deux bords (`justify-between`) plutôt
 *   qu'entassés à droite avec un flou de priorité — le même repli que
 *   `.rapro-floors`/`.rapro-stats` : un seul palier net (empilé / une
 *   ligne), pas un entre-deux bâtard. Depuis `sm`, même comportement
 *   qu'à la souris (une ligne, à droite).
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
        'flex flex-col gap-3 print:hidden sm:flex-row sm:flex-nowrap sm:items-center',
        'pointer-fine:flex-row pointer-fine:flex-nowrap pointer-fine:items-center',
        // `justify-end` : sans effet quand le bloc titre/badge/meta est présent
        // (son `flex-1` absorbe déjà tout l'espace restant, rien à redistribuer)
        // — MAIS le vrai bug : plusieurs pages masquent le titre sous `lg`
        // (1024px, `title={isNavbarMobile ? undefined : ...}`, le jour vit
        // alors dans la Navbar) SANS passer de `badge` ni `meta` : la condition
        // `(title || badge != null || meta != null)` ci-dessous devient fausse,
        // le bloc titre entier ne se rend PLUS DU TOUT, et `actions` se
        // retrouve seul enfant de ce conteneur — sans alignement explicite, il
        // retombe sur `justify-start` (défaut du flex), donc à GAUCHE (bug
        // reproduit et confirmé en navigateur sur RepJour à 746px de large,
        // souris : retour utilisateur « toujours à droite »).
        'justify-end',
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
                  (!title
                    ? // Pas de titre à côté duquel écarter le badge (page qui le
                      // garde affiché même quand le titre part dans la Navbar,
                      // ex. le contrôle service/financier de PDJ) : `justify-
                      // between` n'a alors qu'un seul enfant, et
                      // `space-between` avec un seul élément le colle au bord
                      // de DÉPART, pas de fin — l'inverse de ce que `badgeAlign
                      // ="end"` demande. `justify-end` direct, à toute largeur.
                      'justify-end'
                    : badgeAlignBreakpoint === 'none'
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
            'pointer-fine:w-auto pointer-fine:shrink-0 pointer-fine:flex-nowrap',
            actionsAlign === 'end'
              ? 'justify-end'
              : 'justify-between sm:justify-end pointer-fine:justify-end',
          )}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
