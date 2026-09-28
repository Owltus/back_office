import { describe, expect, it } from 'vitest'

import { estRefusDroits, messageErreur } from '#/lib/classeur/erreur.ts'

describe('messageErreur', () => {
  it('refus de droits : phrase dédiée', () => {
    expect(estRefusDroits({ code: '42501' })).toBe(true)
    expect(messageErreur({ code: '42501', message: 'x' })).toMatch(/droits/)
  })

  it("n'expose jamais le message brut d'une erreur de la base", () => {
    const brut =
      'duplicate key value violates unique constraint "classeur_images_chemin_key"'
    for (const code of ['23505', '23514', '22P02', 'P0001', 'PGRST116']) {
      const m = messageErreur({ code, message: brut }, 'Envoi impossible')
      expect(m).not.toContain('classeur_')
      expect(m).not.toContain('constraint')
      expect(m.startsWith('Envoi impossible')).toBe(true)
    }
    expect(messageErreur({ code: '23505', message: brut })).toMatch(
      /existe déjà/,
    )
  })

  it("garde le message d'une erreur du navigateur", () => {
    expect(
      messageErreur(new TypeError('Failed to fetch'), 'Export impossible'),
    ).toBe('Export impossible : Failed to fetch')
    expect(messageErreur(null)).toBe('Opération impossible.')
  })
})
