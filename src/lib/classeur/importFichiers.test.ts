import { describe, expect, it } from 'vitest'

import {
  estFichierTexte,
  titreDepuisNom,
  trierFichiers,
} from '#/lib/classeur/importFichiers.ts'
import { MAX_MARKDOWN_BYTES } from '#/lib/shared/files.ts'

function fichier(nom: string, taille = 10): File {
  return new File([new Uint8Array(taille)], nom)
}

describe('estFichierTexte', () => {
  it('accepte .md et .txt, casse ignorée', () => {
    expect(estFichierTexte('note.md')).toBe(true)
    expect(estFichierTexte('NOTE.MD')).toBe(true)
    expect(estFichierTexte('note.txt')).toBe(true)
  })

  it('refuse les autres extensions', () => {
    expect(estFichierTexte('note.pdf')).toBe(false)
    expect(estFichierTexte('note')).toBe(false)
    expect(estFichierTexte('note.md.bak')).toBe(false)
  })
})

describe('titreDepuisNom', () => {
  it('retire l extension, une seule fois', () => {
    expect(titreDepuisNom('Sécurité incendie.md')).toBe('Sécurité incendie')
    expect(titreDepuisNom('a.md.md')).toBe('a.md')
    expect(titreDepuisNom('  notes.TXT ')).toBe('notes')
  })

  it('remplace un nom vide par Sans titre', () => {
    expect(titreDepuisNom('.md')).toBe('Sans titre')
  })
})

describe('trierFichiers', () => {
  it('sépare acceptés et refus, dans l ordre', () => {
    const tri = trierFichiers([
      fichier('a.md'),
      fichier('b.pdf'),
      fichier('c.txt'),
      fichier('d.md', MAX_MARKDOWN_BYTES + 1),
    ])
    expect(tri.acceptes.map((f) => f.name)).toEqual(['a.md', 'c.txt'])
    expect(tri.refus).toHaveLength(2)
    expect(tri.refus[0]).toContain('b.pdf')
    expect(tri.refus[1]).toContain('d.md')
  })

  it('accepte un fichier pile à la borne', () => {
    const tri = trierFichiers([fichier('a.md', MAX_MARKDOWN_BYTES)])
    expect(tri.acceptes).toHaveLength(1)
    expect(tri.refus).toEqual([])
  })
})
