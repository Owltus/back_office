import { useEffect, useRef } from 'react'

/**
 * Détourne Ctrl/Cmd + P vers l'impression DE LA PAGE, celle du bouton.
 *
 * Sans cela, le raccourci lance l'impression native du navigateur, qui rend le
 * DOM tel quel : sur la caisse et le rapprochement, le document imprimé est
 * bâti par jsPDF et n'a rien à voir avec l'écran. Deux façons d'imprimer, deux
 * résultats — dont un bancal. Le bouton reste la seule construction de page.
 *
 * `onPrint` peut donc aussi REFUSER d'imprimer (feuille non clôturée, aucune
 * donnée) et ouvrir une modale à la place : le raccourci passe par la même
 * porte que le bouton, règles comprises.
 *
 * Le handler est lu dans une ref : l'écouteur est posé une fois, mais appelle
 * toujours la dernière closure — sinon il capturerait l'état du premier rendu
 * (une feuille éternellement « non clôturée »).
 */
export function usePrintShortcut(onPrint: () => void): void {
  const handler = useRef(onPrint)
  handler.current = onPrint

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'p' && e.key !== 'P') return
      // Ctrl (Windows) ou Cmd (macOS), seuls : Ctrl+Shift+P est la palette de
      // commandes du navigateur, on la laisse passer.
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      e.preventDefault()
      handler.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
