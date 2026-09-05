import { QueryClient } from '@tanstack/react-query'

import { backoffMs, isOutageError } from '#/lib/backendHealth.ts'

/**
 * Réglages de cache par défaut du `QueryClient`.
 *
 * - `staleTime` : les données restent « fraîches » 1 min → une navigation
 *   aller-retour dans cette fenêtre ne redéclenche PAS de fetch (affichage
 *   instantané depuis le cache).
 * - `gcTime` : on garde les données en cache 5 min après leur dernier usage.
 * - `refetchOnWindowFocus: false` : pas de refetch à chaque retour d'onglet
 *   (comportement plus prévisible pour un back-office interne).
 * - `refetchOnReconnect: true` : au retour du réseau, les requêtes actives
 *   se rafraîchissent (une fois).
 * - `retry` selon la NATURE de l'erreur : une erreur métier (RLS, 4xx) est
 *   réessayée une seule fois comme avant ; une PANNE (5xx, timeout, réseau)
 *   est réessayée trois fois, espacées par le backoff exponentiel avec
 *   jitter de `lib/backendHealth.ts` (1 s, 1-2 s, 1-4 s), puis l'erreur
 *   remonte et le disjoncteur prend le relais (gardes, bandeau).
 */
export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (count, err) => (isOutageError(err) ? count < 3 : count < 1),
        retryDelay: (count) => backoffMs(count),
      },
    },
  })

  return {
    queryClient,
  }
}
