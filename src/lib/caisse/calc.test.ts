import { describe, expect, it } from 'vitest'

import { computeEcarts, fundEcart, fundTotal, isBalanced } from '#/lib/caisse/calc.ts'
import { emptyCounts } from '#/lib/caisse/constants.ts'
import type { CaisseSheet } from '#/lib/caisse/types.ts'

/*
 * Calculs de la feuille de caisse : écarts par mode, total du fond (en centiers
 * entiers pour éviter la dérive flottante) et équilibre global.
 */

const base = (): Pick<CaisseSheet, 'snt' | 'ls' | 'caisse' | 'counts' | 'fundOrigin'> => ({
  snt: { cash: 0, cb: 0, cvac: 0, cbweb: 0 },
  ls: { cash: 0, cb: 0, cvac: 0 },
  caisse: { cash: 0, cb: 0, cvac: 0, adyen: 0 },
  counts: emptyCounts(),
  fundOrigin: 150,
})

describe('computeEcarts', () => {
  it('écart = (StayNTouch + Lightspeed) − caisse, par mode', () => {
    const s = base()
    s.snt.cash = 18
    s.ls.cash = 11
    s.caisse.cash = 29
    expect(computeEcarts(s).cash).toBe(0)

    s.caisse.cash = 25
    expect(computeEcarts(s).cash).toBe(4)
  })

  it('web compare CB WEB attendue (SNT) au réel ADYEN, sans Lightspeed', () => {
    const s = base()
    s.snt.cbweb = 132.3
    s.caisse.adyen = 132.3
    expect(computeEcarts(s).web).toBe(0)
  })
})

describe('fundTotal', () => {
  it('somme sans dérive flottante (0,10 + 0,20 = 0,30)', () => {
    const s = base()
    s.counts.cnt_010 = 1
    s.counts.cnt_020 = 1
    expect(fundTotal(s)).toBe(0.3)
  })

  it('reproduit le fond de 150 € de la feuille exemple', () => {
    const s = base()
    // 1×50 + 2×20 + 3×10 + 3×2 + 12×1 + 16×0,50 + 15×0,20 + 4×0,10 + 12×0,05
    Object.assign(s.counts, {
      cnt_50: 1, cnt_20: 2, cnt_10: 3, cnt_2: 3, cnt_1: 12,
      cnt_050: 16, cnt_020: 15, cnt_010: 4, cnt_005: 12,
    })
    expect(fundTotal(s)).toBe(150)
    expect(fundEcart(s)).toBe(0)
  })
})

describe('isBalanced', () => {
  it('vrai quand tous les écarts et le fond sont à zéro', () => {
    const s = base()
    Object.assign(s.counts, {
      cnt_50: 1, cnt_20: 2, cnt_10: 3, cnt_2: 3, cnt_1: 12,
      cnt_050: 16, cnt_020: 15, cnt_010: 4, cnt_005: 12,
    })
    expect(isBalanced(s)).toBe(true)

    s.caisse.cash = 5 // introduit un écart
    expect(isBalanced(s)).toBe(false)
  })
})
