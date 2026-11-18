// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useCopieCtrl } from '#/components/planning/hooks/useCopieCtrl.ts'

/*
 * Mode copie au Ctrl (2026-11-18). Oracle : la demande. La mémoire se vide
 * quand la touche est relâchée et quand la fenêtre perd le focus, pour que le
 * mode ne reste jamais bloqué ; les collages s'écrivent dans l'ordre.
 */

const COPIE = {
  poste_id: 1,
  horaire_id: 2,
  debut: '07:00',
  fin: '15:00',
  pause: 0,
}
const touche = (type: 'keydown' | 'keyup', key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key }))
  })

describe('useCopieCtrl', () => {
  it('Ctrl enfoncé : mode actif ; relâché : mémoire vidée', () => {
    const { result } = renderHook(() => useCopieCtrl(true))
    // jsdom n'est pas un Mac.
    expect(result.current.touche).toBe('Control')
    touche('keydown', 'Control')
    expect(result.current.enfonce).toBe(true)
    act(() => result.current.copier({ copie: COPIE, source: '1:2' }))
    expect(result.current.memoire?.source).toBe('1:2')
    touche('keyup', 'Control')
    expect(result.current.enfonce).toBe(false)
    expect(result.current.memoire).toBeNull()
  })

  it('la fenêtre perd le focus : la mémoire est vidée', () => {
    const { result } = renderHook(() => useCopieCtrl(true))
    touche('keydown', 'Control')
    act(() => result.current.copier({ copie: COPIE, source: '1:2' }))
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(result.current.enfonce).toBe(false)
    expect(result.current.memoire).toBeNull()
  })

  it('une autre touche ne change rien ; hors gestes, rien n’est actif', () => {
    const { result, rerender } = renderHook(({ a }) => useCopieCtrl(a), {
      initialProps: { a: true },
    })
    touche('keydown', 'Shift')
    expect(result.current.enfonce).toBe(false)
    touche('keydown', 'Control')
    act(() => result.current.copier({ copie: COPIE, source: '1:2' }))
    rerender({ a: false })
    expect(result.current.enfonce).toBe(false)
    expect(result.current.memoire).toBeNull()
  })

  it('les collages s’écrivent l’un après l’autre, dans l’ordre, même après un échec', async () => {
    const { result } = renderHook(() => useCopieCtrl(true))
    const ordre: string[] = []
    let finir: () => void = () => {}
    const premier = result.current.enFile(
      () =>
        new Promise<void>((r) => {
          finir = () => {
            ordre.push('a')
            r()
          }
        }),
    )
    const deuxieme = result.current
      .enFile(async () => {
        ordre.push('b')
        throw new Error('refusé')
      })
      .catch(() => undefined)
    const troisieme = result.current.enFile(async () => {
      ordre.push('c')
    })
    expect(ordre).toEqual([])
    // Le premier collage démarre au tour suivant : on attend qu'il tourne.
    let lance = false
    const avant = finir
    await vi.waitFor(() => {
      lance = finir !== avant
      expect(lance).toBe(true)
    })
    finir()
    await Promise.all([premier, deuxieme, troisieme])
    expect(ordre).toEqual(['a', 'b', 'c'])
  })
})
