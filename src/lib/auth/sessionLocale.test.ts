import { describe, expect, it } from 'vitest'

import { effacerSessionLocale } from '#/lib/auth/sessionLocale.ts'

function stockage(cles: string[]) {
  const map = new Map(cles.map((c) => [c, 'x']))
  return {
    map,
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (c: string) => {
      map.delete(c)
    },
  }
}

describe('effacerSessionLocale', () => {
  it('retire la session et le vérificateur, rien d’autre', () => {
    const s = stockage([
      'sb-abc-auth-token',
      'sb-abc-auth-token-code-verifier',
      'bo.query.cache.v2',
      'bo.auth.lastActive.v1',
      'sb-abc-autre',
    ])
    expect(effacerSessionLocale(s)).toBe(2)
    expect([...s.map.keys()]).toEqual([
      'bo.query.cache.v2',
      'bo.auth.lastActive.v1',
      'sb-abc-autre',
    ])
  })

  it('sans session : ne fait rien', () => {
    expect(effacerSessionLocale(stockage(['bo.x']))).toBe(0)
  })
})
