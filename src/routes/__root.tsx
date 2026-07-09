import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import { AuthProvider } from '#/components/auth/AuthContext.tsx'
import { AppAuthGate } from '#/components/auth/AppAuthGate.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'
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
      // Inter, police de toute l'app. Les deux `preconnect` ouvrent la
      // connexion (DNS + TLS) vers Google Fonts pendant que le reste se
      // télécharge, au lieu d'attendre la découverte du <link>. `gstatic`
      // sert les fichiers .woff2 et exige `crossorigin`.
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
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
        {/* Un seul provider d'infobulles pour toute l'app : les boards en
            montaient chacun un, avec des délais divergents. 300 ms laisse le
            temps de survoler un bouton sans le déclencher. */}
        <TooltipProvider delayDuration={300}>
          <AuthProvider>
            <AppAuthGate>{children}</AppAuthGate>
          </AuthProvider>
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  )
}
