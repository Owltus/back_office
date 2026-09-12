// `defineConfig` vient de vitest/config (et non de vite) : c'est la seule
// signature qui accepte la section `test` ci-dessous.
import { defineConfig } from 'vitest/config'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Mode SPA : l'app est rendue côté client (auth cliente). TanStack Start
  // prérend un « shell » statique servi pour toutes les routes, sans serveur —
  // déploiement statique simple et robuste (pas de fonction serverless).
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
  test: {
    // Les tests des Edge Functions (`supabase/functions/**`) tournent sous DENO,
    // pas sous Vitest : ils importent des spécificateurs `jsr:` et `npm:` que
    // Vite ne sait pas résoudre. Ils se lancent à part :
    //   deno test supabase/functions/import-report/waitAndSend.test.ts
    exclude: ['node_modules/**', 'dist/**', 'supabase/**'],
  },
})

export default config
