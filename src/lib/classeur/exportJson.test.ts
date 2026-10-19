import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'

/*
 * Copier pour une IA (étape 3 du plan `classeur-echange-ia-2026-10-19`).
 * Oracles : le texte est EXACTEMENT `serialiserExport(construireExport(…))` ;
 * un presse-papiers qui refuse, ou absent (page non sécurisée), donne le
 * fichier téléchargé, sans exception.
 */

const telecharge = vi.fn()
vi.mock('#/lib/classeur/download.ts', () => ({
  telechargerTexte: (...args: unknown[]) => telecharge(...args),
}))

const {
  MIME_JSON,
  copierOuTelecharger,
  serialiserExport,
  texteExportClasseur,
} = await import('#/lib/classeur/exportJson.ts')

const A = chapitre({ id: 10, label: 'Accueil' })
const contenu = etat([A], {
  documents: [document({ id: 1, chapter_id: 10, title: 'Check-in' })],
}).content
const date = new Date('2026-10-19T08:00:00Z')

beforeEach(() => telecharge.mockReset())

describe('texteExportClasseur', () => {
  it('est exactement serialiserExport(construireExport(…))', () => {
    expect(
      texteExportClasseur(classeur(), [A], contenu, PERIODICITES, date),
    ).toBe(
      serialiserExport(
        construireExport(classeur(), [A], contenu, PERIODICITES, date),
      ),
    )
  })
})

describe('copierOuTelecharger', () => {
  it('presse-papiers accepté : copié, rien de téléchargé', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    expect(await copierOuTelecharger('{"a":1}', 'X.json', { writeText })).toBe(
      'copie',
    )
    expect(writeText).toHaveBeenCalledWith('{"a":1}')
    expect(telecharge).not.toHaveBeenCalled()
  })

  it('presse-papiers refusé : le fichier est téléchargé, sans exception', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('NotAllowedError')))
    expect(await copierOuTelecharger('{"a":1}', 'X.json', { writeText })).toBe(
      'telecharge',
    )
    expect(telecharge).toHaveBeenCalledExactlyOnceWith(
      'X.json',
      '{"a":1}',
      MIME_JSON,
    )
  })

  it('presse-papiers absent (page non sécurisée) : téléchargé', async () => {
    expect(await copierOuTelecharger('t', 'Y.json', undefined)).toBe(
      'telecharge',
    )
    expect(telecharge).toHaveBeenCalledExactlyOnceWith('Y.json', 't', MIME_JSON)
  })

  it('refus SYNCHRONE du presse-papiers : téléchargé aussi', async () => {
    const writeText = vi.fn((): Promise<void> => {
      throw new Error('boom')
    })
    expect(await copierOuTelecharger('t', 'Z.json', { writeText })).toBe(
      'telecharge',
    )
    expect(telecharge).toHaveBeenCalledTimes(1)
  })
})
