import { describe, expect, it } from 'vitest'
import { fc, test } from '@fast-check/vitest'

import {
  MESSAGE_DEMARRAGE_REFUSE,
  REF_PROD,
  bandeauDe,
  cibleDe,
  cleSession,
  clesSessionEtrangeres,
  demarrageRefuse,
  estHoteLocal,
  proprietaireCache,
  titreDe,
} from '#/lib/environnement.ts'

// Oracles écrits depuis le plan (étape 7) et le code de supabase-js 2.110
// (`sb-${hostname.split('.')[0]}-auth-token`), jamais depuis la sortie.

const PROD = `https://${REF_PROD}.supabase.co`
const LOCALE = 'http://127.0.0.1:54321'

describe('cibleDe', () => {
  it.each([
    [LOCALE, 'locale'],
    ['http://localhost:54321', 'locale'],
    ['http://[::1]:54321', 'locale'],
    ['http://supabase.localhost', 'locale'],
    ['http://LOCALHOST:54321', 'locale'],
    [PROD, 'prod'],
    [`${PROD}/rest/v1`, 'prod'],
    ['https://autre.supabase.co', 'autre'],
    [`https://${REF_PROD}.supabase.co.exemple.com`, 'autre'],
    ['https://localhost.exemple.com', 'autre'],
    ['http://127.0.0.2:54321', 'autre'],
    ['pas une url', 'autre'],
    ['', 'autre'],
    [undefined, 'autre'],
    [null, 'autre'],
  ])('%s → %s', (url, attendu) => {
    expect(cibleDe(url)).toBe(attendu)
  })

  test.prop([fc.domain()])('un hôte supabase.co n’est jamais local', (d) => {
    expect(cibleDe(`https://${d}.supabase.co`)).not.toBe('locale')
  })

  test.prop([fc.integer({ min: 1, max: 65535 }), fc.webPath()])(
    'une adresse de bouclage n’est jamais la prod',
    (port, chemin) => {
      expect(cibleDe(`http://127.0.0.1:${port}${chemin}`)).toBe('locale')
      expect(cibleDe(`http://localhost:${port}${chemin}`)).toBe('locale')
    },
  )

  test.prop([fc.webUrl()])(
    'la prod n’est reconnue que par son hôte exact',
    (url) => {
      const attendu = new URL(url).hostname === `${REF_PROD}.supabase.co`
      expect(cibleDe(url) === 'prod').toBe(attendu)
    },
  )
})

describe('estHoteLocal', () => {
  it('reconnaît les quatre formes, rien d’autre', () => {
    expect(
      ['localhost', '127.0.0.1', '[::1]', 'a.localhost'].map(estHoteLocal),
    ).toEqual([true, true, true, true])
    expect(
      ['localhostx', 'x.localhostx', '127.0.0.10', '::1', 'localhost.fr'].map(
        estHoteLocal,
      ),
    ).toEqual([false, false, false, false, false])
  })
})

describe('cleSession', () => {
  it('reproduit le nommage de supabase-js', () => {
    expect(cleSession(LOCALE)).toBe('sb-127-auth-token')
    expect(cleSession(PROD)).toBe(`sb-${REF_PROD}-auth-token`)
    expect(cleSession('http://localhost:54321')).toBe('sb-localhost-auth-token')
    expect(cleSession('pas une url')).toBeNull()
    expect(cleSession(undefined)).toBeNull()
  })

  it('locale et prod ont des clés différentes', () => {
    expect(cleSession(LOCALE)).not.toBe(cleSession(PROD))
  })
})

describe('clesSessionEtrangeres', () => {
  const cles = [
    `sb-${REF_PROD}-auth-token`,
    `sb-${REF_PROD}-auth-token-code-verifier`,
    'sb-127-auth-token',
    'sb-127-auth-token-code-verifier',
    'bo.query.cache.v3',
    'bo.auth.lastActive.v1',
    'sb-x-auth-token-autre-chose',
  ]

  it('en local : les clés de la prod partent, la session locale reste', () => {
    expect(clesSessionEtrangeres(cles, LOCALE)).toEqual([
      `sb-${REF_PROD}-auth-token`,
      `sb-${REF_PROD}-auth-token-code-verifier`,
    ])
  })

  it('en prod : seule une session d’une autre base part', () => {
    expect(clesSessionEtrangeres(cles, PROD)).toEqual([
      'sb-127-auth-token',
      'sb-127-auth-token-code-verifier',
    ])
    expect(
      clesSessionEtrangeres(
        [`sb-${REF_PROD}-auth-token`, 'bo.query.cache.v3'],
        PROD,
      ),
    ).toEqual([])
  })

  it('sans URL : toute session est étrangère', () => {
    expect(clesSessionEtrangeres(['sb-127-auth-token'], undefined)).toEqual([
      'sb-127-auth-token',
    ])
  })

  test.prop([fc.array(fc.string())])(
    'ne propose jamais une clé hors session',
    (liste) => {
      for (const c of clesSessionEtrangeres(liste, LOCALE)) {
        expect(c).toMatch(/^sb-.+-auth-token(-code-verifier)?$/)
        expect(c).not.toBe('sb-127-auth-token')
      }
    },
  )
})

describe('proprietaireCache', () => {
  it('marque la base ET le compte', () => {
    expect(proprietaireCache(LOCALE, 'u1')).toBe('127:u1')
    expect(proprietaireCache(PROD, 'u1')).toBe(`${REF_PROD}:u1`)
    expect(proprietaireCache(undefined, 'u1')).toBe('inconnu:u1')
  })

  test.prop([fc.uuid()])(
    'même compte, autre base : marque différente',
    (id) => {
      expect(proprietaireCache(LOCALE, id)).not.toBe(
        proprietaireCache(PROD, id),
      )
    },
  )
})

describe('démarrage, bandeau, titre', () => {
  it('vite dev ne démarre que vers la base locale', () => {
    expect(demarrageRefuse('locale', true)).toBe(false)
    expect(demarrageRefuse('prod', true)).toBe(true)
    expect(demarrageRefuse('autre', true)).toBe(true)
    expect(demarrageRefuse('prod', false)).toBe(false)
    expect(demarrageRefuse('autre', false)).toBe(false)
  })

  it('le message dit quoi faire', () => {
    expect(MESSAGE_DEMARRAGE_REFUSE).toContain('.env.development.local')
    expect(MESSAGE_DEMARRAGE_REFUSE).toContain('pnpm db:start')
  })

  it('bandeau en local sous vite dev seulement', () => {
    expect(bandeauDe('locale', true)).toEqual({ texte: 'DEV · base locale' })
    expect(bandeauDe('locale', false)).toBeNull()
    expect(bandeauDe('prod', true)).toBeNull()
    expect(bandeauDe('prod', false)).toBeNull()
    expect(bandeauDe('autre', true)).toBeNull()
  })

  it('titre préfixé en dev', () => {
    expect(titreDe('Back Office', true)).toBe('[DEV] Back Office')
    expect(titreDe('Back Office', false)).toBe('Back Office')
  })
})
