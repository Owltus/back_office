import { describe, expect, it } from 'vitest'

import { messageConnexion, messageMotDePasse } from '#/lib/auth/messages.ts'

describe('messageConnexion', () => {
  it('identifiants refusés', () => {
    expect(messageConnexion({ status: 400, code: 'invalid_credentials' })).toBe(
      'Email ou mot de passe incorrect',
    )
  })
  it('panne : jamais « mot de passe incorrect »', () => {
    expect(messageConnexion(new TypeError('Failed to fetch'))).toMatch(
      /injoignable/,
    )
    expect(messageConnexion({ status: 503 })).toMatch(/injoignable/)
  })
  it('trop de tentatives', () => {
    expect(messageConnexion({ status: 429 })).toMatch(/Trop de tentatives/)
  })
})

describe('messageMotDePasse', () => {
  it('traduit les refus connus, jamais le texte anglais', () => {
    expect(messageMotDePasse({ code: 'same_password' })).toMatch(/différent/)
    expect(messageMotDePasse({ code: 'weak_password' })).toMatch(/faible/)
    expect(
      messageMotDePasse({ code: 'x', message: 'New password should be…' }),
    ).toBe('Mot de passe non modifié. Réessayez.')
  })
})
