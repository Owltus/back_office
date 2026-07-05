import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Mode SPA : l'app est rendue côté client (auth cliente). TanStack Start
  // prérend un « shell » statique servi pour toutes les routes, sans serveur —
  // déploiement statique simple et robuste (pas de fonction serverless).
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
})

export default config
