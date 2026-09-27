import { describe, expect, it } from 'vitest'

import { mentionVersion } from '#/lib/classeur/print/mentionVersion.ts'

describe('mentionVersion — la date seule, jj/mm/aaaa', () => {
  it('ni texte ni heure, au fuseau de l’hôtel quel que soit le poste', () => {
    expect(mentionVersion('2026-09-27T07:35:19.817052+00:00')).toBe(
      '27/09/2026',
    )
    // 23 h 30 UTC le 15 = 00 h 30 le 16 à Paris.
    expect(mentionVersion('2026-01-15T23:30:00Z')).toBe('16/01/2026')
    expect(mentionVersion('2026-01-15T23:30:00Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4}$/,
    )
  })
  it('date illisible : pas de mention', () => {
    expect(mentionVersion('pas une date')).toBeUndefined()
  })
})
