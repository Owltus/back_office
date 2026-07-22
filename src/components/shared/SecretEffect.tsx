import { useEffect, useRef } from 'react'

import { useEffectTrigger } from './EffectOverlay.tsx'

import type { EffectDefinition } from '#/lib/artefact/effects/index.ts'

/*
 * Easter egg clavier générique — taper un MOT-CLÉ (n'importe où, à la Konami)
 * déclenche un effet visuel plein écran. Généralise l'ancien `SecretFireworks` :
 * le mot ET l'effet arrivent en props, l'animation étant un `EffectDefinition`
 * joué par le moteur commun `EffectOverlay` (le même que la page Artefact).
 *
 * - Détecteur de séquence : buffer glissant des dernières frappes, insensible à
 *   la casse ET aux accents (« chloé » comme « chloe » marchent).
 * - L'overlay est en `pointer-events: none` : il n'intercepte JAMAIS clics ni
 *   saisie — d'où le « n'importe où » sans rien casser.
 * - SSR-safe : l'écouteur clavier est posé côté client dans un effet ; rien n'est
 *   rendu tant qu'aucun effet n'est armé.
 */

interface SecretEffectProps {
  /** Mot déclencheur, tel qu'on le tape (casse et accents ignorés). */
  keyword: string
  effect: EffectDefinition
}

// Une frappe → minuscule sans accent : NFD décompose « é » en « e » + accent
// combinant, et on ne garde que les lettres a–z (accents et autres touches
// ignorés). « chloé » comme « chloe » produisent donc « chloe ».
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '')
}

export function SecretEffect({ keyword, effect }: SecretEffectProps) {
  const { trigger, overlay } = useEffectTrigger()
  // `trigger` n'est pas mémoïsé (nouvelle fonction à chaque rendu) : on le lit
  // par une ref pour n'attacher l'écouteur clavier qu'UNE seule fois.
  const triggerRef = useRef(trigger)
  triggerRef.current = trigger
  const bufferRef = useRef('')

  useEffect(() => {
    const target = normalize(keyword)
    if (!target) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.length !== 1) return // ignore Shift, Entrée, flèches, etc.
      const typed = normalize(e.key)
      if (!typed) return // touche non-lettre : n'altère pas le buffer
      const next = (bufferRef.current + typed).slice(-target.length)
      bufferRef.current = next
      if (next === target) {
        bufferRef.current = ''
        triggerRef.current(effect)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyword, effect])

  return overlay
}
