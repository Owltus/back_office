import { describe, expect, it } from 'vitest'

import { parseMyAccess, toPagePermissions } from '#/lib/auth/access.ts'

const profile = {
  id: 'u1',
  email: 'u1@example.test',
  display_name: 'U1',
  first_name: 'U',
  last_name: '1',
  role: 'utilisateur' as const,
  created_at: '2026-01-01T00:00:00Z',
}

describe('toPagePermissions', () => {
  it('réduit les lignes en carte page → niveau', () => {
    expect(
      toPagePermissions([
        { page: 'pdj', level: 'ecriture' },
        { page: 'parking', level: 'lecture' },
      ]),
    ).toEqual({ pdj: 'ecriture', parking: 'lecture' })
  })

  it('tolère null / undefined / lignes malformées', () => {
    expect(toPagePermissions(null)).toEqual({})
    expect(toPagePermissions(undefined)).toEqual({})
    expect(
      toPagePermissions([
        { page: 'pdj', level: 'lecture' },
        { page: 42, level: 'lecture' },
        null,
        'x',
      ]),
    ).toEqual({ pdj: 'lecture' })
  })
})

describe('parseMyAccess', () => {
  it('renvoie profil + droits', () => {
    expect(
      parseMyAccess({
        profile,
        permissions: [{ page: 'repjour', level: 'gestion' }],
      }),
    ).toEqual({ profile, permissions: { repjour: 'gestion' } })
  })

  it('profil null = compte supprimé (pas une erreur)', () => {
    expect(parseMyAccess({ profile: null, permissions: [] })).toEqual({
      profile: null,
      permissions: {},
    })
  })

  it('aucune permission = état légitime', () => {
    expect(parseMyAccess({ profile, permissions: null }).permissions).toEqual(
      {},
    )
  })

  it('réponse vide ou invalide = ERREUR, jamais une éjection', () => {
    expect(() => parseMyAccess(null)).toThrow()
    expect(() => parseMyAccess(undefined)).toThrow()
    expect(() => parseMyAccess('x')).toThrow()
    expect(() => parseMyAccess([])).toThrow()
    expect(() => parseMyAccess({})).toThrow()
  })
})
