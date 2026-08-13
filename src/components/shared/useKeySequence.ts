import { useEffect, useRef } from 'react'

/* --------------------------------------------------------------------------
 * Détecteur de SÉQUENCE clavier générique (façon cheat code / Konami) qui
 * déclenche une ACTION (callback), pas un effet visuel. On tape un mot n'importe
 * où — sans champ de saisie — et `onMatch` est appelé.
 *
 * - Buffer glissant des dernières frappes, insensible à la casse ET aux accents
 *   (repris de `SecretEffect`).
 * - GARDE de focus : ignore les frappes venant d'un champ (INPUT / TEXTAREA /
 *   SELECT / contenteditable) pour ne pas s'armer pendant une saisie — crucial
 *   ici car le match déclenche une action métier (contrairement à SecretEffect,
 *   dont l'effet est visuel et inoffensif).
 * - `onMatch` lu via ref : l'écouteur posé une fois appelle toujours la dernière
 *   closure, sans se réabonner à chaque render (motif usePrintShortcut).
 * ------------------------------------------------------------------------ */

// Une frappe → minuscule sans accent : NFD décompose « é » en « e » + accent
// combinant, et on ne garde que les lettres a–z (accents et autres touches
// ignorés). « AutoMode » comme « automode » produisent donc « automode ».
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
}

export function useKeySequence(
  target: string,
  onMatch: () => void,
  options?: { enabled?: boolean },
): void {
  const matchRef = useRef(onMatch)
  matchRef.current = onMatch
  const bufferRef = useRef('')
  const enabled = options?.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    const goal = normalize(target)
    if (!goal) return
    const onKeyDown = (e: KeyboardEvent) => {
      // Ne pas capter une frappe destinée à un champ de saisie.
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (el?.isContentEditable) return

      if (e.key.length !== 1) return // ignore Shift, Entrée, flèches, etc.
      const typed = normalize(e.key)
      if (!typed) return // touche non-lettre : n'altère pas le buffer
      const next = (bufferRef.current + typed).slice(-goal.length)
      bufferRef.current = next
      if (next === goal) {
        bufferRef.current = ''
        matchRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [target, enabled])
}
