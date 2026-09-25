// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { telechargerBlob, telechargerTexte } from '#/lib/classeur/download.ts'

/*
 * jsdom n'implémente ni `URL.createObjectURL` ni `URL.revokeObjectURL` : on
 * les pose nous-mêmes, et on espionne `click()` sur les liens — c'est le
 * geste qui déclenche le téléchargement, il n'y a rien d'autre à observer.
 */

const URL_FACTICE = 'blob:mock/1234'

let blobsCrees: Blob[]
let creerUrl: ReturnType<typeof vi.fn>
let revoquerUrl: ReturnType<typeof vi.fn>
let clics: HTMLAnchorElement[]

beforeEach(() => {
  blobsCrees = []
  clics = []
  creerUrl = vi.fn((blob: Blob) => {
    blobsCrees.push(blob)
    return URL_FACTICE
  })
  revoquerUrl = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { value: creerUrl, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoquerUrl, configurable: true })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clics.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('telechargerBlob', () => {
  it('clique un lien `download` au nom nettoyé, puis révoque l’URL', () => {
    const blob = new Blob(['bonjour'], { type: 'text/plain' })

    telechargerBlob('Rapport: <2026>/09 ?.md', blob)

    expect(clics).toHaveLength(1)
    const a = clics[0]
    expect(a.download).toBe('Rapport 202609 .md')
    expect(a.href).toBe(URL_FACTICE)
    expect(creerUrl).toHaveBeenCalledWith(blob)
    expect(revoquerUrl).toHaveBeenCalledTimes(1)
    expect(revoquerUrl).toHaveBeenCalledWith(URL_FACTICE)
  })

  it('révoque APRÈS le clic, et retire le lien du document', () => {
    const ordre: string[] = []
    revoquerUrl.mockImplementation(() => ordre.push('revoke'))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      ordre.push('click')
      // Attaché au document au moment du clic (Firefox l'exige).
      expect(this.isConnected).toBe(true)
    })

    telechargerBlob('x.txt', new Blob(['x']))

    expect(ordre).toEqual(['click', 'revoke'])
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })

  it('repli « export » quand le nettoyage ne laisse rien', () => {
    telechargerBlob('???', new Blob(['x']))
    expect(clics[0].download).toBe('export')
  })

  it('révoque même si le clic lève', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('bloqué')
    })
    expect(() => telechargerBlob('x.txt', new Blob(['x']))).toThrow('bloqué')
    expect(revoquerUrl).toHaveBeenCalledWith(URL_FACTICE)
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })
})

describe('telechargerTexte', () => {
  it('emballe le texte en Markdown UTF-8 par défaut', async () => {
    telechargerTexte('note.md', '# Titre\n')

    expect(clics[0].download).toBe('note.md')
    expect(blobsCrees).toHaveLength(1)
    expect(blobsCrees[0].type).toBe('text/markdown;charset=utf-8')
    expect(await blobsCrees[0].text()).toBe('# Titre\n')
  })

  it('accepte un autre type MIME (JSON)', () => {
    telechargerTexte('c.json', '{}', 'application/json;charset=utf-8')
    expect(blobsCrees[0].type).toBe('application/json;charset=utf-8')
  })
})
