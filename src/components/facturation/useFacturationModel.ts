import { useQuery } from '@tanstack/react-query'

import { fetchClouds, fetchIssuers } from '#/lib/facturation/cloudService.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'
import type { Issuer } from '#/lib/facturation/issuers.ts'

/**
 * Lectures Supabase de la facturation, en cache (nuages de mots appris + dictionnaire
 * d'émetteurs). Partagé par l'atelier et la page galaxie. Dégradation gracieuse :
 * `retry:false` et valeurs par défaut vides si la table n'existe pas / réseau KO.
 * La POLITIQUE d'usage reste à l'appelant (le board fusionne avec la graine, la
 * galaxie garde l'appris brut).
 */
export function useFacturationModel(): {
  serverPool: WordPool
  issuers: Issuer[]
} {
  const { data: pool } = useQuery({
    queryKey: ['facturation', 'clouds'],
    queryFn: fetchClouds,
    retry: false,
  })
  const { data: issuers } = useQuery({
    queryKey: ['facturation', 'issuers'],
    queryFn: fetchIssuers,
    retry: false,
  })
  return { serverPool: pool ?? { perCode: {} }, issuers: issuers ?? [] }
}
