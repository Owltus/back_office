import { useRouterState } from '@tanstack/react-router'

import { Skeleton } from '#/components/ui/skeleton.tsx'
import { SkeletonCardsRow } from '#/components/shared/skeleton/SkeletonCardsRow.tsx'
import { SkeletonTable } from '#/components/shared/skeleton/SkeletonTable.tsx'
import {
  AnalytiqueSkeleton,
  paramsAnalytique,
} from '#/components/analytique/AnalytiqueSkeleton.tsx'
import {
  FormeCaisse,
  FormeLiterie,
  FormePdj,
  FormeProfil,
  FormeRepjour,
} from '#/components/shared/skeleton/PageShapes.tsx'

/*
 * Squelette de page au niveau BOOT / GARDE (avant qu'un board ne soit monté),
 * adapté à la ROUTE d'atterrissage.
 *
 * Deux corrections de fond par rapport à l'ancien squelette « dashboard
 * universel » :
 *   1. il réserve la barre PageHeader (titre + actions) pour les pages QUI EN
 *      ONT UNE. Sans elle, le contenu descendait d'une ligne (~44 px) à
 *      l'arrivée du board — un board rend son PageHeader hors de sa propre
 *      branche de chargement, mais le squelette boot/garde, lui, remplace la
 *      page ENTIÈRE, en-tête compris. La réciproque est vraie : `/profil` n'a
 *      pas de PageHeader, lui en dessiner un était une ligne fantôme.
 *   2. il choisit une forme de corps proche de la vraie page au lieu de plaquer
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
 * celui du shell sur toute page d'une autre famille — d'où une erreur
 * d'hydratation React (#418) à chaque visite.
 *
 * D'où `SHELL_VARIANT` : avant l'hydratation, on rend la variante du shell ;
 * on n'adapte qu'ensuite (cf. `AppAuthGate`). Ce qui protège réellement, c'est
 * que `AuthContext` démarre à `loading = true`, donc que `AppAuthGate` rend
 * `BootSkeleton` (variante forcée) au premier rendu client — `PageGuard`,
 * `ProtectedRoute` et `PendingRoute`, qui appellent ce composant SANS variante,
 * sont sous `<Outlet/>` et donc hors d'atteinte à ce moment. Cet invariant est
 * figé par un test : voir `RouteSkeleton.test.ts`.
 */

/**
 * Familles de page ayant une silhouette de chargement distincte.
 *
 * ⚠ Élargi le 2026-09-23. Quatre familles ne suffisaient pas : « board »
 * servait indistinctement à /pdj, /repjour, /caisse, /parking, /rapro et
 * /literie, et dessinait 4 cartes + un tableau de 8 lignes — soit 789 px sur
 * TOUTES les pages. Mesure de l'écart avec le contenu réel : +58 % sur /pdj,
 * +32 % sur /repjour, +29 % sur /caisse. C'est la dissonance graphique
 * signalée par l'utilisateur.
 *
 * `board` reste le REPLI, et reste la variante du shell prérendu
 * (`SHELL_VARIANT`) : ne pas la retirer.
 */
export type SkeletonVariant =
  | 'profil'
  | 'comptes'
  | 'analytique'
  | 'pdj'
  | 'repjour'
  | 'caisse'
  | 'literie'
  | 'board'

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

/** Familles qui divergent du shell APRÈS hydratation. Exporté pour que le test
 * puisse borner cet ensemble : c'est son ÉTENDUE qui mesure le risque si
 * l'invariant « `loading` est vrai au premier rendu » venait à tomber. */
export const VARIANTES_DIVERGENTES: SkeletonVariant[] = [
  'profil',
  'comptes',
  'analytique',
  'pdj',
  'repjour',
  'caisse',
  'literie',
]

/** Famille de page d'un chemin. Pure : c'est elle qu'on teste, pas le rendu.
 *
 * ⚠ L'ordre compte : `/analytique` est testé AVANT les pages, parce que
 * `/pdj/analytique` doit rendre la silhouette analytique, pas celle du board
 * PDJ.
 *
 * ⚠ Les préfixes sont testés segment par segment (`/pdj` ou `/pdj/…`), pas par
 * `startsWith('/pdj')` seul : une route `/pdjXXX` aurait hérité de la
 * silhouette de PDJ. Sans conséquence aujourd'hui, mais la fonction est passée
 * de 3 à 7 préfixes — la probabilité de collision n'est plus négligeable. */
function estSous(pathname: string, prefixe: string): boolean {
  return pathname === prefixe || pathname.startsWith(`${prefixe}/`)
}

export function skeletonVariant(pathname: string): SkeletonVariant {
  if (estSous(pathname, '/profil')) return 'profil'
  if (estSous(pathname, '/comptes')) return 'comptes'
  if (pathname.includes('/analytique')) return 'analytique'
  if (estSous(pathname, '/pdj')) return 'pdj'
  if (estSous(pathname, '/repjour')) return 'repjour'
  if (estSous(pathname, '/caisse')) return 'caisse'
  if (estSous(pathname, '/literie')) return 'literie'
  /* /parking et /rapro gardent le repli : mesuré le 2026-09-23, leur contenu
     fait 789 et 809 px contre 789 px de squelette — l'écart est déjà nul ou
     de 2 %. Leur donner une silhouette dédiée serait du travail pour rien, et
     une occasion de dérive de plus. */
  return 'board'
}

/** Silhouette de la barre PageHeader : titre à gauche, actions à droite.
 *
 * ⚠ Les actions font `h-8` / `size-8`, pas `h-9` : les pages utilisent
 * `size="sm"` et `size="icon-sm"` (32 px). À 36 px, c'était le squelette — et
 * non le titre — qui pilotait la hauteur de la ligne, d'où 4 px de trop sur
 * TOUTES les variantes. */
function HeaderRow() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
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

  // Profil : carte identité + trois cartes de formulaire, colonne étroite.
  // Pas de HeaderRow : la page ne rend aucun PageHeader.
  if (famille === 'profil') {
    return <FormeProfil />
  }

  // Comptes : UNE carte à séparateurs internes (pas six cartes détachées).
  if (famille === 'comptes') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6" aria-hidden="true">
        <HeaderRow />
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5 px-5 py-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // PDJ : rangée de six tuiles + tableaux par étage (la page la plus haute).
  // ⚠ `gap-5`, comme `.pdj-doc` : `FormePdj` renvoie DEUX enfants flex, et
  // c'est le parent qui les espace.
  if (famille === 'pdj') {
    return (
      <div
        className="mx-auto flex w-full max-w-5xl flex-col gap-5"
        aria-hidden="true"
      >
        <HeaderRow />
        <FormePdj />
      </div>
    )
  }

  // RepJour : quatre cartes + barre de progression + tableau KPI + bande
  // de synthèse transverse.
  if (famille === 'repjour') {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4" aria-hidden="true">
        <HeaderRow />
        <FormeRepjour />
      </div>
    )
  }

  // Caisse : table des montants, comptage des coupures, commentaires.
  if (famille === 'caisse') {
    return (
      <div
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4"
        aria-hidden="true"
      >
        <HeaderRow />
        <FormeCaisse />
      </div>
    )
  }

  // Literie : grille des six étages + légende + planning des lits bébé.
  if (famille === 'literie') {
    return (
      <div
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4"
        aria-hidden="true"
      >
        <HeaderRow />
        <FormeLiterie />
      </div>
    )
  }

  // Analytique : LA silhouette analytique (celle des boards), paramétrée par le
  // chemin. Elle dessinait ici sa propre forme jusqu'au 2026-09-24 — 5 colonnes
  // et 8 lignes pour des pages qui en déclarent jusqu'à 8 et 31.
  if (famille === 'analytique') {
    const p = paramsAnalytique(pathname)
    return (
      <div
        className="mx-auto flex w-full max-w-5xl flex-col gap-6"
        aria-hidden="true"
      >
        <HeaderRow />
        <AnalytiqueSkeleton
          cols={p.cols}
          rows={p.rows}
          cards={p.cards}
          cardCols={p.cardCols}
          charts={p.charts}
        />
      </div>
    )
  }

  // Repli (parking, rapro, gestion) : cartes + tableau.
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
