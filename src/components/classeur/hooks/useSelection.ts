import { useCallback, useEffect, useMemo, useState } from 'react'

import { cleRef, parseCleRef } from '#/lib/classeur/ordre.ts'
import type { CleRef, ItemRef } from '#/lib/classeur/ordre.ts'
import type { ChapterItem } from '#/lib/classeur/types.ts'

/*
 * Sélection multiple des éléments d'un chapitre — portée de Registre
 * (`pages/chapter/hooks/useSelection.ts`). La clé de sélection est la
 * `CleRef` de `lib/classeur/ordre.ts` (`kind:id`), la même que
 * l'identifiant dnd-kit. Échap vide la sélection.
 */
export function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<CleRef>>(() => new Set())

  const toggle = useCallback((key: CleRef) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAll = useCallback((items: ReadonlyArray<ChapterItem>) => {
    setSelected(new Set(items.map((it) => cleRef(it.kind, it.data.id))))
  }, [])

  const clear = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  const count = selected.size
  const selectionMode = count > 0

  // Échap : tout désélectionner (écoute globale, seulement en mode sélection).
  useEffect(() => {
    if (!selectionMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        clear()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectionMode, clear])

  /** Les références sélectionnées, pour les écritures groupées. */
  const refs = useMemo<ItemRef[]>(
    () => Array.from(selected).flatMap((k) => parseCleRef(k) ?? []),
    [selected],
  )

  return useMemo(
    () => ({ selected, refs, toggle, selectAll, clear, count, selectionMode }),
    [selected, refs, toggle, selectAll, clear, count, selectionMode],
  )
}
