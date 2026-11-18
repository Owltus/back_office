/*
 * Mode copie du planning (demande utilisateur du 2026-11-18) : tant que Ctrl
 * (Cmd sur Mac) reste enfoncé, le premier clic sur un shift le retient, les
 * clics suivants le collent. Relâcher la touche, quitter la fenêtre (blur) ou
 * masquer l'onglet vide la mémoire : le mode ne reste jamais bloqué.
 *
 * Les collages sont mis en FILE : plusieurs clics rapides s'écrivent l'un
 * après l'autre, dans l'ordre, sans se refuser l'un l'autre.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { toucheCopie } from '#/components/planning/saisieRapide.ts'
import type { ShiftCopie } from '#/components/planning/saisieRapide.ts'

export interface MemoireCopie {
  copie: ShiftCopie
  /** Valeur de l'attribut de la case source (mise en évidence). */
  source: string
}

export function useCopieCtrl(actif: boolean) {
  const touche = useMemo(
    () =>
      toucheCopie(typeof navigator === 'undefined' ? '' : navigator.platform),
    [],
  )
  const [enfonce, setEnfonce] = useState(false)
  const [memoire, setMemoire] = useState<MemoireCopie | null>(null)
  const file = useRef<Promise<unknown>>(Promise.resolve())

  const arreter = useCallback(() => {
    setEnfonce(false)
    setMemoire(null)
  }, [])

  useEffect(() => {
    if (!actif) {
      arreter()
      return
    }
    const bas = (e: KeyboardEvent) => {
      if (e.key === touche) setEnfonce(true)
    }
    const haut = (e: KeyboardEvent) => {
      if (e.key === touche) arreter()
    }
    const cache = () => {
      if (document.visibilityState === 'hidden') arreter()
    }
    window.addEventListener('keydown', bas)
    window.addEventListener('keyup', haut)
    window.addEventListener('blur', arreter)
    document.addEventListener('visibilitychange', cache)
    return () => {
      window.removeEventListener('keydown', bas)
      window.removeEventListener('keyup', haut)
      window.removeEventListener('blur', arreter)
      document.removeEventListener('visibilitychange', cache)
    }
  }, [actif, touche, arreter])

  /** Ajoute une écriture à la file ; rend sa promesse. */
  const enFile = useCallback(<T>(action: () => Promise<T>): Promise<T> => {
    const suite = file.current.then(action, action)
    file.current = suite.catch(() => undefined)
    return suite
  }, [])

  return {
    touche,
    /** Touche enfoncée (curseur et survol des cases). */
    enfonce: actif && enfonce,
    memoire: actif ? memoire : null,
    copier: setMemoire,
    arreter,
    enFile,
  }
}
