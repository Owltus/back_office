import { Skeleton } from '#/components/ui/skeleton.tsx'
import { SkeletonTable } from '#/components/shared/skeleton/SkeletonTable.tsx'
import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'

/*
 * Silhouettes de chargement PAR PAGE, pour le squelette de ROUTE.
 *
 * POURQUOI — mesure du 2026-09-23. Le squelette de route dessinait la même
 * forme (4 cartes + tableau de 8 lignes) sur TOUTES les pages, soit 789 px
 * partout. Écart avec le contenu réel, mesuré page par page :
 *
 *   /pdj                  789 -> 1 243 px   (+58 %)
 *   /repjour/analytique   789 -> 1 249 px   (+58 %, en deux temps)
 *   /repjour              789 -> 1 044 px   (+32 %)
 *   /caisse               789 -> 1 015 px   (+29 %)
 *   /literie              789 ->   877 px   (+11 %)
 *   /rapro                789 ->   809 px   (+2 %)
 *   /parking              789 ->   789 px   (0)
 *
 * D'où la dissonance graphique : la page grandissait de plus de moitié à
 * l'arrivée des données.
 *
 * COMMENT — ces silhouettes réutilisent les VRAIES classes de mise en page
 * (`pdj-stats-grid`, `pdj-floors`, `rapro-grid`…). C'est possible parce que
 * toutes les feuilles de `src/styles/` sont chaînées depuis `styles.css`, donc
 * présentes dans la feuille GLOBALE — pas dans le chunk de la page. Le squelette
 * de route obtient ainsi les mêmes paddings, les mêmes hauteurs de ligne et la
 * même grille que le contenu, sans importer une ligne de code de board (ce qui
 * annulerait le découpage par route).
 *
 * ⚠ Ces silhouettes sont des RÉFLEXIONS, pas des sources de vérité : si un board
 * change de structure, elles dérivent en silence. Le garde-fou est le test
 * `PageShapes.test.ts`, qui vérifie les invariants comptables (nombre d'étages,
 * de chambres par étage, de tuiles), et la mesure avant/après consignée dans
 * `plan/squelette-fidele-2026-09-23/`.
 */

/** Chambres par étage, dérivées de l'inventaire réel — jamais codées en dur. */
export const CHAMBRES_PAR_ETAGE = [
  ...new Set(ALL_ROOMS.map((r) => Math.floor(r / 100))),
].map((etage) => ALL_ROOMS.filter((r) => Math.floor(r / 100) === etage).length)

/**
 * `/pdj` — rangée de six tuiles puis les tableaux par étage.
 *
 * Calque de `BoardSkeleton` (local à `BreakfastBoard.tsx`), qui prend le relais
 * dès que le board est monté. Les deux doivent rester identiques : c'est le
 * passage de l'un à l'autre qui doit être invisible.
 */
export function FormePdj() {
  return (
    <>
      <div className="pdj-stats">
        <div className="pdj-stats-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            /* MÊMES classes que la vraie tuile (`stat-tile`, `stat-tile__body`,
               `stat-tile__label`) : c'est ce qui garantit la hauteur, et non un
               réglage à l'œil. Mesuré le 2026-09-23 : la vraie tuile fait
               77,8 px ; l'ancienne silhouette, avec ses propres classes, en
               faisait 60. */
            <div
              key={i}
              className="stat-tile flex items-stretch overflow-hidden rounded-xl border border-border bg-card"
            >
              <span className="w-2 shrink-0 bg-muted" />
              <div className="stat-tile__body flex min-w-0 flex-1 flex-col gap-1 px-3 py-[0.55rem]">
                <span className="stat-tile__label">
                  <Skeleton className="h-2.5 w-16" />
                </span>
                <div className="flex flex-1 flex-col justify-center gap-1">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="pdj-floors">
        {CHAMBRES_PAR_ETAGE.map((nb, i) => (
          <div key={i} className="pdj-floor">
            <table>
              <tbody>
                {Array.from({ length: nb }).map((_, r) => (
                  /* CINQ cellules, comme la vraie ligne. L'ancienne silhouette
                     n'en dessinait que quatre : elle omettait la colonne des
                     cases à cocher, qui est justement l'élément le plus HAUT de
                     la ligne. Mesuré le 2026-09-23 : vraie ligne 35,5 px,
                     silhouette 26,4 px — soit 215 px manquants sur la page,
                     l'essentiel de la dissonance signalée. */
                  <tr key={r}>
                    <td className="pdj-room">
                      <Skeleton className="h-3 w-8" />
                    </td>
                    <td className="pdj-name">
                      <span className="pdj-name-inner pdj-val-normal">
                        <Skeleton className="h-3 w-24" />
                      </span>
                    </td>
                    <td className="pdj-c pdj-status">
                      <Skeleton className="mx-auto h-3 w-4" />
                    </td>
                    <td className="pdj-c pdj-stay-count">
                      <Skeleton className="mx-auto h-3 w-6" />
                    </td>
                    <td className="pdj-c">
                      <span className="pdj-checkboxes">
                        {Array.from({ length: 2 }).map((_, c) => (
                          <Skeleton key={c} className="size-7 rounded-md" />
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * `/repjour` — trois cartes de synthèse, barre de progression, tableau KPI.
 *
 * Calque de `components/repjour/BoardSkeleton.tsx`, qui prend le relais au
 * montage du board. Trois cartes et non quatre : la quatrième (« Pris depuis la
 * veille ») est optionnelle, et dessiner une carte fantôme qui disparaît est
 * pire qu'en dessiner une de moins.
 */
export function FormeRepjour() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4 ${
                i === 0 ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="mt-2 h-7 w-24" />
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm sm:px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
      </div>
      <SkeletonTable cols={5} rows={5} bounded={false} />
    </div>
  )
}

/**
 * `/caisse` — feuille de caisse : bandeau d'état, deux colonnes de saisie,
 * puis le bloc de comptage des coupures.
 *
 * Mesure du 2026-09-23 : 1 015 px de contenu contre 789 px de squelette
 * générique, soit +29 %.
 */
export function FormeCaisse() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, col) => (
          <div
            key={col}
            className="space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="ml-auto h-8 w-28 rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-40" />
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="h-9 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * `/literie` — état des lits bébé : quelques cartes de stock puis la liste des
 * attributions du jour.
 *
 * Écart mesuré avant correction : 789 contre 877 px (+11 %).
 */
export function FormeLiterie() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>
      <SkeletonTable cols={4} rows={8} bounded={false} />
    </div>
  )
}
