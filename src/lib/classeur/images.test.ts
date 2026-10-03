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
  IMAGE_A_INSERER,
  ajustementApplique,
  ajustementDepuisTitre,
  cadreDepuisTitre,
  estImageAInserer,
  cheminOriginalImage,
  jetonImage,
  tailleDepuisTitre,
  titreImage,
  trouverImage,
  markdownImage,
  recadrageBorne,
  retirerImageDuMarkdown,
  remplacementImage,
  cheminDuJeton,
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
  it('légende nettoyée (ni crochets ni retours) ; URL sans espace ni parenthèse', () => {
    expect(texteAlternatif('Chaudière [salle] 2.JPG')).toBe('Chaudière salle 2')
    expect(texteAlternatif('.png')).toBe('image')
    expect(texteAlternatif('   ')).toBe('image')
    expect(markdownImage('Plan [RDC]\n', 'https://x.test/a b(1).webp')).toBe(
      '![Plan RDC](https://x.test/a%20b%281%29.webp)',
    )
    // Pas de légende : crochets vides, rien n'est imprimé sous l'image.
    expect(markdownImage('', 'https://x.test/a.webp')).toBe(
      '![](https://x.test/a.webp)',
    )
  })
  it('la ligne insérée porte le CHEMIN du bucket, jamais une URL', () => {
    const chemin = cheminImage(2, '0f2a9b1c-1234-4abc-8def-0123456789ab')
    expect(markdownImage('Plan', chemin)).toBe(
      '![Plan](2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp)',
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

describe('taille sur la page — portée par le titre Markdown', () => {
  const chemin = '2/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'
  it('markdownImage écrit la taille, rien en automatique', () => {
    expect(markdownImage('Plan', chemin, 'moyenne')).toBe(
      `![Plan](${chemin} "moyenne")`,
    )
    expect(markdownImage('Plan', chemin, 'auto')).toBe(`![Plan](${chemin})`)
    expect(markdownImage('Plan', chemin)).toBe(`![Plan](${chemin})`)
    expect(titreImage('pleine')).toBe(' "pleine"')
    expect(titreImage()).toBe('')
  })
  it('tailleDepuisTitre lit les trois mots, automatique sinon', () => {
    expect(tailleDepuisTitre('petite')).toBe('petite')
    expect(tailleDepuisTitre(' Moyenne ')).toBe('moyenne')
    expect(tailleDepuisTitre('pleine')).toBe('pleine')
    expect(tailleDepuisTitre('grande')).toBe('grande')
    expect(tailleDepuisTitre('enorme')).toBe('auto')
    expect(tailleDepuisTitre('rien')).toBe('auto')
    expect(tailleDepuisTitre(undefined)).toBe('auto')
  })
  it('lecture TOLÉRANTE de l’ancienne syntaxe (2026-09-30)', () => {
    expect(tailleDepuisTitre('largeur=20 position=droite')).toBe('petite')
    expect(tailleDepuisTitre('largeur=25 position=gauche')).toBe('petite')
    expect(tailleDepuisTitre('largeur=50')).toBe('moyenne')
    expect(tailleDepuisTitre('largeur=75')).toBe('grande')
    expect(tailleDepuisTitre('largeur=95')).toBe('pleine')
    expect(tailleDepuisTitre('largeur=100')).toBe('auto')
    expect(tailleDepuisTitre('largeur=5')).toBe('auto')
  })
  it('une image avec taille reste référencée (usages) comme sans', () => {
    expect(imagesReferencees(markdownImage('a', chemin, 'petite'))).toEqual([
      chemin,
    ])
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

describe('trouverImage / jetonImage — retoucher une image placée', () => {
  const A = '12/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  const B = '12/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'
  const texte = [
    '# Titre',
    '',
    `![Accueil](${A})`,
    '',
    `Texte ![Plan](${B} "moyenne") en ligne.`,
    '',
    `![Accueil bis](${A} "largeur=75 position=gauche")`,
  ].join('\n')

  it('trouve l’image sur la ligne cliquée, avec sa taille', () => {
    const t = trouverImage(texte, A, 7)
    expect(t).toMatchObject({ alt: 'Accueil bis', taille: 'grande' })
    expect(texte.slice(t!.debut, t!.fin)).toBe(
      `![Accueil bis](${A} "largeur=75 position=gauche")`,
    )
  })

  it('sans ligne (ou ligne fausse) : la première occurrence', () => {
    expect(trouverImage(texte, A)?.alt).toBe('Accueil')
    expect(trouverImage(texte, A, 1)?.alt).toBe('Accueil')
  })

  it('image au milieu d’une ligne, taille lue', () => {
    expect(trouverImage(texte, B, 5)).toMatchObject({
      alt: 'Plan',
      taille: 'moyenne',
    })
  })

  it('image absente du texte : null', () => {
    expect(
      trouverImage(texte, '12/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'),
    ).toBe(null)
  })

  it('réécrit le jeton : légende et taille posées, ancienne syntaxe remplacée', () => {
    expect(jetonImage('Plan', B, 'petite')).toBe(`![Plan](${B} "petite")`)
    expect(jetonImage('Plan', B, 'auto')).toBe(`![Plan](${B})`)
    expect(jetonImage('Plan [v2]', A)).toBe(`![Plan v2](${A})`)
    // Relu tel quel par le moteur de rendu.
    expect(tailleDepuisTitre('petite')).toBe('petite')
  })
})

describe('cadre NON destructif — réglage écrit dans le titre', () => {
  const C = '5/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  it('écrit taille et cadre, rien pour l’image entière en automatique', () => {
    expect(titreImage('auto', { x: 10, y: 5, largeur: 80, hauteur: 60 })).toBe(
      ' "cadre=10,5,80,60"',
    )
    expect(
      titreImage('petite', { x: 12.34, y: 0, largeur: 50.06, hauteur: 100 }),
    ).toBe(' "petite cadre=12.3,0,50.1,100"')
    // Cadre (presque) entier = pas de cadre.
    expect(
      titreImage('auto', { x: 0, y: 0, largeur: 100, hauteur: 99.8 }),
    ).toBe('')
  })
  it('relit le cadre, borné à l’image ; invalide = image entière', () => {
    expect(cadreDepuisTitre('petite cadre=10,5,80,60')).toEqual({
      x: 10,
      y: 5,
      largeur: 80,
      hauteur: 60,
    })
    // Débordement ramené dans l'image.
    expect(cadreDepuisTitre('cadre=50,50,80,80')).toEqual({
      x: 50,
      y: 50,
      largeur: 50,
      hauteur: 50,
    })
    expect(cadreDepuisTitre('cadre=a,b,c,d')).toBeNull()
    expect(cadreDepuisTitre('petite')).toBeNull()
    expect(cadreDepuisTitre(undefined)).toBeNull()
    // La taille se lit toujours à côté du cadre.
    expect(tailleDepuisTitre('moyenne cadre=1,2,3,4')).toBe('moyenne')
  })
  it('aller-retour : trouverImage rend le cadre, jetonImage le réécrit', () => {
    const texte = `![Vanne](${C} "moyenne cadre=10,5,80,60")`
    const t = trouverImage(texte, C)
    expect(t).toMatchObject({
      taille: 'moyenne',
      cadre: { x: 10, y: 5, largeur: 80, hauteur: 60 },
    })
    expect(jetonImage(t!.alt, C, t!.taille, t!.cadre)).toBe(texte)
    // « Image entière » : le cadre disparaît, le fichier n'a jamais changé.
    expect(jetonImage('Vanne', C, 'moyenne', null)).toBe(
      `![Vanne](${C} "moyenne")`,
    )
  })
  it('une image cadrée reste référencée (usages, suppression)', () => {
    expect(imagesReferencees(`![a](${C} "cadre=1,1,50,50")`)).toEqual([C])
    expect(
      retirerImageDuMarkdown(`a\n\n![a](${C} "cadre=1,1,50,50")\n\nb`, C),
    ).toBe('a\n\nb')
  })
  it('chemin de l’original : même uuid, suffixe `.original.webp`', () => {
    expect(cheminOriginalImage(5, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(
      '5/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.original.webp',
    )
    // L'original n'est jamais un chemin que le rendu affiche.
    expect(
      estCheminImage('5/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.original.webp'),
    ).toBe(false)
  })
})

describe('ajustement dans une case et emplacement à remplir', () => {
  const C = '5/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  it('remplir par défaut, `entiere` seulement quand demandé', () => {
    expect(ajustementDepuisTitre(undefined)).toBe('remplir')
    expect(ajustementDepuisTitre('petite cadre=1,1,50,50')).toBe('remplir')
    expect(ajustementDepuisTitre('entiere cadre=1,1,50,50')).toBe('entiere')
    expect(titreImage('auto', null, 'entiere')).toBe(' "entiere"')
    expect(titreImage('auto', null, 'remplir')).toBe('')
    const jeton = jetonImage(
      'Vanne',
      C,
      'auto',
      { x: 0, y: 0, largeur: 50, hauteur: 50 },
      'entiere',
    )
    expect(jeton).toBe(`![Vanne](${C} "entiere cadre=0,0,50,50")`)
    expect(trouverImage(jeton, C)).toMatchObject({ ajustement: 'entiere' })
  })
  it('emplacement : reconnu, retrouvé par sa ligne, jamais pris pour une image stockée', () => {
    expect(estImageAInserer(IMAGE_A_INSERER)).toBe(true)
    expect(estImageAInserer(C)).toBe(false)
    expect(estCheminImage(IMAGE_A_INSERER)).toBe(false)
    const texte = '![Vanne](a-inserer)\n\n![Thermomètre](a-inserer "petite")'
    expect(trouverImage(texte, IMAGE_A_INSERER, 3)).toMatchObject({
      alt: 'Thermomètre',
      taille: 'petite',
    })
    expect(imagesReferencees(texte)).toEqual([])
  })
})

describe('remplacer une image', () => {
  const A = '5/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
  const B = '5/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'
  const appliquer = (
    v: string,
    e: { debut: number; fin: number; texte: string },
  ) => v.slice(0, e.debut) + e.texte + v.slice(e.fin)
  it('seul le fichier change : légende, taille, ajustement et bloc gardés, cadre retiré', () => {
    const v = `:::etape{photo=gauche}
Texte.

![Vanne](${A} "grande entiere cadre=10,10,50,50")
:::`
    const e = remplacementImage(v, A, undefined, B)!
    expect(appliquer(v, e)).toBe(
      `:::etape{photo=gauche}
Texte.

![Vanne](${B} "grande entiere")
:::`,
    )
  })
  it('la ligne départage deux occurrences ; image absente → null', () => {
    const v = `![Un](${A})

![Deux](${A} "petite")`
    expect(appliquer(v, remplacementImage(v, A, 3, B)!)).toBe(
      `![Un](${A})

![Deux](${B} "petite")`,
    )
    expect(remplacementImage(v, B, undefined, A)).toBeNull()
  })
  it('lit le chemin d’une ligne Markdown', () => {
    expect(cheminDuJeton(`![x](${A} "petite")`)).toBe(A)
    expect(cheminDuJeton('du texte')).toBeNull()
  })
})

describe('ajustement appliqué dans une case de planche', () => {
  it('4:3 et 3:4 remplissent ; panorama et photo très haute restent entiers', () => {
    expect(ajustementApplique('remplir', 4 / 3)).toBe('remplir')
    expect(ajustementApplique('remplir', 3 / 4)).toBe('remplir')
    expect(ajustementApplique('remplir', 4)).toBe('entiere')
    expect(ajustementApplique('remplir', 1 / 3)).toBe('entiere')
    expect(ajustementApplique('entiere', 4 / 3)).toBe('entiere')
    expect(ajustementApplique('remplir', Number.NaN)).toBe('remplir')
  })
})
