/*
 * Les moments de l'établissement pour l'écran (2026-11-06, lot 2, A6) : lus
 * dans le référentiel déjà en cache, sans nouvelle lecture. Sans cache ni
 * client (tests de rendu) : ceux de l'hôtel.
 */

import { QueryClientContext } from '@tanstack/react-query'
import { useContext, useEffect, useMemo, useReducer } from 'react'

import { planningKeys } from '#/lib/planning/keys.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import type { Referentiel } from '#/lib/planning/types.ts'

const CLE = JSON.stringify(planningKeys.referentiel())

/** Les règles de l'établissement lues dans le référentiel en cache. */
export function useRegles(): RegleEtablissement {
  const qc = useContext(QueryClientContext)
  const [, rendre] = useReducer((n: number) => n + 1, 0)
  useEffect(
    () =>
      qc?.getQueryCache().subscribe((e) => {
        if (JSON.stringify(e.query.queryKey) === CLE) rendre()
      }),
    [qc],
  )
  const ref = qc?.getQueryData<Referentiel>(planningKeys.referentiel())
  return useMemo(() => lireRegles(ref), [ref])
}

export function useMoments(): Moments {
  const qc = useContext(QueryClientContext)
  const [, rendre] = useReducer((n: number) => n + 1, 0)
  useEffect(
    () =>
      qc?.getQueryCache().subscribe((e) => {
        if (JSON.stringify(e.query.queryKey) === CLE) rendre()
      }),
    [qc],
  )
  const ref = qc?.getQueryData<Referentiel>(planningKeys.referentiel())
  const lignes = ref?.moments
  return useMemo(() => lireRegles({ moments: lignes }).moments, [lignes])
}
