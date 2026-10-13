// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { REF_PROD } from '#/lib/environnement.ts'

/*
 * Étanchéité du navigateur (plan environnement-dev-docker-2026-10-12, étape
 * 7, point 6bis). `localhost:3000` a servi l'app branchée sur la PROD : son
 * `localStorage` contient une session prod et le cache de la prod. Une fois
 * l'app passée sur la base locale, rien de cela ne doit être lu.
 *
 * Les modules lisent l'URL au chargement : chaque test pose l'URL, remet les
 * modules à zéro, puis les importe.
 */

const LOCALE = 'http://127.0.0.1:54321'
const PROD = `https://${REF_PROD}.supabase.co`
const CLE_PROD = `sb-${REF_PROD}-auth-token`
const CLE_LOCALE = 'sb-127-auth-token'
const CLE_CACHE = 'bo.query.cache.v3'
const CLE_PROPRIETAIRE = 'bo.query.cache.proprietaire'

const session = (id: string) =>
  JSON.stringify({
    access_token: 'x',
    refresh_token: 'y',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4_000_000_000,
    user: { id },
  })
const cache = () =>
  JSON.stringify({
    buster: '',
    timestamp: Date.now(),
    clientState: { mutations: [], queries: [] },
  })

async function charger(url: string) {
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'cle-publique-de-test')
  vi.resetModules()
  return import('#/lib/queryPersist.ts')
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.unstubAllEnvs()
  window.localStorage.clear()
})

describe('cache persisté : la base fait partie du propriétaire', () => {
  it('session prod rangée AVANT la session locale : le cache prod n’est pas restauré', async () => {
    // Mutation visée : « lire la première clé sb-* » (ancien comportement).
    // La première est la prod (compte P) ; le cache porte la marque que
    // cette lecture fautive aurait reconnue.
    window.localStorage.setItem(CLE_PROD, session('P'))
    window.localStorage.setItem(CLE_LOCALE, session('L'))
    window.localStorage.setItem(CLE_CACHE, cache())
    window.localStorage.setItem(CLE_PROPRIETAIRE, '127:P')
    const { brancherPersistance } = await charger(LOCALE)
    brancherPersistance(new QueryClient())
    expect(window.localStorage.getItem(CLE_PROPRIETAIRE)).toBeNull()
  })

  it('même identifiant de compte, autre base : pas restauré', async () => {
    window.localStorage.setItem(CLE_LOCALE, session('U'))
    window.localStorage.setItem(CLE_CACHE, cache())
    window.localStorage.setItem(CLE_PROPRIETAIRE, `${REF_PROD}:U`)
    const { brancherPersistance } = await charger(LOCALE)
    brancherPersistance(new QueryClient())
    expect(window.localStorage.getItem(CLE_PROPRIETAIRE)).toBeNull()
  })

  it('ancienne marque (identifiant seul) : traitée comme étrangère', async () => {
    window.localStorage.setItem(CLE_PROD, session('U'))
    window.localStorage.setItem(CLE_CACHE, cache())
    window.localStorage.setItem(CLE_PROPRIETAIRE, 'U')
    const { brancherPersistance } = await charger(PROD)
    brancherPersistance(new QueryClient())
    expect(window.localStorage.getItem(CLE_PROPRIETAIRE)).toBeNull()
  })

  it('même base, même compte : la marque est gardée (prod inchangée)', async () => {
    window.localStorage.setItem(CLE_PROD, session('U'))
    window.localStorage.setItem(CLE_CACHE, cache())
    window.localStorage.setItem(CLE_PROPRIETAIRE, `${REF_PROD}:U`)
    const { brancherPersistance } = await charger(PROD)
    brancherPersistance(new QueryClient())
    expect(window.localStorage.getItem(CLE_PROPRIETAIRE)).toBe(`${REF_PROD}:U`)
  })

  it('changerDeCompte écrit la marque <base>:<compte>', async () => {
    const { changerDeCompte } = await charger(LOCALE)
    changerDeCompte('L')
    expect(window.localStorage.getItem(CLE_PROPRIETAIRE)).toBe('127:L')
    window.localStorage.setItem(CLE_CACHE, cache())
    changerDeCompte('L')
    expect(window.localStorage.getItem(CLE_CACHE)).not.toBeNull()
    changerDeCompte('M')
    expect(window.localStorage.getItem(CLE_CACHE)).toBeNull()
    changerDeCompte(null)
    expect(window.localStorage.getItem(CLE_PROPRIETAIRE)).toBeNull()
  })
})

describe('ménage des sessions au chargement du client', () => {
  async function chargerClient(url: string) {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'cle-publique-de-test')
    vi.resetModules()
    return import('#/lib/supabase.ts')
  }

  it('en local : la session prod et son vérificateur disparaissent, le reste demeure', async () => {
    window.localStorage.setItem(CLE_PROD, session('P'))
    window.localStorage.setItem(`${CLE_PROD}-code-verifier`, 'v')
    window.localStorage.setItem(CLE_LOCALE, session('L'))
    window.localStorage.setItem('bo.auth.lastActive.v1', '1')
    await chargerClient(LOCALE)
    expect(window.localStorage.getItem(CLE_PROD)).toBeNull()
    expect(window.localStorage.getItem(`${CLE_PROD}-code-verifier`)).toBeNull()
    expect(window.localStorage.getItem(CLE_LOCALE)).toBe(session('L'))
    expect(window.localStorage.getItem('bo.auth.lastActive.v1')).toBe('1')
  })

  it('en prod : la session prod est intacte', async () => {
    window.localStorage.setItem(CLE_PROD, session('P'))
    await chargerClient(PROD)
    expect(window.localStorage.getItem(CLE_PROD)).toBe(session('P'))
  })
})

describe('garde de démarrage sous vite dev', () => {
  it('une URL prod arrête le chargement du client', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_SUPABASE_URL', PROD)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'cle-publique-de-test')
    vi.resetModules()
    await expect(import('#/lib/supabase.ts')).rejects.toThrow(
      'pnpm dev vise la base LOCALE',
    )
  })

  it('une URL locale passe', async () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_SUPABASE_URL', LOCALE)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'cle-publique-de-test')
    vi.resetModules()
    const m = await import('#/lib/supabase.ts')
    expect(m.CIBLE).toBe('locale')
  })
})
