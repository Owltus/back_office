import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './lib/query.ts'
import { NotFound } from '#/components/shared/NotFound.tsx'

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
    defaultNotFoundComponent: () => <NotFound />,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
