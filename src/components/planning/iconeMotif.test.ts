import {
  CalendarOff,
  Flower2,
  GraduationCap,
  Moon,
  PartyPopper,
  Presentation,
  Thermometer,
  TreePalm,
  Wallet,
} from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { iconeMotif } from '#/components/planning/iconeMotif.ts'

describe('icône d’un motif d’absence', () => {
  it.each([
    ['CP', 'Congé payé', TreePalm],
    ['FO', 'Formation', Presentation],
    ['MA', 'Maladie', Thermometer],
    ['EC', 'École - CFA', GraduationCap],
    ['JF', 'Jour férié', PartyPopper],
    ['SS', 'Sans solde', Wallet],
    ['CDDG', "Congé décès d'un grand-parent", Flower2],
    ['RP', 'Repos exceptionnel', Moon],
    ['ZZ', 'Autre chose', CalendarOff],
  ])('%s %s', (code, nom, attendue) => {
    expect(iconeMotif({ code, nom })).toBe(attendue)
  })
})
