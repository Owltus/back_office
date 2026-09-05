import { createClient } from '@supabase/supabase-js'

import { backendHealth, isOutageStatus } from '#/lib/backendHealth.ts'

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

/**
 * Délai maximal d'une requête vers Supabase (PostgREST, GoTrue, Storage).
 * Sans lui, une promesse pend ~100 s sous 522/504 (vécu le 2026-09-05).
 * 20 s suffisent largement à un refresh de jeton sain sur réseau lent ; au
 * delà, auth-js classe le `fetch` rejeté en `AuthRetryableFetchError` et
 * retente de lui-même (cooldown 60 s), sans intervention de l'application.
 */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * `fetch` du client : timeout borné + observation pour le disjoncteur
 * (`lib/backendHealth.ts`). Un 2xx/4xx prouve que le backend répond (succès
 * pour le disjoncteur, l'erreur métier remonte normalement) ; un 5xx, un
 * timeout ou une erreur réseau ouvrent le disjoncteur. Un abandon demandé par
 * l'APPELANT (annulation TanStack au démontage) n'est pas une panne.
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const callerSignal = init?.signal ?? null
  const forward = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', forward, { once: true })
  }
  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    if (isOutageStatus(res.status)) backendHealth.reportFailure(res)
    else backendHealth.reportSuccess()
    return res
  } catch (err) {
    if (!callerSignal?.aborted) backendHealth.reportFailure(err)
    throw err
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', forward)
  }
}

export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key',
  {
    global: { fetch: fetchWithTimeout },
    // Session persistée côté navigateur pour l'authentification de l'onglet
    // /repjour (rôles gérés par les RLS Supabase). Client-only : l'îlot
    // /repjour est rendu sans SSR.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // false : le login se fait par signInWithPassword uniquement (aucun OAuth
      // ni magic-link), donc aucun token n'arrive jamais par l'URL. Inspecter
      // l'URL à chaque chargement serait une surface d'attaque gratuite (fixation
      // de session via fragment fabriqué). Repasser à true seulement si un flux
      // redirect (OAuth, lien magique, reset par lien) est ajouté un jour.
      detectSessionInUrl: false,
    },
  },
)
