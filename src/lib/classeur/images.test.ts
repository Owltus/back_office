import { describe, expect, it, vi } from 'vitest'

import {
  MAX_COTE_PX,
  MAX_IMAGE_SOURCE_BYTES,
  cheminImage,
  dimensionsReduites,
  estCheminImage,
  estImage,
  boiteTournee,
  formaterOctets,
  imagesReferencees,
  largeurDepuisTitre,
  markdownImage,
  recadrageBorne,
  retirerImageDuMarkdown,
  usagesImages,
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

describe('largeur dans la page — portée par le titre Markdown', () => {
  it('markdownImage ajoute "largeur=NN" sous 100 et rien à 100', () => {
    const chemin = '2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'
    expect(markdownImage('plan.png', chemin, 50)).toBe(
      `![plan](${chemin} "largeur=50")`,
    )
    expect(markdownImage('plan.png', chemin, 100)).toBe(`![plan](${chemin})`)
    expect(markdownImage('plan.png', chemin)).toBe(`![plan](${chemin})`)
  })
  it('largeurDepuisTitre lit la valeur, borne 10..100, 100 par défaut', () => {
    expect(largeurDepuisTitre('largeur=50')).toBe(50)
    expect(largeurDepuisTitre('note largeur=33 fin')).toBe(33)
    expect(largeurDepuisTitre('largeur=5')).toBe(100)
    expect(largeurDepuisTitre('largeur=150')).toBe(100)
    expect(largeurDepuisTitre('rien')).toBe(100)
    expect(largeurDepuisTitre(undefined)).toBe(100)
  })
  it('une image avec largeur reste référencée (usages) comme sans', () => {
    const chemin = '2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'
    expect(imagesReferencees(markdownImage('a', chemin, 33))).toEqual([chemin])
  })
})

describe('recadrage et rotation — géométrie pure', () => {
  it('recadrageBorne : borne à l’image, jamais vide, null si tout est couvert', () => {
    expect(recadrageBorne(100, 80, undefined)).toBeNull()
    expect(
      recadrageBorne(100, 80, { x: 0, y: 0, largeur: 100, hauteur: 80 }),
    ).toBeNull()
    expect(
      recadrageBorne(100, 80, { x: 10.4, y: 5.6, largeur: 50, hauteur: 40 }),
    ).toEqual({ x: 10, y: 6, largeur: 50, hauteur: 40 })
    expect(
      recadrageBorne(100, 80, { x: -20, y: -20, largeur: 500, hauteur: 500 }),
    ).toBeNull()
    expect(
      recadrageBorne(100, 80, { x: 90, y: 70, largeur: 50, hauteur: 50 }),
    ).toEqual({ x: 90, y: 70, largeur: 10, hauteur: 10 })
    expect(
      recadrageBorne(100, 80, { x: 500, y: 500, largeur: 0, hauteur: 0 }),
    ).toEqual({ x: 99, y: 79, largeur: 1, hauteur: 1 })
  })
  it('boiteTournee : quarts de tour échangent les côtés, 45° agrandit', () => {
    expect(boiteTournee(400, 300, 0)).toEqual({ largeur: 400, hauteur: 300 })
    expect(boiteTournee(400, 300, 90)).toEqual({ largeur: 300, hauteur: 400 })
    expect(boiteTournee(400, 300, 180)).toEqual({ largeur: 400, hauteur: 300 })
    const b = boiteTournee(400, 300, 45)
    expect(b.largeur).toBeGreaterThan(400)
    expect(b.hauteur).toBeGreaterThan(300)
    expect(b.largeur).toBe(b.hauteur)
  })
})

describe('retirerImageDuMarkdown — suppression propre d’une image', () => {
  const A = '2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'
  const B = '2/1a2b3c4d-1234-4abc-8def-0123456789ab.webp'
  it('retire la ligne qui ne portait que l’image, sans laisser deux lignes vides', () => {
    const md = `# Titre\n\n![Plan](${A})\n\nSuite du texte.`
    expect(retirerImageDuMarkdown(md, A)).toBe('# Titre\n\nSuite du texte.')
  })
  it('retire seulement le jeton au milieu d’une ligne, garde les autres images', () => {
    const md = `Voir ![a](${A}) puis ![b](${B}) fin\n![a](${A} "largeur=50")`
    expect(retirerImageDuMarkdown(md, A)).toBe(`Voir  puis ![b](${B}) fin`)
  })
  it('conserve le reste à l’octet près et reste idempotent', () => {
    const md = `Ligne 1\n\n\nLigne 2 (deux vides gardées)\n![x](${B})\n`
    expect(retirerImageDuMarkdown(md, A)).toBe(md)
    const une = retirerImageDuMarkdown(md, B)
    expect(une).toBe('Ligne 1\n\n\nLigne 2 (deux vides gardées)\n')
    expect(retirerImageDuMarkdown(une, B)).toBe(une)
  })
  it('insensible à la casse du chemin', () => {
    expect(retirerImageDuMarkdown(`![a](${A.toUpperCase()})`, A)).toBe('')
  })
  it('après retrait, l’image n’est plus référencée', () => {
    const md = `![a](${A})\n\ntexte\n\n![a](${A})`
    expect(imagesReferencees(retirerImageDuMarkdown(md, A))).toEqual([])
  })
})

describe('imagesReferencees / usagesImages — l’usage est CALCULÉ depuis les documents', () => {
  const A = '2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'
  const B = '2/1a2b3c4d-1234-4abc-8def-0123456789ab.webp'
  it('extrait les chemins du bucket, une fois chacun, pas les URL externes', () => {
    const md = `# Titre\n\n![Plan](${A})\n\ntexte ![ext](https://x.test/a.png)\n\n![Plan bis](${A} "titre")\n![B](<${B}>)`
    expect(imagesReferencees(md)).toEqual([A, B])
    expect(imagesReferencees('rien')).toEqual([])
  })
  it('associe chaque image à ses documents non supprimés, dans l’ordre des chapitres', () => {
    const chapters = [
      { id: 10, label: 'Gaz', sort_order: 2 },
      { id: 20, label: 'Incendie', sort_order: 1 },
    ]
    const doc = (
      id: number,
      chapter_id: number,
      content: string,
      deleted_at: string | null = null,
    ) => ({
      id,
      uuid: `d${String(id)}`,
      chapter_id,
      title: `Doc ${String(id)}`,
      description: '',
      content,
      sort_order: id,
      deleted_at,
      created_at: '',
      updated_at: '',
    })
    const usages = usagesImages(chapters, {
      documents: [
        doc(1, 10, `![a](${A})`),
        doc(2, 20, `![a](${A}) ![b](${B})`),
        doc(3, 20, `![b](${B})`, '2026-01-01T00:00:00Z'),
      ],
    })
    expect(usages.get(A)?.map((u) => [u.chapterLabel, u.documentId])).toEqual([
      ['Incendie', 2],
      ['Gaz', 1],
    ])
    expect(usages.get(B)?.map((u) => u.documentId)).toEqual([2])
    expect(usages.get('2/inconnue.webp')).toBeUndefined()
  })
})

describe('formaterOctets', () => {
  it('o, ko, Mo', () => {
    expect(formaterOctets(512)).toBe('512 o')
    expect(formaterOctets(180 * 1024)).toBe('180 ko')
    expect(formaterOctets(2.4 * 1024 * 1024)).toBe('2,4 Mo')
  })
})
