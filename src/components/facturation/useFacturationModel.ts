import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  fetchClouds,
  fetchIssuerCodes,
  fetchIssuerDenylist,
  fetchIssuers,
  fetchJournal,
} from '#/lib/facturation/cloudService.ts'
import { documentStoplist } from '#/lib/facturation/stopwords.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'
import type { IssuerCodes } from '#/lib/facturation/issuerCodes.ts'
import type { IssuerDenylist } from '#/lib/facturation/issuerDenylist.ts'
import type { Issuer } from '#/lib/facturation/issuers.ts'
import type { JournalEntry } from '#/lib/facturation/types.ts'

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
  journal: { entries: JournalEntry[] }
  /** Denylist adaptative (fréquence-document) dérivée du journal — SOURCE UNIQUE, partagée par
   *  le scoring (board) et l'affichage (galaxie, revue). Vide si journal trop petit. */
  stoplist: Set<string>
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
  const { data: journal } = useQuery({
    queryKey: ['facturation', 'journal'],
    queryFn: fetchJournal,
    retry: false,
  })
  // Mémoïsé sur `journal` (référence de cache stable) et non sur un `entries` recréé à chaque
  // rendu, pour ne pas relancer inutilement la re-détection / buildGalaxy.
  const stoplist = useMemo(
    () => documentStoplist(journal?.entries ?? []),
    [journal],
  )
  return {
    serverPool: pool ?? { perCode: {} },
    issuers: issuers ?? [],
    issuerCodes: issuerCodes ?? { perIssuer: {} },
    issuerDenylist: issuerDenylist ?? { perIssuer: {} },
    journal: journal ?? { entries: [] },
    stoplist,
  }
}
