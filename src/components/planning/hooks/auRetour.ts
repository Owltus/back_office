/*
 * Relecture du planning au retour sur l'onglet (prototype `occupation.ts`,
 * `useAuRetour`) : les données ont pu changer ailleurs (autre onglet, autre
 * poste). Le réglage de l'app (`lib/query.ts`, `refetchOnWindowFocus:
 * false`) reste celui des autres pages : seules les lectures `planning`
 * actives sont relues, au plus une fois toutes les deux secondes
 * (visibilitychange et focus arrivent souvent ensemble, et plusieurs hooks
 * montés écoutent en même temps : l'écart est tenu PAR client).
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { planningKeys } from '#/lib/planning/keys.ts'

/** Écart minimal entre deux relectures au retour. */
export const ECART_RETOUR_MS = 2000

const derniers = new WeakMap<QueryClient, number>()

/** Relit les lectures `planning` actives, sauf si une relecture au retour a
 * eu lieu il y a moins de 2 s. Rend vrai si elle part. */
export function relirePlanningAuRetour(
  qc: QueryClient,
  maintenant = Date.now(),
): boolean {
  const dernier = derniers.get(qc)
  if (dernier !== undefined && maintenant - dernier < ECART_RETOUR_MS)
    return false
  derniers.set(qc, maintenant)
  // Une lecture déjà en cours n'est pas annulée : elle sert de relecture.
  void qc.refetchQueries(
    { queryKey: planningKeys.all, type: 'active' },
    { cancelRefetch: false },
  )
  return true
}

/** À poser dans chaque hook de lecture du planning. */
export function useRelireAuRetour() {
  const qc = useQueryClient()
  useEffect(() => {
    const retour = () => {
      if (document.visibilityState !== 'visible') return
      relirePlanningAuRetour(qc)
    }
    document.addEventListener('visibilitychange', retour)
    window.addEventListener('focus', retour)
    return () => {
      document.removeEventListener('visibilitychange', retour)
      window.removeEventListener('focus', retour)
    }
  }, [qc])
}
