/*
 * Les moments de l'établissement pour l'écran (2026-11-06, lot 2, A6) : lus
 * dans le référentiel déjà en cache, sans nouvelle lecture. Sans cache ni
 * client (tests de rendu) : ceux de l'hôtel.
 */

import { QueryClientContext } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useMemo, useReducer } from 'react'

import { planningKeys } from '#/lib/planning/keys.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import type { Referentiel } from '#/lib/planning/types.ts'

const CLE = JSON.stringify(planningKeys.referentiel())

/** Rend à nouveau quand les données du référentiel changent. Seuls les
 * événements « updated » comptent, et le rendu part après le tour en cours :
 * le cache prévient aussi PENDANT le rendu d'un autre composant (un
 * observateur ajouté), et React refuse qu'on le mette à jour à ce moment-là
 * (« Cannot update a component while rendering a different component »). */
function useReferentielSuivi(qc: QueryClient | undefined) {
  const [, rendre] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    let actif = true
    const fin = qc?.getQueryCache().subscribe((e) => {
      if (e.type !== 'updated' || JSON.stringify(e.query.queryKey) !== CLE)
        return
      queueMicrotask(() => actif && rendre())
    })
    return () => {
      actif = false
      fin?.()
    }
  }, [qc])
}

/** Les règles de l'établissement lues dans le référentiel en cache. */
export function useRegles(): RegleEtablissement {
  const qc = useContext(QueryClientContext)
  useReferentielSuivi(qc)
  const ref = qc?.getQueryData<Referentiel>(planningKeys.referentiel())
  return useMemo(() => lireRegles(ref), [ref])
}

export function useMoments(): Moments {
  const qc = useContext(QueryClientContext)
  useReferentielSuivi(qc)
  const ref = qc?.getQueryData<Referentiel>(planningKeys.referentiel())
  const lignes = ref?.moments
  return useMemo(() => lireRegles({ moments: lignes }).moments, [lignes])
}
