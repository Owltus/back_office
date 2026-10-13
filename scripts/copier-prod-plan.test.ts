import { describe, expect, it } from 'vitest'
import { fc, test } from '@fast-check/vitest'

import {
  COMPTES,
  EXCLUES,
  SCHEMAS,
  argumentsDump,
  arretAvantCopie,
  derniereMigration,
  insertionComptes,
  lectureComptes,
  migrationsNonLivrees,
} from './copier-prod-plan.mjs'

// Oracle : le plan (étape 14, D21-D23) — sessions et jetons jamais copiés,
// comptes copiés, prod seulement LUE, rien ne commence sans base locale,
// sans Mailpit ni sur un arbre sale.

describe('ce qui est copié', () => {
  it('nos schémas seulement ; de auth, les comptes et rien d’autre', () => {
    expect(SCHEMAS).toEqual(['public', 'private'])
    expect(COMPTES).toEqual(['auth.users', 'auth.identities'])
  })

  it('sessions et jetons ne sont même pas lisibles par le script', () => {
    for (const t of [
      'auth.sessions',
      'auth.refresh_tokens',
      'auth.one_time_tokens',
      'auth.mfa_factors',
    ])
      expect(() => lectureComptes(t)).toThrow('non autorisée')
    expect(lectureComptes('auth.users')).toBe(
      "select coalesce(json_agg(t), '[]'::json) as lignes from auth.users t",
    )
  })

  it('réinsertion : délimiteur absent du JSON, quel qu’il soit', () => {
    const sql0 = insertionComptes('auth.identities', '[]')
    expect(sql0).toContain(
      'json_populate_recordset(null::auth.identities, $c$[]$c$::json);',
    )
    // Colonnes calculées et identités « always » jamais insérées.
    expect(sql0).toContain("is_generated = 'NEVER'")
    expect(sql0).toContain("identity_generation, '') <> 'ALWAYS'")
    expect(sql0).toContain('insert into auth.identities (%s)')
    const piege = '[{"x":"$c$ et $cx$"}]'
    const sql = insertionComptes('auth.users', piege)
    expect(sql).toContain('$cxx$' + piege + '$cxx$')
    expect(() => insertionComptes('auth.sessions', '[]')).toThrow()
  })

  test.prop([fc.string()])(
    'le JSON est toujours repris intact entre ses délimiteurs',
    (json) => {
      const sql = insertionComptes('auth.users', json)
      const m = /\$(c+x*)\$([\s\S]*)\$\1\$::json\);\n/.exec(sql)
      expect(m?.[2]).toBe(json)
      expect(json.includes(`$${m?.[1]}$`)).toBe(false)
    },
  )

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
