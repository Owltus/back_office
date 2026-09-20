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
    // (survol → préchargement) ; `defaultPendingMinMs` évite qu'un squelette
    // apparu ne disparaisse dans la foulée.
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
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
