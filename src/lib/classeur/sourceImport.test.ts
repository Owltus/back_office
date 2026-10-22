import { describe, expect, it } from 'vitest'

import {
  MESSAGE_PAS_UN_EXPORT,
  lireSource,
} from '#/lib/classeur/sourceImport.ts'

/*
 * Ce qu'on dépose dans un import (trouvé au navigateur le 2026-10-22) : une
 * photo déposée par erreur donnait « son numéro de version manque ». Un
 * fichier qui n'est pas du texte est refusé d'emblée, en clair ; un export
 * .json ou une réponse en .txt passe.
 */

const fichier = (contenu: BlobPart, nom: string, type = '') => ({
  type: 'fichier' as const,
  file: new File([contenu], nom, { type }),
})

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 123, 125])

describe('lireSource', () => {
  it.each([
    ['photo.png', 'image/png'],
    ['photo.jpg', ''],
    ['consigne.pdf', 'application/pdf'],
    [
      'procedure.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  ])('%s : refusé, en clair', async (nom, type) => {
    await expect(lireSource(fichier(PNG, nom, type))).rejects.toThrow(
      MESSAGE_PAS_UN_EXPORT,
    )
  })

  it('un binaire renommé en .json : refusé', async () => {
    await expect(
      lireSource(fichier(PNG, 'export.json', 'application/json')),
    ).rejects.toThrow(MESSAGE_PAS_UN_EXPORT)
  })

  it('un export .json, une réponse .txt, un texte collé : lus', async () => {
    const json = '{"format_version":2,"chapters":[]}'
    expect(
      await lireSource(fichier(json, 'export.json', 'application/json')),
    ).toBe(json)
    expect(await lireSource(fichier('Voici :\n' + json, 'r.txt'))).toBe(
      'Voici :\n' + json,
    )
    expect(await lireSource({ type: 'texte', texte: json })).toBe(json)
  })
})
