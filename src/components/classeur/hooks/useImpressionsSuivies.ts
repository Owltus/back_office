import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { stockageNavigateur } from '#/lib/classeur/brouillon.ts'
import {
  EVENEMENT_IMPRESSIONS,
  ecrireEmpreintes,
  lireEmpreintes,
  marquerImprimes,
} from '#/lib/classeur/impressionsSuivies.ts'
import type { Empreintes } from '#/lib/classeur/impressionsSuivies.ts'
import type { ChapterItem } from '#/lib/classeur/types.ts'

/**
 * Empreintes de la dernière impression d'un classeur (ce poste, ce compte)
 * et la fonction qui retient une impression. Les écrans ouverts sur le même
 * classeur se relisent à chaque écriture (événement de fenêtre).
 */
export function useImpressionsSuivies(classeurId: number): {
  empreintes: Empreintes
  pret: boolean
  retenir: (items: readonly ChapterItem[]) => void
} {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [empreintes, setEmpreintes] = useState<Empreintes>({})

  useEffect(() => {
    if (userId === null) return
    const relire = () =>
      setEmpreintes(lireEmpreintes(stockageNavigateur(), userId, classeurId))
    relire()
    window.addEventListener(EVENEMENT_IMPRESSIONS, relire)
    return () => window.removeEventListener(EVENEMENT_IMPRESSIONS, relire)
  }, [userId, classeurId])

  const retenir = useCallback(
    (items: readonly ChapterItem[]) => {
      if (userId === null || items.length === 0) return
      const stockage = stockageNavigateur()
      const suite = marquerImprimes(
        lireEmpreintes(stockage, userId, classeurId),
        items,
      )
      ecrireEmpreintes(stockage, userId, classeurId, suite)
      window.dispatchEvent(new Event(EVENEMENT_IMPRESSIONS))
    },
    [userId, classeurId],
  )

  return { empreintes, pret: userId !== null, retenir }
}
