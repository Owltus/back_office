import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'

import { Navbar } from '../components/Navbar'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Back Office',
      },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // La clé change à chaque route -> l'animation d'entrée se rejoue.
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <html lang="fr" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="flex h-dvh flex-col overflow-hidden print:h-auto print:overflow-visible">
          <Navbar />
          <main
            key={pathname}
            className="app-scroll flex flex-1 flex-col overflow-y-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 print:overflow-visible"
          >
            {children}
          </main>
        </div>
        <Scripts />
      </body>
    </html>
  )
}
