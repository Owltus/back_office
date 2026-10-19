import { describe, expect, it } from 'vitest'

import { formatDateCourte } from '#/lib/classeur/naming.ts'

describe('formatDateCourte', () => {
  it('écrit jj/mm/aa', () => {
    expect(formatDateCourte('2026-10-02T10:00:00Z')).toBe('02/10/26')
  })

  it("compte au fuseau de l'hôtel, pas à celui du poste", () => {
    // 23 h 30 UTC le 1er = 1 h 30 à Paris le 2.
    expect(formatDateCourte('2026-10-01T23:30:00Z')).toBe('02/10/26')
  })

  it('rend un tiret pour une date illisible', () => {
    expect(formatDateCourte('pas une date')).toBe('—')
  })
})
