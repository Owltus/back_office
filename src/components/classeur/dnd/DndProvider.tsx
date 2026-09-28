import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DndContext, closestCenter, pointerWithin } from '@dnd-kit/core'
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  UniqueIdentifier,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

import { useCapteursClasseur } from '#/components/classeur/dnd/useCapteursClasseur.ts'
import {
  DndRegistryContext,
  estItemDrag,
} from '#/components/classeur/dnd/useDndRegistry.ts'
import type {
  DndRegistryValue,
  DragData,
  DragHandler,
} from '#/components/classeur/dnd/useDndRegistry.ts'

/*
 * Fournisseur de glisser-déposer d'un classeur — porté de Registre
 * (`lib/dnd/DndProvider.tsx`). Monté par le layout `/classeur/$classeurId`,
 * autour de la colonne des chapitres et de l'`Outlet`.
 *
 * Détection de collision adaptative :
 *   - chapitres et classeurs (tri) : `closestCenter` ;
 *   - éléments de chapitre (dépôt sur un autre chapitre) : `pointerWithin`.
 * Contrainte verticale pour les listes ordonnées seulement.
 */
export function DndProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Record<string, DragHandler>>({})
  const [activeDragType, setActiveDragType] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null)
  const [activeOverId, setActiveOverId] = useState<UniqueIdentifier | null>(
    null,
  )
  // Lu par la détection de collision sans re-rendu.
  const activeDragTypeRef = useRef<string | null>(null)

  const registerHandler = useCallback((type: string, handler: DragHandler) => {
    handlersRef.current[type] = handler
  }, [])

  const unregisterHandler = useCallback((type: string) => {
    delete handlersRef.current[type]
  }, [])

  // Souris 5 px, doigt : appui long (audit tactile 2026-09-28).
  const sensors = useCapteursClasseur()

  const reset = useCallback(() => {
    setActiveDragType(null)
    setActiveDragData(null)
    setActiveOverId(null)
    activeDragTypeRef.current = null
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    const type = data?.type ?? null
    setActiveDragType(type)
    setActiveDragData(data ?? null)
    activeDragTypeRef.current = type
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setActiveOverId(event.over?.id ?? null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const data = event.active.data.current as DragData | undefined
      const type = data?.type
      const handler = type ? handlersRef.current[type] : undefined
      if (handler) handler(event)
      reset()
    },
    [reset],
  )

  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (estItemDrag(activeDragTypeRef.current)) return pointerWithin(args)
    return closestCenter(args)
  }, [])

  const modifiers =
    activeDragType === 'chapter' || activeDragType === 'classeur'
      ? [restrictToVerticalAxis]
      : []

  const registryValue: DndRegistryValue = {
    registerHandler,
    unregisterHandler,
    activeDragType,
    activeDragData,
    activeOverId,
  }

  return (
    <DndRegistryContext.Provider value={registryValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        modifiers={modifiers}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={reset}
      >
        {children}
      </DndContext>
    </DndRegistryContext.Provider>
  )
}
