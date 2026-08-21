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
    expect(fundEcart(fundTotal(s), 150)).toBe(0)
  })
})

describe('isBalanced', () => {
  it('vrai quand tous les écarts et le fond sont à zéro', () => {
    const s = base()
    Object.assign(s.counts, {
      cnt_50: 1, cnt_20: 2, cnt_10: 3, cnt_2: 3, cnt_1: 12,
      cnt_050: 16, cnt_020: 15, cnt_010: 4, cnt_005: 12,
    })
    expect(isBalanced(s, fundTotal(s), 150)).toBe(true)

    s.caisse.cash = 5 // introduit un écart
    expect(isBalanced(s, fundTotal(s), 150)).toBe(false)
  })

  it('un fond effectif majoré (caution active) exige d’ajouter son montant au COMPTÉ, pas juste au ciblé', () => {
    const s = base()
    // Même comptage que ci-dessus (150 € de coupures) — la caution (300 €) est
    // une enveloppe scellée, jamais recomptée dans la grille.
    Object.assign(s.counts, {
      cnt_50: 1, cnt_20: 2, cnt_10: 3, cnt_2: 3, cnt_1: 12,
      cnt_050: 16, cnt_020: 15, cnt_010: 4, cnt_005: 12,
    })
    const counted = fundTotal(s)
    // Cible à 150 (aucune caution) : équilibré.
    expect(isBalanced(s, counted, 150)).toBe(true)
    // Cible à 450 (caution active) SANS ajouter son montant au compté : c'est
    // le bug corrigé — un écart apparaîtrait alors qu'il n'y a rien d'anormal.
    expect(isBalanced(s, counted, 450)).toBe(false)
    expect(fundEcart(counted, 450)).toBe(-300)
    // Cible à 450 EN ajoutant la caution au compté (counted + 300) : de
    // nouveau équilibré — c'est le comportement correct.
    expect(isBalanced(s, counted + 300, 450)).toBe(true)
    expect(fundEcart(counted + 300, 450)).toBe(0)
  })
})
