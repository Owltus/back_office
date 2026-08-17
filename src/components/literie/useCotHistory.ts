import { useCallback, useRef, useState } from 'react'

import { invert } from '#/lib/baby-cots/history.ts'
import type { CotAssignmentPatch, CotCommand } from '#/lib/baby-cots/history.ts'
import type { CotAssignment } from '#/lib/baby-cots/types.ts'

/* --------------------------------------------------------------------------
 * Piles undo/redo du planning lits bébé. Réplique EXACTE de
 * components/parking/useParkingHistory.ts, adaptée à `CotAssignment`.
 *
 * Le hook décide QUOI faire (dépiler, inverser, réempiler) ; le board sait
 * COMMENT l'appliquer (état local + create/update/delete + gardes), via les
 * primitives injectées. Chaque primitive renvoie un booléen : false = action
 * PÉRIMÉE (assignation disparue, lit repris, fenêtre de grâce dépassée) →
 * l'undo saute l'entrée et tente la suivante, sans bruit.
 *
 * `record` n'est appelé QUE depuis les handlers de MON action (jamais depuis le
 * canal realtime) : c'est ce qui garde la pile « mes actions seulement ».
 * ------------------------------------------------------------------------ */

/** Primitives fournies par le board (appliquent localement + persistent). */
export interface CotHistoryApply {
  applyCreate: (snapshot: CotAssignment) => boolean
  applyDelete: (id: string) => boolean
  applyUpdate: (id: string, patch: CotAssignmentPatch) => boolean
}

const LIMIT = 50 // profondeur d'historique (borne mémoire)

export function useCotHistory(apply: CotHistoryApply) {
  // L'objet `apply` change d'identité à chaque render : on le garde dans une ref
  // pour que undo/redo appellent toujours la dernière closure sans se réabonner.
  const applyRef = useRef(apply)
  applyRef.current = apply

  const undoStack = useRef<CotCommand[]>([])
  const redoStack = useRef<CotCommand[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const sync = () => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }

  // Applique une commande dans son sens DIRECT (create→insert, delete→delete,
  // update→after). L'undo appelle applyCommand(invert(cmd)), le redo applyCommand(cmd).
  const applyCommand = (cmd: CotCommand): boolean => {
    const a = applyRef.current
    switch (cmd.kind) {
      case 'create':
        return a.applyCreate(cmd.snapshot)
      case 'delete':
        return a.applyDelete(cmd.snapshot.id)
      case 'update':
        return a.applyUpdate(cmd.id, cmd.after)
    }
  }

  // Enregistre une action DÉJÀ appliquée. Toute nouvelle action vide le redo.
  const record = useCallback((cmd: CotCommand) => {
    undoStack.current.push(cmd)
    if (undoStack.current.length > LIMIT) undoStack.current.shift()
    redoStack.current = []
    sync()
  }, [])

  const undo = useCallback(() => {
    while (undoStack.current.length) {
      const cmd = undoStack.current.pop() as CotCommand
      if (applyCommand(invert(cmd))) {
        redoStack.current.push(cmd)
        sync()
        return
      }
      // périmée → jetée, on tente la précédente
    }
    sync()
  }, [])

  const redo = useCallback(() => {
    while (redoStack.current.length) {
      const cmd = redoStack.current.pop() as CotCommand
      if (applyCommand(cmd)) {
        undoStack.current.push(cmd)
        sync()
        return
      }
    }
    sync()
  }, [])

  return { record, undo, redo, canUndo, canRedo }
}
