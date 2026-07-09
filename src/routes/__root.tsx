import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import { AuthProvider } from '#/components/auth/AuthContext.tsx'
import { AppAuthGate } from '#/components/auth/AppAuthGate.tsx'
import { THEME_INIT_SCRIPT } from '#/lib/theme.ts'

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
  // L'authentification enveloppe toute l'application : `AppAuthGate` décide, en
  // fonction de la session, d'afficher la page de connexion, un spinner, ou le
  // chrome complet (Navbar + contenu). Voir #/components/auth/AppAuthGate.tsx.
  //
  // `className="dark"` est le thème par défaut rendu par le SSR ; le script
  // ci-dessous le corrige selon le choix de l'utilisateur avant le premier paint.
  // Il modifie donc le DOM avant l'hydratation, d'où `suppressHydrationWarning`
  // (React comparerait sinon la classe rendue à celle, différente, du document).
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <AppAuthGate>{children}</AppAuthGate>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}
