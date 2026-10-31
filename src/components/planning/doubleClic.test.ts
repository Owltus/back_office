import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DELAI_DOUBLE_CLIC,
  clicOuDoubleClic,
} from '#/components/planning/doubleClic.ts'

describe('clicOuDoubleClic', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('un clic seul ouvre, après le délai du double-clic', () => {
    const simple = vi.fn()
    const double = vi.fn()
    clicOuDoubleClic({ detail: 1 }, simple, double)
    expect(simple).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DELAI_DOUBLE_CLIC)
    expect(simple).toHaveBeenCalledOnce()
    expect(double).not.toHaveBeenCalled()
  })

  it('un double-clic bascule, sans ouvrir', () => {
    const simple = vi.fn()
    const double = vi.fn()
    clicOuDoubleClic({ detail: 1 }, simple, double)
    clicOuDoubleClic({ detail: 2 }, simple, double)
    vi.advanceTimersByTime(DELAI_DOUBLE_CLIC * 2)
    expect(double).toHaveBeenCalledOnce()
    expect(simple).not.toHaveBeenCalled()
  })

  it('un triple-clic ne bascule pas deux fois', () => {
    const simple = vi.fn()
    const double = vi.fn()
    for (const detail of [1, 2, 3]) clicOuDoubleClic({ detail }, simple, double)
    vi.advanceTimersByTime(DELAI_DOUBLE_CLIC * 2)
    expect(double).toHaveBeenCalledOnce()
    expect(simple).not.toHaveBeenCalled()
  })

  it('sans double-clic possible, ou au clavier : ouvre tout de suite', () => {
    const simple = vi.fn()
    clicOuDoubleClic({ detail: 1 }, simple, null)
    clicOuDoubleClic({ detail: 0 }, simple, vi.fn())
    expect(simple).toHaveBeenCalledTimes(2)
  })
})
