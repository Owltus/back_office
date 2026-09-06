import { describe, expect, it } from 'vitest'

import { createPurgeGate } from '#/lib/pdj/purgeGate.ts'

describe('createPurgeGate', () => {
  it('accorde la première demande du jour, refuse les suivantes', () => {
    const gate = createPurgeGate()
    expect(gate.claim('2026-09-05')).toBe(true)
    expect(gate.claim('2026-09-05')).toBe(false)
    expect(gate.claim('2026-09-05')).toBe(false)
  })

  it('accorde de nouveau quand le jour change', () => {
    const gate = createPurgeGate()
    expect(gate.claim('2026-09-05')).toBe(true)
    expect(gate.claim('2026-09-06')).toBe(true)
    expect(gate.claim('2026-09-06')).toBe(false)
  })

  it('release rend la main pour un nouvel essai après échec', () => {
    const gate = createPurgeGate()
    expect(gate.claim('2026-09-05')).toBe(true)
    gate.release('2026-09-05')
    expect(gate.claim('2026-09-05')).toBe(true)
  })

  it('release d un autre jour est sans effet', () => {
    const gate = createPurgeGate()
    expect(gate.claim('2026-09-05')).toBe(true)
    gate.release('2026-09-04')
    expect(gate.claim('2026-09-05')).toBe(false)
  })
})
