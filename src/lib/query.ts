import { QueryClient } from '@tanstack/react-query'

import { backoffMs, isOutageError } from '#/lib/backendHealth.ts'
import { brancherPersistance } from '#/lib/queryPersist.ts'

/**
 * Réglages de cache par défaut du `QueryClient`.
 *
 * - `staleTime` : les données restent « fraîches » 1 min → une navigation
 *   aller-retour dans cette fenêtre ne redéclenche PAS de fetch (affichage
 *   instantané depuis le cache).
 * - `gcTime` : 24 h depuis le 2026-09-24 (5 min auparavant). Ce n'est PAS un
 *   réglage de confort : c'est ce qui rend la persistance sur disque possible.
 *   Une entrée évincée de la mémoire n'est plus écrite, donc un `gcTime` court
 *   annulerait le cache de secours au bout de cinq minutes — précisément la
 *   situation qui a laissé l'hôtel devant un écran vide pendant la panne du
 *   2026-09-24. Le coût mémoire est négligeable (base de 27 Mo, et l'app n'en
 *   lit que des sous-ensembles), la fraîcheur reste gouvernée par `staleTime`
 *   qui, lui, ne change pas : une donnée vieille de deux heures est TOUJOURS
 *   rafraîchie au montage, elle est juste affichée immédiatement en attendant.
 * - `refetchOnWindowFocus: false` : pas de refetch à chaque retour d'onglet
 *   (comportement plus prévisible pour un back-office interne).
 * - `refetchOnReconnect: true` : au retour du réseau, les requêtes actives
 *   se rafraîchissent (une fois).
 * - `retry` selon la NATURE de l'erreur : une erreur métier (RLS, 4xx) est
 *   réessayée une seule fois comme avant ; une PANNE (5xx, timeout, réseau)
 *   est réessayée DEUX fois, espacées par le backoff exponentiel avec jitter
 *   de `lib/backendHealth.ts` (1 s, 1-2 s), puis l'erreur remonte et le
 *   disjoncteur prend le relais (gardes, bandeau).
 *
 *   ⚠ `count` est le nombre de réessais DÉJÀ effectués : `count < 2` donne
 *   donc TROIS tentatives au total, pas deux. C'est ce total qui compte, parce
 *   qu'il se multiplie par le timeout de 20 s de `lib/supabase.ts` : le pire
 *   cas d'une requête sur une base injoignable était de 4 × 20 s + ~7 s de
 *   backoff ≈ 87 s d'attente avant le moindre message (audit du 2026-09-20).
 *   Il passe à ~63 s, et le disjoncteur coupe court bien avant sur les
 *   requêtes suivantes. Ne pas remonter ce seuil sans refaire ce calcul.
 */
export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 24 * 60 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (count, err) => (isOutageError(err) ? count < 2 : count < 1),
        retryDelay: (count) => backoffMs(count),
      },
    },
  })

  /* Cache de secours sur disque — voir `lib/queryPersist.ts`. Sans effet hors
     navigateur, et sans effet sur le démarrage : la restauration n'est pas
     bloquante. */
  brancherPersistance(queryClient)

  return {
    queryClient,
  }
}
