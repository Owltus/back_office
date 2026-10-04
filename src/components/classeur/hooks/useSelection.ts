import { useCallback, useEffect, useMemo, useState } from 'react'

import { cleRef, parseCleRef } from '#/lib/classeur/ordre.ts'
import type { CleRef, ItemRef } from '#/lib/classeur/ordre.ts'
import type { ChapterItem } from '#/lib/classeur/types.ts'

/*
 * Sélection multiple des éléments d'un chapitre — portée de Registre
 * (`pages/chapter/hooks/useSelection.ts`). La clé de sélection est la
 * `CleRef` de `lib/classeur/ordre.ts` (`kind:id`), la même que
 * l'identifiant dnd-kit. Échap vide la sélection.
 *
 * Mode sélection : dès qu'un élément est coché, OU ouvert explicitement par
 * `commencer()` — le bouton « Sélectionner » de l'en-tête, seule entrée au
 * doigt (audit tactile 2026-09-28 : Ctrl + clic n'existe pas sur tablette).
 */
export function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<CleRef>>(() => new Set())
  const [ouvert, setOuvert] = useState(false)
  const commencer = useCallback(() => setOuvert(true), [])

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
    setOuvert(false)
    setSelected((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  const count = selected.size
  const selectionMode = count > 0 || ouvert

  // Échap : tout désélectionner (écoute globale, seulement en mode sélection).
  useEffect(() => {
    if (!selectionMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Échap ferme d'abord un menu ou un dialogue ouvert (« Déplacer
        // vers… ») : il ne doit pas vider la sélection en même temps.
        // ⚠ Écoute en CAPTURE sur `window` (audit du 2026-10-04, B3) :
        // Radix ferme sur Échap par un écouteur en capture sur `document`,
        // et le navigateur rend la main aux microtâches entre deux
        // écouteurs ; en phase de bouillonnement, le dialogue était DÉJÀ
        // fermé (`data-state="closed"` ou démonté) quand on le cherchait.
        // La capture sur `window` passe avant celle de `document`.
        if (e.defaultPrevented) return
        if (
          document.querySelector(
            '[role="menu"][data-state="open"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
          )
        )
          return
        e.preventDefault()
        clear()
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () =>
      window.removeEventListener('keydown', handler, { capture: true })
  }, [selectionMode, clear])

  /** Les références sélectionnées, pour les écritures groupées. */
  const refs = useMemo<ItemRef[]>(
    () => Array.from(selected).flatMap((k) => parseCleRef(k) ?? []),
    [selected],
  )

  return useMemo(
    () => ({
      selected,
      refs,
      toggle,
      selectAll,
      clear,
      commencer,
      count,
      selectionMode,
    }),
    [selected, refs, toggle, selectAll, clear, commencer, count, selectionMode],
  )
}
