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
// Sous-ensemble LATIN de la graisse variable d'Inter — le seul que tire un
// navigateur en français (les autres sous-ensembles sont déclarés avec leur
// `unicode-range` et jamais demandés). Importé en `?url` pour obtenir l'URL
// empreintée produite par le build, et non un chemin écrit à la main qui
// casserait silencieusement au prochain changement de version.
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'

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
      /*
       * Ouvre la connexion vers Supabase (DNS + TCP + TLS) PENDANT que le
       * JavaScript se télécharge, au lieu de la payer sur la première requête
       * de données.
       *
       * Mesuré le 2026-09-22 : la toute première requête vers la base met
       * 546 ms, dont environ 40 de mise en relation — le reste étant le
       * premier octet à froid. C'est peu, mais c'est du temps pris sur le
       * chemin critique pour rien, et la correction tient en une ligne.
       *
       * `crossOrigin` est nécessaire : les requêtes vers Supabase portent des
       * en-têtes d'authentification, donc en mode CORS. Sans cet attribut, la
       * connexion ouverte ne serait pas celle réutilisée.
       */
      {
        rel: 'preconnect',
        href: 'https://ozpavwghrmmkrnmkxodg.supabase.co',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
      /*
       * Préchargement de la police du texte courant (audit du 2026-09-21).
       *
       * Sans cette ligne, le `.woff2` n'est découvert qu'après téléchargement ET
       * analyse de `styles.css` — 144 Ko bruts — soit un aller-retour complet de
       * retard sur le premier texte dans la bonne police. Mesuré en production
       * sur le domaine déployé : aucun `preload` de police dans le `<head>`.
       *
       * `crossOrigin` est OBLIGATOIRE même en même origine : une police est
       * toujours demandée en mode CORS, et sans cet attribut le navigateur
       * télécharge le fichier DEUX fois — une pour le préchargement, une pour la
       * police elle-même.
       */
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: interLatin,
        crossOrigin: 'anonymous',
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
