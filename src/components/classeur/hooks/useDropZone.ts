import { useCallback, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { lireFichiers, trierFichiers } from '#/lib/classeur/importFichiers.ts'
import type { FichierImporte } from '#/lib/classeur/importFichiers.ts'

export interface DropZoneResult {
  isDragOver: boolean
  dragProps: {
    onDragEnter: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
}

/*
 * Dépôt de fichiers `.md` / `.txt` sur la page chapitre — porté de Registre
 * (`pages/chapter/DropZone.tsx`, `useDropZone`). Les fichiers sont triés
 * (extension, borne `MAX_MARKDOWN_BYTES`) puis lus ; `onImport` reçoit les
 * acceptés, `onRefus` les messages des refusés.
 *
 * Un glisser d'ÉLÉMENT dnd-kit (carte, chapitre) ne porte pas de fichiers :
 * `dataTransfer.types` ne contient pas `Files`, et le surlignage ne
 * s'affiche pas.
 */
export function useDropZone(
  onImport: (fichiers: FichierImporte[]) => void,
  onRefus?: (messages: string[]) => void,
): DropZoneResult {
  const [isDragOver, setIsDragOver] = useState(false)
  const compteur = useRef(0)

  const porteDesFichiers = (e: DragEvent) =>
    Array.from(e.dataTransfer.types).includes('Files')

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!porteDesFichiers(e)) return
    e.preventDefault()
    compteur.current += 1
    setIsDragOver(true)
  }, [])

  const onDragOver = useCallback((e: DragEvent) => {
    if (!porteDesFichiers(e)) return
    e.preventDefault()
  }, [])

  const onDragLeave = useCallback((e: DragEvent) => {
    if (!porteDesFichiers(e)) return
    e.preventDefault()
    compteur.current -= 1
    if (compteur.current <= 0) {
      compteur.current = 0
      setIsDragOver(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!porteDesFichiers(e)) return
      e.preventDefault()
      compteur.current = 0
      setIsDragOver(false)
      const { acceptes, refus } = trierFichiers(
        Array.from(e.dataTransfer.files),
      )
      if (refus.length > 0) onRefus?.(refus)
      if (acceptes.length === 0) return
      void lireFichiers(acceptes).then(onImport)
    },
    [onImport, onRefus],
  )

  return {
    isDragOver,
    dragProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  }
}
