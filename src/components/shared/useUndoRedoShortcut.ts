import { useEffect, useRef } from 'react'

/* --------------------------------------------------------------------------
 * Raccourcis undo/redo globaux : Ctrl+Z = annuler ; Ctrl+Y ou Ctrl/Cmd+Shift+Z
 * = rétablir. Sur macOS, Cmd tient lieu de Ctrl. Ignoré quand le focus est dans
 * un champ de saisie (l'undo texte natif du navigateur y reste actif).
 *
 * Handlers gardés dans des refs (comme usePrintShortcut) : l'écouteur posé une
 * fois appelle toujours la dernière closure, sans se réabonner à chaque render.
 * ------------------------------------------------------------------------ */
export function useUndoRedoShortcut(
  onUndo: () => void,
  onRedo: () => void,
): void {
  const undo = useRef(onUndo)
  undo.current = onUndo
  const redo = useRef(onRedo)
  redo.current = onRedo

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo.current()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
