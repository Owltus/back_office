import { describe, expect, it } from 'vitest'

import {
  autoModeTargets,
  isPdjDayBlank,
  type AutoModeRow,
} from '#/lib/pdj/automode.ts'

/*
 * automode : cocher le dû facturé (breakfasts_included) sur les chambres
 * facturées PAS encore saisies. Jamais d'extra, jamais d'écrasement.
 */

const row = (r: Partial<AutoModeRow>): AutoModeRow => ({
  room: 100,
  addons: null,
  manual_kind: null,
  breakfasts_included: 0,
  breakfasts_served: 0,
  ...r,
})

describe('autoModeTargets', () => {
  it('cible une chambre facturée non saisie au dû (= included)', () => {
    const t = autoModeTargets([
      row({ room: 101, addons: 'PDJ INCL', breakfasts_included: 2 }),
    ])
    expect(t).toEqual([{ room: 101, served: 2 }])
  })

  it('exclut une chambre facturée DÉJÀ saisie (anti-écrasement)', () => {
    const t = autoModeTargets([
      row({ room: 102, addons: 'PDJ INCL', breakfasts_included: 2, breakfasts_served: 1 }),
    ])
    expect(t).toEqual([])
  })

  it('exclut une chambre sans PDJ (TAXE, addons null)', () => {
    const t = autoModeTargets([
      row({ room: 103, addons: 'TAXE DE SEJOUR', breakfasts_included: 0 }),
      row({ room: 104, addons: null, breakfasts_included: 0 }),
    ])
    expect(t).toEqual([])
  })

  it('inclut une ligne manuelle « inclus » avec included > 0', () => {
    const t = autoModeTargets([
      row({ room: 105, addons: null, manual_kind: 'inclus', breakfasts_included: 1 }),
    ])
    expect(t).toEqual([{ room: 105, served: 1 }])
  })

  it('exclut une ligne manuelle « extra » (included = 0)', () => {
    const t = autoModeTargets([
      row({ room: 106, addons: null, manual_kind: 'extra', breakfasts_included: 0 }),
    ])
    expect(t).toEqual([])
  })

  it('couvre le no-show facturé (inclus > 0, servi 0) — cochage voulu', () => {
    // Client pas venu mais PDJ facturé : reste dû → coché à son inclus.
    const t = autoModeTargets([
      row({ room: 107, addons: 'PDJBB INCL', breakfasts_included: 1, breakfasts_served: 0 }),
    ])
    expect(t).toEqual([{ room: 107, served: 1 }])
  })

  it('mélange : ne retient que les facturées non saisies', () => {
    const t = autoModeTargets([
      row({ room: 201, addons: 'PDJ INCL', breakfasts_included: 2 }), // ok
      row({ room: 202, addons: 'PDJ INCL', breakfasts_included: 1, breakfasts_served: 1 }), // déjà saisi
      row({ room: 203, addons: 'TAXE', breakfasts_included: 0 }), // pas de PDJ
      row({ room: 204, manual_kind: 'inclus', breakfasts_included: 1 }), // manuel inclus ok
    ])
    expect(t).toEqual([
      { room: 201, served: 2 },
      { room: 204, served: 1 },
    ])
  })
})

describe('isPdjDayBlank', () => {
  it('vrai quand toutes les lignes sont à served 0', () => {
    expect(
      isPdjDayBlank([
        row({ room: 1, addons: 'PDJ INCL', breakfasts_included: 2 }),
        row({ room: 2, breakfasts_included: 0 }),
      ]),
    ).toBe(true)
  })

  it('faux dès qu’une ligne est saisie', () => {
    expect(
      isPdjDayBlank([
        row({ room: 1, addons: 'PDJ INCL', breakfasts_included: 2, breakfasts_served: 2 }),
      ]),
    ).toBe(false)
  })
})
