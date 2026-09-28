// @vitest-environment jsdom
import { MouseSensor, PointerSensor, TouchSensor } from '@dnd-kit/core'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  CLASSES_CARTE_GLISSABLE,
  useCapteursClasseur,
} from '#/components/classeur/dnd/useCapteursClasseur.ts'

/*
 * Garde-fou de l'audit tactile du 2026-09-28 : au doigt, faire défiler un
 * chapitre attrapait un document. Le retour d'un `PointerSensor` (qui capte
 * aussi le doigt) ou d'un `touch-none` sur les cartes ferait échouer ce test.
 */
describe('useCapteursClasseur', () => {
  it('souris 5 px, doigt appui long 250 ms, jamais de PointerSensor', () => {
    const { result } = renderHook(() => useCapteursClasseur())
    const capteurs = result.current
    expect(capteurs.some((c) => c.sensor === PointerSensor)).toBe(false)
    const souris = capteurs.find((c) => c.sensor === MouseSensor)
    const doigt = capteurs.find((c) => c.sensor === TouchSensor)
    expect(souris?.options).toMatchObject({
      activationConstraint: { distance: 5 },
    })
    expect(doigt?.options).toMatchObject({
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  })
  it('les cartes laissent défiler au doigt (pas de touch-action: none)', () => {
    expect(CLASSES_CARTE_GLISSABLE).toContain('touch-manipulation')
    expect(CLASSES_CARTE_GLISSABLE).not.toContain('touch-none')
  })
})
