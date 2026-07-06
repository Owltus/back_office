import { describe, expect, it } from 'vitest'

import { currentSlot, stepSlot } from '#/lib/caisse/shift.ts'

/*
 * Sélection auto du shift selon l'heure et navigation dans la timeline.
 * Les dates sans suffixe de fuseau sont interprétées en heure LOCALE (comme
 * getHours()), donc le test est déterministe quel que soit le fuseau.
 */

const at = (iso: string) => currentSlot(new Date(iso))

describe('currentSlot', () => {
  it('matin entre 08h et 15h', () => {
    expect(at('2026-07-06T09:30:00')).toEqual({ date: '2026-07-06', shift: 'matin' })
  })
  it('soir entre 15h et 23h', () => {
    expect(at('2026-07-06T18:00:00')).toEqual({ date: '2026-07-06', shift: 'soir' })
  })
  it('nuit après 23h, rattachée au jour courant', () => {
    expect(at('2026-07-06T23:30:00')).toEqual({ date: '2026-07-06', shift: 'nuit' })
  })
  it('nuit avant 08h, rattachée à la veille', () => {
    expect(at('2026-07-06T02:00:00')).toEqual({ date: '2026-07-05', shift: 'nuit' })
  })
  it('creux 07h–08h : encore la nuit de la veille', () => {
    expect(at('2026-07-06T07:30:00')).toEqual({ date: '2026-07-05', shift: 'nuit' })
  })
})

describe('stepSlot', () => {
  it('avance dans le cycle (matin → soir)', () => {
    expect(stepSlot('2026-07-06', 'matin', 1)).toEqual({ date: '2026-07-06', shift: 'soir' })
  })
  it('nuit → matin du lendemain', () => {
    expect(stepSlot('2026-07-06', 'nuit', 1)).toEqual({ date: '2026-07-07', shift: 'matin' })
  })
  it('matin → nuit de la veille (recul)', () => {
    expect(stepSlot('2026-07-06', 'matin', -1)).toEqual({ date: '2026-07-05', shift: 'nuit' })
  })
  it('boucle complète = jour suivant, même shift', () => {
    expect(stepSlot('2026-07-06', 'soir', 3)).toEqual({ date: '2026-07-07', shift: 'soir' })
  })
})
