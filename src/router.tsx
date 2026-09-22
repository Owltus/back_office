import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './lib/query.ts'
import { NotFound } from '#/components/shared/NotFound.tsx'
import { RouteError } from '#/components/shared/RouteError.tsx'
import { PendingRoute } from '#/components/shared/skeleton/RouteSkeleton.tsx'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Les données préchargées au survol (intent) restent réutilisables 1 min :
    // la navigation réelle repart alors du cache au lieu de refetch (avant : 0,
    // ce qui annulait le bénéfice du préchargement). Aligné sur le staleTime
    // du QueryClient (voir lib/query.ts).
    defaultPreloadStaleTime: 60_000,
    // Retour visuel pendant qu'une route télécharge son code. Sans lui, le clic
    // sur un onglet laissait l'ancienne page figée à l'écran, sans rien pour
    // dire qu'il se passait quelque chose (audit du 2026-09-20).
    // `defaultPendingMs` évite le clignotement quand le chunk est déjà là
    // (survol → préchargement).
    defaultPendingMs: 150,
    /*
     * ⚠ `defaultPendingMinMs: 300` A ÉTÉ RETIRÉ le 2026-09-22.
     *
     * Il avait été posé le 2026-09-20 pour empêcher un squelette apparu de
     * disparaître dans la foulée. L'intention était bonne, l'effet ne l'était
     * pas : c'est un PLANCHER DUR. Une fois le squelette affiché, la route est
     * retenue 300 ms de plus **même si ses données sont déjà là**.
     *
     * Et en mode SPA, il ne s'applique pas qu'aux navigations : le routeur
     * marque la route d'atterrissage « en attente » dès l'hydratation
     * (`ssr-client.ts`, `setMatchForcePending`), donc le minuteur est armé au
     * PREMIER chargement. Mesure du 2026-09-22 sur `/pdj` : le tableau se monte
     * à 1 020 ms alors que la dernière donnée dont il dépend est arrivée à
     * 711 ms — soit 309 ms d'écart, ce plancher plus un rendu.
     *
     * Le clignotement qu'il évitait est un inconfort ; 300 ms ajoutées à chaque
     * ouverture de page en sont un autre, et plus coûteux. Si le clignotement
     * revient de façon gênante, le remède est un `defaultPendingMinMs` court
     * (80-100 ms), pas 300 — et à re-mesurer, pas à supposer.
     */
    defaultPendingComponent: PendingRoute,
    defaultNotFoundComponent: () => <NotFound />,
    // Une exception de rendu n'efface plus toute l'app (audit 2026-09-06).
    defaultErrorComponent: ({ error, reset }) => (
      <RouteError error={error} reset={reset} />
    ),
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
