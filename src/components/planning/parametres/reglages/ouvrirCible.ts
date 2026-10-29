/*
 * Ouvrir le réglage visé par un lien `?ouvrir=<type>-<id>` (points « À
 * vérifier », `lib/planning/coherence.ts`). L'écran applique la cible une
 * fois ses données lues, puis la route retire le paramètre : le même lien,
 * cliqué de nouveau, rouvre le réglage.
 */

import { useEffect, useRef } from 'react'

/** L'id d'une cible `type-id`, ou undefined si elle vise autre chose. */
export function idCible(
  ouvrir: string | undefined,
  type: string,
): number | undefined {
  const m = ouvrir?.match(/^([a-z]+)-(\d+)$/)
  return m && m[1] === type ? Number(m[2]) : undefined
}

export function useOuvrirCible(
  ouvrir: string | undefined,
  pret: boolean,
  appliquer: (cible: string) => void,
  onOuvert?: () => void,
) {
  // Les fonctions changent à chaque rendu : on garde la dernière.
  const rappels = useRef({ appliquer, onOuvert })
  useEffect(() => {
    rappels.current = { appliquer, onOuvert }
  })
  useEffect(() => {
    if (!ouvrir || !pret) return
    rappels.current.appliquer(ouvrir)
    rappels.current.onOuvert?.()
  }, [ouvrir, pret])
}

/** Props d'un écran de réglages ouvert par un lien. */
export interface PropsOuvrir {
  ouvrir?: string
  onOuvert?: () => void
}
