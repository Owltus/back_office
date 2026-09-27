import { describe, expect, it } from 'vitest'

import { mentionVersion } from '#/lib/classeur/print/mentionVersion.ts'

describe('mentionVersion', () => {
  it('date et heure de l’hôtel (Paris), quel que soit le fuseau du poste', () => {
    expect(mentionVersion('2026-09-27T07:35:19.817052+00:00')).toBe(
      'Version du 27/09/2026 à 09:35',
    )
    expect(mentionVersion('2026-01-15T23:30:00Z')).toBe(
      'Version du 16/01/2026 à 00:30',
    )
  })
  it('date illisible : pas de mention', () => {
    expect(mentionVersion('pas une date')).toBeUndefined()
  })
})
