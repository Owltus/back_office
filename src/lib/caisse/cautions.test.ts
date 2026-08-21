import { describe, expect, it } from 'vitest'

import {
  activeCautionsTotal,
  effectiveFundTarget,
  isCautionActiveOn,
} from '#/lib/caisse/cautions.ts'
import type { Caution } from '#/lib/caisse/types.ts'

function caution(partial: Partial<Caution> & { takenDate: string }): Caution {
  return {
    id: 'x',
    room: 12,
    amount: 300,
    comment: '',
    status: 'active',
    refundedDate: null,
    createdBy: 'u',
    createdAt: '',
    ...partial,
  }
}

describe('isCautionActiveOn', () => {
  it('pas encore prise à cette date : inactive', () => {
    const c = caution({ takenDate: '2026-08-20' })
    expect(isCautionActiveOn(c, '2026-08-19')).toBe(false)
  })

  it('prise et jamais remboursée : active indéfiniment', () => {
    const c = caution({ takenDate: '2026-08-10' })
    expect(isCautionActiveOn(c, '2026-08-10')).toBe(true)
    expect(isCautionActiveOn(c, '2026-12-31')).toBe(true)
  })

  it('remboursée : ne compte PLUS le jour même du remboursement (borne exclusive, D3)', () => {
    const c = caution({
      takenDate: '2026-08-10',
      status: 'refunded',
      refundedDate: '2026-08-15',
    })
    expect(isCautionActiveOn(c, '2026-08-14')).toBe(true)
    expect(isCautionActiveOn(c, '2026-08-15')).toBe(false)
    expect(isCautionActiveOn(c, '2026-08-16')).toBe(false)
  })

  it('remboursée : compte encore pour une date PASSÉE antérieure au remboursement (D4)', () => {
    const c = caution({
      takenDate: '2026-01-01',
      status: 'refunded',
      refundedDate: '2026-08-15',
    })
    expect(isCautionActiveOn(c, '2026-03-01')).toBe(true)
  })
})

describe('activeCautionsTotal', () => {
  it('somme uniquement les cautions actives à la date donnée', () => {
    const cautions = [
      caution({ takenDate: '2026-08-01', amount: 300 }),
      caution({
        takenDate: '2026-08-05',
        amount: 100,
        status: 'refunded',
        refundedDate: '2026-08-10',
      }),
      caution({ takenDate: '2026-08-20', amount: 50 }), // pas encore prise
    ]
    expect(activeCautionsTotal(cautions, '2026-08-07')).toBe(400)
    expect(activeCautionsTotal(cautions, '2026-08-10')).toBe(300)
  })

  it('liste vide : 0', () => {
    expect(activeCautionsTotal([], '2026-08-07')).toBe(0)
  })
})

describe('effectiveFundTarget', () => {
  it('plancher seul quand aucune caution active', () => {
    expect(effectiveFundTarget([], '2026-08-07', 150)).toBe(150)
  })

  it('plancher + cautions actives (exemple de la demande : 150 + 300 = 450)', () => {
    const cautions = [caution({ takenDate: '2026-08-01', amount: 300 })]
    expect(effectiveFundTarget(cautions, '2026-08-07', 150)).toBe(450)
  })

  it('plusieurs cautions actives simultanément', () => {
    const cautions = [
      caution({ takenDate: '2026-08-01', amount: 300, room: 12 }),
      caution({ takenDate: '2026-08-02', amount: 200, room: 5 }),
    ]
    expect(effectiveFundTarget(cautions, '2026-08-07', 150)).toBe(650)
  })
})
