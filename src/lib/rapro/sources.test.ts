import { describe, expect, it } from 'vitest'

import { missingSources } from '#/lib/rapro/sources.ts'

const base = { date: '2026-07-09', previousDate: '2026-07-08' }

describe('missingSources', () => {
  it('ne signale rien quand les deux exports sont là', () => {
    expect(
      missingSources({ ...base, hasOccupancy: true, hasOfficialOcc: true }),
    ).toEqual([])
  })

  it("nomme In-House Guests, l'onglet PDJ et le jour affiché", () => {
    const [m] = missingSources({
      ...base,
      hasOccupancy: false,
      hasOfficialOcc: true,
    })
    expect(m.file).toBe('In-House Guests')
    expect(m.tab).toBe('PDJ')
    expect(m.date).toBe('2026-07-09')
    expect(m.required).toBe(true)
  })

  it('date le Comparison à la VEILLE, jamais au jour affiché', () => {
    const [m] = missingSources({
      ...base,
      hasOccupancy: true,
      hasOfficialOcc: false,
    })
    expect(m.file).toBe('Comparison By Date')
    expect(m.tab).toBe('RepJour')
    expect(m.date).toBe('2026-07-08')
    expect(m.required).toBe(false)
  })

  it('remonte le bloquant en premier quand tout manque', () => {
    const missing = missingSources({
      ...base,
      hasOccupancy: false,
      hasOfficialOcc: false,
    })
    expect(missing).toHaveLength(2)
    expect(missing[0].required).toBe(true)
    expect(missing[1].required).toBe(false)
  })

  it('ne réclame jamais le Forecast, que le rapprochement ne lit pas', () => {
    const missing = missingSources({
      ...base,
      hasOccupancy: false,
      hasOfficialOcc: false,
    })
    expect(missing.map((m) => m.file)).not.toContain('Forecast By Date Range')
  })
})
