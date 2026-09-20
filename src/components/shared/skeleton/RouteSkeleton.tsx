import { useRouterState } from '@tanstack/react-router'

import { Skeleton } from '#/components/ui/skeleton.tsx'
import { SkeletonCardsRow } from '#/components/shared/skeleton/SkeletonCardsRow.tsx'
import { SkeletonTable } from '#/components/shared/skeleton/SkeletonTable.tsx'

/*
 * Squelette de page au niveau BOOT / GARDE (avant qu'un board ne soit monté),
 * adapté à la ROUTE d'atterrissage.
 *
 * Deux corrections de fond par rapport à l'ancien squelette « dashboard
 * universel » :
 *   1. il réserve TOUJOURS la barre PageHeader (titre + actions). Sans elle, le
 *      contenu descendait d'une ligne (~44 px) à l'arrivée du board — un board
 *      rend son PageHeader hors de sa propre branche de chargement, mais le
 *      squelette boot/garde, lui, remplace la page ENTIÈRE, en-tête compris.
 *   2. il choisit une forme de corps proche de la vraie page (formulaire étroit,
 *      liste, analytique, ou board cartes+tableau par défaut) au lieu de plaquer
 *      des cartes+tableau larges sur un formulaire `/profil` ou une liste
 *      `/comptes` — ce qui provoquait un saut de forme et de largeur.
 *
 * La largeur (`max-w-*`) et l'espacement collent au conteneur réel de chaque
 * famille de page. Décoratif (aria-hidden).
 *
 * ⚠ HYDRATATION. L'application est une SPA dont le shell est PRÉRENDU UNE SEULE
 * FOIS puis servi tel quel pour toutes les routes (rewrite Vercel vers
 * `_shell.html` — vérifié : l'empreinte du HTML servi est identique sur /pdj et
 * /profil). Le shell contient donc la variante d'UNE seule route. Adapter ce
 * squelette au chemin dès le PREMIER rendu client faisait diverger le DOM de
 * celui du shell sur toute page d'une autre famille — /profil, /comptes et les
 * analytiques — d'où une erreur d'hydratation React (#418) à chaque visite.
 *
 * D'où `SHELL_VARIANT` : avant l'hydratation, on rend la variante du shell ;
 * on n'adapte qu'ensuite (cf. `AppAuthGate`).
 */

/** Familles de page ayant une silhouette de chargement distincte. */
export type SkeletonVariant = 'profil' | 'comptes' | 'analytique' | 'board'

/**
 * Variante contenue dans le SHELL PRÉRENDU, donc celle que le navigateur a déjà
 * sous les yeux au moment de l'hydratation.
 *
 * Le shell est prérendu pour `/`, qui retombe sur la variante « board ».
 * Vérification, si le prérendu change un jour :
 *   `curl -s https://backoffice.naostack.com/pdj | grep -o 'max-w-[a-z0-9]*'`
 * doit montrer `max-w-5xl`, et le premier conteneur porter `space-y-4`.
 */
export const SHELL_VARIANT: SkeletonVariant = 'board'

/** Famille de page d'un chemin. Pure : c'est elle qu'on teste, pas le rendu. */
export function skeletonVariant(pathname: string): SkeletonVariant {
  if (pathname.startsWith('/profil')) return 'profil'
  if (pathname.startsWith('/comptes')) return 'comptes'
  if (pathname.includes('/analytique')) return 'analytique'
  return 'board'
}

/** Silhouette de la barre PageHeader : titre à gauche, actions à droite. */
function HeaderRow() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </div>
  )
}

export function RouteSkeleton({
  pathname,
  /** Force une variante, quel que soit le chemin. Utilisé avant l'hydratation
   *  pour reproduire exactement le shell prérendu. */
  variant,
}: {
  pathname: string
  variant?: SkeletonVariant
}) {
  const famille = variant ?? skeletonVariant(pathname)

  // Profil : carte identité + cartes de formulaire, colonne étroite (max-w-lg).
  if (famille === 'profil') {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6" aria-hidden="true">
        <HeaderRow />
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-52" />
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    )
  }

  // Comptes : liste de lignes (colonne max-w-3xl).
  if (famille === 'comptes') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4" aria-hidden="true">
        <HeaderRow />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  // Analytique : cartes + tableau + deux graphes.
  if (famille === 'analytique') {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6" aria-hidden="true">
        <HeaderRow />
        <SkeletonCardsRow count={4} />
        <SkeletonTable cols={5} rows={8} bounded={false} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[268px] rounded-xl" />
          <Skeleton className="h-[268px] rounded-xl" />
        </div>
      </div>
    )
  }

  // Par défaut (repjour, pdj, parking, caisse, rapro, gestion) : cartes + tableau.
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4" aria-hidden="true">
      <HeaderRow />
      <SkeletonCardsRow count={4} />
      <SkeletonTable cols={5} rows={8} bounded={false} />
    </div>
  )
}

/**
 * Squelette rendu par le ROUTEUR pendant une navigation en cours
 * (`defaultPendingComponent`, voir `router.tsx`).
 *
 * Ce que ça corrige (audit de chargement du 2026-09-20) : au clic sur un onglet,
 * le routeur télécharge le code de la route — jusqu'à une cinquantaine de
 * fichiers pour `/repjour` — en laissant l'ANCIENNE page affichée et figée. Rien
 * ne bougeait à l'écran. Sur tablette, où il n'y a pas de survol donc pas de
 * préchargement, c'était perçu comme un gel de plusieurs secondes.
 *
 * `location` est la destination pendant une transition en cours
 * (`resolvedLocation` reste l'origine) : le squelette prend donc d'emblée la
 * forme de la page vers laquelle on va, pas de celle qu'on quitte.
 *
 * L'angle D1 du chantier `squelette-chargement-global` avait écarté cette option
 * au motif qu'elle serait « inutile tant que les routes n'ont pas de `loader` ».
 * C'était juste pour l'attente des DONNÉES ; ça ne l'est pas pour le
 * téléchargement du CODE de la route, qui n'a rien à voir avec un `loader`.
 */
export function PendingRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return <RouteSkeleton pathname={pathname} />
}
