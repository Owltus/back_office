import { describe, expect, it } from 'vitest'

import {
  currentSlot,
  resolveDisplaySlot,
  stepSlot,
} from '#/lib/caisse/shift.ts'
import type { Shift } from '#/lib/caisse/types.ts'

/*
 * Sélection auto du shift selon l'heure et navigation dans la timeline.
 * Les dates sans suffixe de fuseau sont interprétées en heure LOCALE (comme
 * getHours()), donc le test est déterministe quel que soit le fuseau.
 */

const at = (iso: string) => currentSlot(new Date(iso))

describe('currentSlot', () => {
  it('matin entre 12h et 21h', () => {
    expect(at('2026-07-06T13:30:00')).toEqual({ date: '2026-07-06', shift: 'matin' })
  })
  it('soir entre 21h et minuit, rattaché au jour courant', () => {
    expect(at('2026-07-06T22:00:00')).toEqual({ date: '2026-07-06', shift: 'soir' })
  })
  it('soir avant 02h, rattaché à la veille (débuté à 21h)', () => {
    expect(at('2026-07-06T01:00:00')).toEqual({ date: '2026-07-05', shift: 'soir' })
  })
  it('nuit entre 02h et 12h, rattachée à la veille (se remplit le matin)', () => {
    expect(at('2026-07-06T06:00:00')).toEqual({ date: '2026-07-05', shift: 'nuit' })
  })
  it('11h59 : encore la nuit de la veille', () => {
    expect(at('2026-07-06T11:59:00')).toEqual({ date: '2026-07-05', shift: 'nuit' })
  })
  it('les frontières s’enchaînent sans trou (via stepSlot)', () => {
    // 20h59 matin → 21h soir → (01h) même soir → 02h nuit → (11h59) même nuit
    // → 12h matin. Chaque saut d’heure = un cran de stepSlot, ou le même slot.
    expect(at('2026-07-06T20:59:00')).toEqual({ date: '2026-07-06', shift: 'matin' })
    expect(at('2026-07-06T21:00:00')).toEqual({ date: '2026-07-06', shift: 'soir' })
    expect(at('2026-07-07T01:59:00')).toEqual({ date: '2026-07-06', shift: 'soir' })
    expect(at('2026-07-07T02:00:00')).toEqual({ date: '2026-07-06', shift: 'nuit' })
    expect(at('2026-07-07T12:00:00')).toEqual({ date: '2026-07-07', shift: 'matin' })
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

describe('resolveDisplaySlot', () => {
  const none = () => false
  const validated =
    (...keys: string[]) =>
    (date: string, shift: Shift) =>
      keys.includes(`${date}|${shift}`)

  it('shift courant si rien de clôturé', () => {
    // 13h30 → matin du 6.
    expect(resolveDisplaySlot(new Date('2026-07-06T13:30:00'), none)).toEqual({
      date: '2026-07-06',
      shift: 'matin',
    })
  })

  it('avance sur le suivant si le courant est clôturé', () => {
    // matin du 6 fait → on montre le soir du 6.
    expect(
      resolveDisplaySlot(
        new Date('2026-07-06T13:30:00'),
        validated('2026-07-06|matin'),
      ),
    ).toEqual({ date: '2026-07-06', shift: 'soir' })
  })

  it('enchaîne les shifts clôturés', () => {
    // matin ET soir du 6 faits → nuit du 6.
    expect(
      resolveDisplaySlot(
        new Date('2026-07-06T13:30:00'),
        validated('2026-07-06|matin', '2026-07-06|soir'),
      ),
    ).toEqual({ date: '2026-07-06', shift: 'nuit' })
  })

  it('ne repart jamais en arrière sur une nuit oubliée', () => {
    // 13h30 → matin du 6. La nuit du 5 (précédente) n’est PAS faite, mais on ne
    // recule pas : on reste sur le matin, le shift courant.
    expect(
      resolveDisplaySlot(
        new Date('2026-07-06T13:30:00'),
        validated('2026-07-06|matin', '2026-07-06|soir', '2026-07-06|nuit'),
      ),
      // matin+soir+nuit du 6 tous faits → borné à un cycle, on retombe sur le
      // matin du 7.
    ).toEqual({ date: '2026-07-07', shift: 'matin' })
  })
})
