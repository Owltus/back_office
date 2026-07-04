import { createClient } from '@supabase/supabase-js'

/**
 * Second client Supabase dédié à la CRÉATION de comptes (signUp) par un admin.
 *
 * Il partage l'URL et la clé anon du client principal (#/lib/supabase.ts) mais
 * s'en distingue par trois réglages critiques :
 *   - `persistSession: false` + `autoRefreshToken: false` : un `signUp` ne doit
 *     PAS ouvrir de session persistée ni rafraîchir de token ;
 *   - `storageKey: 'repjour-signup'` : clé de stockage DISTINCTE du client
 *     principal. Sans elle, les deux clients partageraient la même entrée
 *     localStorage et un `signUp` ÉCRASERAIT la session de l'admin courant (D11).
 *
 * Sécurité : clé anon (jamais `service_role`), donc toutes les écritures restent
 * soumises aux RLS Supabase.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

export const supabaseSignup = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: 'repjour-signup',
    },
  },
)
