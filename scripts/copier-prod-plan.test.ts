import { describe, expect, it } from 'vitest'
import { fc, test } from '@fast-check/vitest'

import {
  EXCLUES,
  SCHEMAS,
  argumentsDump,
  arretAvantCopie,
  derniereMigration,
  migrationsNonLivrees,
} from './copier-prod-plan.mjs'

// Oracle : le plan (étape 14, D21-D23) — sessions et jetons jamais copiés,
// comptes copiés, prod seulement LUE, rien ne commence sans base locale,
// sans Mailpit ni sur un arbre sale.

describe('ce qui est copié', () => {
  it('sessions et jetons exclus, comptes gardés', () => {
    for (const t of [
      'auth.sessions',
      'auth.refresh_tokens',
      'auth.one_time_tokens',
      'auth.flow_state',
      'auth.mfa_factors',
    ])
      expect(EXCLUES).toContain(t)
    expect(EXCLUES).not.toContain('auth.users')
    expect(EXCLUES).not.toContain('auth.identities')
    expect(SCHEMAS).toEqual(['public', 'private', 'auth', 'storage'])
  })

  it('la commande ne fait que LIRE : dump de données, chaque exclusion passée', () => {
    const a = argumentsDump('f.sql')
    expect(a.slice(0, 5)).toEqual([
      'supabase',
      'db',
      'dump',
      '--linked',
      '--data-only',
    ])
    expect(a.join(' ')).not.toMatch(/push|repair|reset|deploy|secrets/)
    for (const t of EXCLUES) expect(a.join(' ')).toContain(`-x ${t}`)
    expect(a.slice(-2)).toEqual(['-f', 'f.sql'])
  })
})

describe('arretAvantCopie', () => {
  const sain = {
    baseLocaleJoignable: true,
    mailpitBranche: true,
    arbrePropre: true,
  }
  it('sain : on peut copier', () => expect(arretAvantCopie(sain)).toBeNull())
  it.each([
    [{ baseLocaleJoignable: false }, 'db:start'],
    [{ mailpitBranche: false }, 'Mailpit'],
    [{ arbrePropre: false }, 'commitez'],
  ])('%o → arrêt', (m, mot) =>
    expect(arretAvantCopie({ ...sain, ...m })).toContain(mot),
  )

  test.prop([fc.boolean(), fc.boolean(), fc.boolean()])(
    'copie permise SEULEMENT si tout est vrai',
    (a, b, c) => {
      expect(
        arretAvantCopie({
          baseLocaleJoignable: a,
          mailpitBranche: b,
          arbrePropre: c,
        }) === null,
      ).toBe(a && b && c)
    },
  )
})

describe('versions', () => {
  it('dernière migration de la prod', () => {
    expect(
      derniereMigration(['20261013000001', '20261013000000', 'pasuneversion']),
    ).toBe('20261013000001')
    expect(derniereMigration([])).toBeNull()
  })

  it('migrations non livrées = plus récentes que la prod, triées', () => {
    const f = [
      '20261101000000_b.sql',
      '20261013000000_baseline.sql',
      '20261013000001_hors_public.sql',
      'README.md',
      '20261020000000_a.sql',
    ]
    expect(migrationsNonLivrees(f, '20261013000001')).toEqual([
      '20261020000000_a.sql',
      '20261101000000_b.sql',
    ])
    expect(migrationsNonLivrees(f, '20261101000000')).toEqual([])
  })
})
