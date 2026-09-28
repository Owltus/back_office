//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...tanstackConfig,
  /*
   * Hooks React (le code porte déjà des `eslint-disable
   * react-hooks/exhaustive-deps` : sans le plugin chargé, ces directives
   * désignaient une règle inconnue).
   *
   * Pas `configs.flat.recommended` (v7) : il embarque les règles du React
   * Compiler (set-state-in-effect, refs, static-components, purity…) qui
   * lèvent ~55 erreurs dans du code existant (mesuré le 2026-09-28). On garde
   * les deux règles historiques ; activer le reste = un chantier à part.
   */
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // supabase/functions/** : runtime Deno (Deno.serve, imports jsr:) — hors du
    // périmètre TS/ESLint de l'app pour ne pas casser lint & build.
    // .claude/** : outillage de l'assistant ; cloudflare/** : Worker (runtime
    // Workers, hors tsconfig de l'app) ; public/tesseract/** : fichiers
    // tiers minifiés servis tels quels.
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'supabase/**',
      '.claude/**',
      'cloudflare/**',
      'public/tesseract/**',
    ],
  },
]
