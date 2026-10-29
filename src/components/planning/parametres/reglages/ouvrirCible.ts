/*
 * Ouvrir le réglage visé par un lien `?ouvrir=<type>-<id>` (points « À
 * vérifier », `lib/planning/coherence.ts`). L'écran applique la cible une
 * fois ses données lues, puis la route retire le paramètre : le même lien,
 * cliqué de nouveau, rouvre le réglage. Une cible qui n'existe plus
 * (réglage supprimé depuis, lien mal formé) le dit dans le fil de messages
 * de la page : `appliquer` rend false.
 */

import { useEffect, useRef } from 'react'

import { useNotifierOptionnel } from '#/components/planning/Messages.tsx'

export const MESSAGE_CIBLE_ABSENTE = "Ce réglage n'existe plus."

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
  /** Ouvre le réglage ; false : il n'existe pas (ou plus). */
  appliquer: (cible: string) => boolean,
  onOuvert?: () => void,
) {
  const notifier = useNotifierOptionnel()
  // Les fonctions changent à chaque rendu : on garde la dernière.
  const rappels = useRef({ appliquer, onOuvert, notifier })
  useEffect(() => {
    rappels.current = { appliquer, onOuvert, notifier }
  })
  useEffect(() => {
    if (!ouvrir || !pret) return
    if (!rappels.current.appliquer(ouvrir)) {
      rappels.current.notifier(MESSAGE_CIBLE_ABSENTE, 'attention')
    }
    rappels.current.onOuvert?.()
  }, [ouvrir, pret])
}

/** Props d'un écran de réglages ouvert par un lien. */
export interface PropsOuvrir {
  ouvrir?: string
  onOuvert?: () => void
}
