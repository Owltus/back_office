import { describe, expect, it, vi } from 'vitest'

import {
  MAX_COTE_PX,
  MAX_IMAGE_SOURCE_BYTES,
  cheminImage,
  dimensionsReduites,
  estCheminImage,
  estImage,
  formaterOctets,
  markdownImage,
  refusImageSource,
  texteAlternatif,
} from '#/lib/classeur/images.ts'

// `vi.mock` est hissé par vitest : l'import ci-dessus voit le client simulé.
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

/*
 * La partie PURE de la chaîne image → WebP → Storage → Markdown. La
 * conversion (canvas) et l'envoi sont exercés dans le navigateur.
 */

describe('dimensionsReduites — plus long côté borné, jamais agrandi', () => {
  it('laisse une petite image intacte', () => {
    expect(dimensionsReduites(800, 600)).toEqual({ largeur: 800, hauteur: 600 })
    expect(dimensionsReduites(1600, 900)).toEqual({
      largeur: 1600,
      hauteur: 900,
    })
  })
  it('réduit une grande image en gardant le rapport', () => {
    expect(dimensionsReduites(4000, 3000)).toEqual({
      largeur: MAX_COTE_PX,
      hauteur: 1200,
    })
    expect(dimensionsReduites(3000, 4000)).toEqual({
      largeur: 1200,
      hauteur: MAX_COTE_PX,
    })
    expect(dimensionsReduites(6000, 100, 600)).toEqual({
      largeur: 600,
      hauteur: 10,
    })
  })
  it('ne rend jamais zéro', () => {
    expect(dimensionsReduites(10000, 1, 100)).toEqual({
      largeur: 100,
      hauteur: 1,
    })
    expect(dimensionsReduites(0, 0)).toEqual({ largeur: 1, hauteur: 1 })
  })
})

describe('cheminImage — le dossier est le classeur (RLS)', () => {
  it('forme <classeurId>/<uuid>.webp', () => {
    expect(cheminImage(2, 'abc')).toBe('2/abc.webp')
    expect(cheminImage(2)).toMatch(/^2\/[0-9a-f-]{36}\.webp$/)
  })
  it('refuse un classeur invalide', () => {
    expect(() => cheminImage(0)).toThrow()
    expect(() => cheminImage(1.5)).toThrow()
    expect(() => cheminImage(Number.NaN)).toThrow()
  })
})

describe('markdownImage', () => {
  it('alt = nom sans extension, sans crochets ; URL sans espace ni parenthèse', () => {
    expect(texteAlternatif('Chaudière [salle] 2.JPG')).toBe('Chaudière salle 2')
    expect(texteAlternatif('.png')).toBe('image')
    expect(texteAlternatif('   ')).toBe('image')
    expect(markdownImage('plan.png', 'https://x.test/a b(1).webp')).toBe(
      '![plan](https://x.test/a%20b%281%29.webp)',
    )
  })
  it('la ligne insérée porte le CHEMIN du bucket, jamais une URL', () => {
    const chemin = cheminImage(2, '0f2a9b1c-1234-4abc-8def-0123456789ab')
    expect(markdownImage('plan.png', chemin)).toBe(
      '![plan](2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp)',
    )
    expect(estCheminImage(chemin)).toBe(true)
  })
})

describe('estCheminImage — ce que le rendu lit par l’API', () => {
  it('accepte <classeurId>/<uuid>.webp et rien d’autre', () => {
    expect(estCheminImage('2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp')).toBe(
      true,
    )
    expect(estCheminImage('2/0F2A9B1C-1234-4ABC-8DEF-0123456789AB.WEBP')).toBe(
      true,
    )
    expect(
      estCheminImage(
        'https://x.test/2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp',
      ),
    ).toBe(false)
    expect(estCheminImage('2/photo.webp')).toBe(false)
    expect(
      estCheminImage('../2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'),
    ).toBe(false)
    expect(estCheminImage('2/0f2a9b1c-1234-4abc-8def-0123456789ab.png')).toBe(
      false,
    )
    expect(estCheminImage(null)).toBe(false)
    expect(estCheminImage(undefined)).toBe(false)
  })
})

describe('refusImageSource', () => {
  it('accepte une image par type ou par extension, refuse le reste et le trop lourd', () => {
    expect(estImage({ type: 'image/heic', name: 'x' })).toBe(true)
    expect(estImage({ type: '', name: 'photo.JPG' })).toBe(true)
    expect(estImage({ type: 'application/pdf', name: 'doc.pdf' })).toBe(false)
    expect(
      refusImageSource({ type: 'image/png', name: 'a.png', size: 10 }),
    ).toBeNull()
    expect(
      refusImageSource({ type: 'text/plain', name: 'a.txt', size: 10 }),
    ).toMatch(/pas une image/)
    expect(
      refusImageSource({
        type: 'image/png',
        name: 'a.png',
        size: MAX_IMAGE_SOURCE_BYTES + 1,
      }),
    ).toMatch(/trop volumineuse/)
  })
})

describe('formaterOctets', () => {
  it('o, ko, Mo', () => {
    expect(formaterOctets(512)).toBe('512 o')
    expect(formaterOctets(180 * 1024)).toBe('180 ko')
    expect(formaterOctets(2.4 * 1024 * 1024)).toBe('2,4 Mo')
  })
})
