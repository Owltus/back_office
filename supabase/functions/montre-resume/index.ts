// Edge Function `montre-resume` — résumé du matin pour la montre Garmin.
// Toute la logique vit dans handler.ts (testée par handler.test.ts), les
// lectures dans source.ts, les calculs dans regles.ts.

import { createClient } from 'jsr:@supabase/supabase-js@2.115.0'
import { traiter } from './handler.ts'
import { sourceSupabase } from './source.ts'

/** Une lecture qui ne répond pas en 8 s est une panne (→ 503), pas une attente. */
const fetchBorne: typeof fetch = (entree, init) =>
  fetch(entree, { ...init, signal: AbortSignal.timeout(8000) })

Deno.serve((req) =>
  traiter(req, {
    lire: (n) => Deno.env.get(n),
    creerSource: (url, cle) =>
      sourceSupabase(
        createClient(url, cle, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: fetchBorne },
        }),
      ),
    maintenant: () => new Date(),
  }),
)
