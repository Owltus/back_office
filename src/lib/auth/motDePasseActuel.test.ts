import { describe, expect, it, vi } from 'vitest'

import {
  messageMotDePasseActuel,
  verifierMotDePasseActuel,
} from '#/lib/auth/motDePasseActuel.ts'

function client(resultat: unknown, leve = false) {
  return {
    signInWithPassword: vi.fn(() =>
      leve
        ? Promise.reject(resultat)
        : Promise.resolve({ error: resultat as unknown }),
    ),
  }
}

describe('verifierMotDePasseActuel', () => {
  it("bon mot de passe : ok, vérifié avec l'e-mail du compte", async () => {
    const c = client(null)
    await expect(
      verifierMotDePasseActuel(c, 'moi@exemple.test', 'Actuel-2026x'),
    ).resolves.toEqual({ ok: true })
    expect(c.signInWithPassword).toHaveBeenCalledWith({
      email: 'moi@exemple.test',
      password: 'Actuel-2026x',
    })
  })

  it('mauvais mot de passe : refus clair', async () => {
    const r = await verifierMotDePasseActuel(
      client({ status: 400, code: 'invalid_credentials' }),
      'moi@exemple.test',
      'faux',
    )
    expect(r).toEqual({
      ok: false,
      message: 'Mot de passe actuel incorrect : mot de passe non modifié.',
    })
  })

  it('champ vide : refus SANS appel réseau', async () => {
    const c = client(null)
    const r = await verifierMotDePasseActuel(c, 'moi@exemple.test', '')
    expect(r.ok).toBe(false)
    expect(c.signInWithPassword).not.toHaveBeenCalled()
  })

  it('compte sans e-mail : refus SANS appel réseau', async () => {
    const c = client(null)
    const r = await verifierMotDePasseActuel(c, undefined, 'Actuel-2026x')
    expect(r.ok).toBe(false)
    expect(c.signInWithPassword).not.toHaveBeenCalled()
  })

  it('panne (exception) : jamais « ok », message de panne', async () => {
    const r = await verifierMotDePasseActuel(
      client(new TypeError('Failed to fetch'), true),
      'moi@exemple.test',
      'Actuel-2026x',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/injoignable/)
  })

  it('trop de tentatives : le dit', () => {
    expect(messageMotDePasseActuel({ status: 429 })).toMatch(
      /Trop de tentatives/,
    )
  })
})
