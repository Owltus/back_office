import { useQuery } from '@tanstack/react-query'

import {
  fetchClouds,
  fetchIssuerCodes,
  fetchIssuerDenylist,
  fetchIssuers,
} from '#/lib/facturation/cloudService.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'
import type { IssuerCodes } from '#/lib/facturation/issuerCodes.ts'
import type { IssuerDenylist } from '#/lib/facturation/issuerDenylist.ts'
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
  issuerCodes: IssuerCodes
  issuerDenylist: IssuerDenylist
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
  const { data: issuerCodes } = useQuery({
    queryKey: ['facturation', 'issuerCodes'],
    queryFn: fetchIssuerCodes,
    retry: false,
  })
  const { data: issuerDenylist } = useQuery({
    queryKey: ['facturation', 'issuerDenylist'],
    queryFn: fetchIssuerDenylist,
    retry: false,
  })
  return {
    serverPool: pool ?? { perCode: {} },
    issuers: issuers ?? [],
    issuerCodes: issuerCodes ?? { perIssuer: {} },
    issuerDenylist: issuerDenylist ?? { perIssuer: {} },
  }
}
