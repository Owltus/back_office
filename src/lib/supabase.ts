import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase partagé côté navigateur.
 *
 * Renseigner les clés dans un fichier `.env` (voir `.env.example`) :
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 *
 * Les variables préfixées `VITE_` sont exposées au client par Vite.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // On ne jette pas d'erreur pour laisser l'app démarrer sans clés,
  // mais on prévient clairement en console.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes — ' +
      'renseignez votre fichier .env pour activer Supabase.',
  )
}

export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key',
  {
    // Session persistée côté navigateur pour l'authentification de l'onglet
    // /repjour (rôles gérés par les RLS Supabase). Client-only : l'îlot
    // /repjour est rendu sans SSR.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
