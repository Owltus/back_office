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
      // Inter est AUTO-HÉBERGÉE depuis le 2026-09-20 (voir src/styles.css) :
      // plus aucune feuille de style tierce, donc plus aucune requête bloquante
      // vers un domaine que le réseau de l'hôtel peut filtrer. Ne pas
      // réintroduire de <link> vers fonts.googleapis.com : il est bloquant pour
      // le rendu même avec `preconnect`.
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
            temps de survoler un bouton sans le déclencher.
            `disableHoverableContent` : la bulle n'est PAS survolable — dès que la
            souris quitte le déclencheur elle se ferme (on ne peut ni la garder
            ouverte en glissant dessus, ni sélectionner son texte). */}
        <TooltipProvider delayDuration={300} disableHoverableContent>
          <AuthProvider>
            <AppAuthGate>{children}</AppAuthGate>
          </AuthProvider>
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  )
}
