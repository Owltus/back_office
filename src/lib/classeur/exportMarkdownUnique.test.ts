import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import {
  classeurEnMarkdown,
  construireArchiveMarkdown,
  construireMarkdownUnique,
  decalerTitres,
  fichierExport,
  nombreImages,
  redirigerImages,
  retirerImages,
} from '#/lib/classeur/exportMarkdown.ts'
import type {
  ChapterContent,
  DbChapter,
  DbDocument,
} from '#/lib/classeur/types.ts'

/*
 * Export du classeur en UN fichier Markdown et images mises dans
 * l'archive (demande utilisateur du 2026-11-13).
 */

const H = {
  deleted_at: null,
  created_at: '2026-11-13T10:00:00Z',
  updated_at: '2026-11-13T10:00:00Z',
}
const IMG = '7/0a1b2c3d-1111-2222-3333-444455556666.webp'
const IMG_PERDUE = '7/ffffffff-1111-2222-3333-444455556666.webp'

const chapitre = (id: number, label: string, ordre: number): DbChapter => ({
  id,
  uuid: `c${String(id)}`,
  classeur_id: 7,
  label,
  icon: 'FileText',
  description: '',
  sort_order: ordre,
  ...H,
})

const document = (
  id: number,
  chapitreId: number,
  titre: string,
  contenu: string,
): DbDocument => ({
  id,
  uuid: `d${String(id)}`,
  chapter_id: chapitreId,
  title: titre,
  description: '',
  content: contenu,
  sort_order: id,
  ...H,
})

const CHAPITRES = [chapitre(2, 'Nuit', 2), chapitre(1, 'Accueil', 1)]
const CONTENU: ChapterContent = {
  documents: [
    document(10, 1, 'Arrivée', `## Étape\n\n![Le comptoir](${IMG} "moyenne")`),
    document(11, 2, 'Ronde', `Texte\n\n![Perdue](${IMG_PERDUE})`),
  ],
  tracking_sheets: [],
  signature_sheets: [],
  intercalaires: [],
}

const lireImage = (c: string) =>
  c === IMG
    ? Promise.resolve(new Blob([new Uint8Array([1, 2, 3])]))
    : Promise.reject(new Error('absente'))

describe('export Markdown en un seul fichier', () => {
  it('decalerTitres décale hors des blocs de code, plafond ######', () => {
    const md = '# A\n```\n# pas un titre\n```\n##### B\n#sans espace'
    expect(decalerTitres(md, 2)).toBe(
      '### A\n```\n# pas un titre\n```\n###### B\n#sans espace',
    )
  })

  it('chapitres dans l ordre, document sous son chapitre', () => {
    const md = classeurEnMarkdown('Procédures', CHAPITRES, CONTENU)
    expect(md.startsWith('# Procédures\n\n## 1. Accueil\n\n### Arrivée')).toBe(
      true,
    )
    expect(md).toContain('#### Étape')
    expect(md.indexOf('## 2. Nuit')).toBeGreaterThan(md.indexOf('### Arrivée'))
  })

  it('un document supprimé n entre pas', () => {
    const md = classeurEnMarkdown('X', CHAPITRES, {
      ...CONTENU,
      documents: [{ ...CONTENU.documents[0], deleted_at: '2026-11-13' }],
    })
    expect(md).not.toContain('Arrivée')
  })

  it('redirigerImages ne touche que les images lues, garde le titre', () => {
    const md = `![a](${IMG} "moyenne") ![b](${IMG_PERDUE}) ![c](a-inserer)`
    expect(redirigerImages(md, new Set([IMG]), 'images/')).toBe(
      `![a](images/0a1b2c3d-1111-2222-3333-444455556666.webp "moyenne") ![b](${IMG_PERDUE}) ![c](a-inserer)`,
    )
  })

  it('archive : le .md et les images lues, une image perdue sautée', async () => {
    const zip = await JSZip.loadAsync(
      await (
        await construireMarkdownUnique('Procédures', CHAPITRES, CONTENU, {
          lireImage,
        })
      ).arrayBuffer(),
    )
    expect(Object.keys(zip.files).sort()).toEqual([
      'Procédures.md',
      'images/',
      'images/0a1b2c3d-1111-2222-3333-444455556666.webp',
    ])
    const md = await zip.file('Procédures.md')!.async('string')
    expect(md).toContain('](images/0a1b2c3d-1111-2222-3333-444455556666.webp')
    expect(md).toContain(`](${IMG_PERDUE})`)
  })

  it('archive par chapitres : images à la racine, liens en ../images/', async () => {
    const zip = await JSZip.loadAsync(
      await (
        await construireArchiveMarkdown(CHAPITRES, CONTENU, { lireImage })
      ).arrayBuffer(),
    )
    expect(
      zip.files['images/0a1b2c3d-1111-2222-3333-444455556666.webp'],
    ).toBeDefined()
    const md = await zip.file('1 - Accueil/1 - Arrivée.md')!.async('string')
    expect(md).toContain(
      '](../images/0a1b2c3d-1111-2222-3333-444455556666.webp',
    )
  })

  it('sans images : pas de dossier images', async () => {
    const zip = await JSZip.loadAsync(
      await (
        await construireMarkdownUnique(
          'X',
          CHAPITRES,
          {
            ...CONTENU,
            documents: [],
          },
          { lireImage },
        )
      ).arrayBuffer(),
    )
    expect(Object.keys(zip.files)).toEqual(['X.md'])
  })

  it('sans les images : la légende reste en texte, sans légende rien', () => {
    expect(
      retirerImages(`a ![Le comptoir](${IMG} "moyenne") b ![](a-inserer) c`),
    ).toBe('a *Image : Le comptoir* b  c')
  })

  it('archive par chapitres sans images : ni dossier images ni lien', async () => {
    const zip = await JSZip.loadAsync(
      await (
        await construireArchiveMarkdown(CHAPITRES, CONTENU, {
          avecImages: false,
        })
      ).arrayBuffer(),
    )
    expect(Object.keys(zip.files).some((k) => k.startsWith('images'))).toBe(
      false,
    )
    const md = await zip.file('1 - Accueil/1 - Arrivée.md')!.async('string')
    expect(md).toContain('*Image : Le comptoir*')
  })

  it('un seul fichier sans image à joindre : un .md, pas d archive', () => {
    const portee = {
      classeurName: 'Procédures',
      chapters: CHAPITRES,
      content: CONTENU,
    }
    expect(nombreImages(portee)).toBe(2)
    expect(
      fichierExport(portee, { forme: 'unique', avecImages: false }),
    ).toEqual({ nom: 'Procédures.md', archive: false })
    expect(
      fichierExport(portee, { forme: 'unique', avecImages: true }),
    ).toEqual({ nom: 'Procédures.zip', archive: true })
    expect(
      fichierExport(portee, { forme: 'dossiers', avecImages: false }).archive,
    ).toBe(true)
    const sansImage = { ...portee, content: { ...CONTENU, documents: [] } }
    expect(
      fichierExport(sansImage, { forme: 'unique', avecImages: true }),
    ).toEqual({ nom: 'Procédures.md', archive: false })
    expect(
      fichierExport(
        { ...portee, chapters: [CHAPITRES[1]], chapitre: CHAPITRES[1] },
        { forme: 'unique', avecImages: false },
      ).nom,
    ).toBe('Procédures - Accueil.md')
  })
})
