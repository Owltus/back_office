import { QueryClient } from '@tanstack/react-query'

/**
 * Réglages de cache par défaut du `QueryClient`.
 *
 * - `staleTime` : les données restent « fraîches » 1 min → une navigation
 *   aller-retour dans cette fenêtre ne redéclenche PAS de fetch (affichage
 *   instantané depuis le cache).
 * - `gcTime` : on garde les données en cache 5 min après leur dernier usage.
 * - `refetchOnWindowFocus: false` : pas de refetch à chaque retour d'onglet
 *   (comportement plus prévisible pour un back-office interne).
 * - `retry: 1` : un seul réessai en cas d'échec réseau (évite d'allonger les
 *   temps d'attente en cas de coupure).
 */
export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })

  return {
    queryClient,
  }
}
