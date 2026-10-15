import { fc, test as fcTest } from '@fast-check/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  OCR_CHAR_THRESHOLD,
  PREVIEW_RASTER_SCALE,
} from '#/lib/facturation/constants.ts'

/*
 * `extract.ts` est un module NAVIGATEUR : pdf.js (worker), <canvas>, Tesseract.
 * Rien de cela n'existe sous Vitest (environnement node). On simule donc au
 * niveau le plus bas raisonnable, sans toucher au source :
 *  - `pdfjs-dist` : `getDocument` rend un faux document dont chaque page porte
 *    ses items de texte (`{ str }` ou items de balisage sans `str`), ses
 *    dimensions en points, et sait se « rendre » ;
 *  - `tesseract.js` : `createWorker` rend un faux worker dont `recognize`
 *    renvoie le texte OCR prévu pour la page rendue sur le canvas ;
 *  - `document.createElement('canvas')` : faux canvas qui retient sa taille,
 *    son contexte (nul sur demande) et la page qui y a été rendue.
 *
 * ORACLES utilisés (jamais la sortie observée) :
 *  - le contrat écrit en tête du module et des fonctions (concaténation de la
 *    couche texte page par page, bascule OCR « quand la couche texte est trop
 *    maigre (seuil par page) », rasterisation UNE fois par page, tesseract
 *    chargé seulement si l'OCR est requis, chemins locaux pour la CSP) ;
 *  - les constantes exportées (`MAX_PDF_BYTES` = 25 Mo, `MAX_PDF_PAGES` = 30,
 *    `OCR_CHAR_THRESHOLD`, `PREVIEW_RASTER_SCALE`) et les messages d'erreur
 *    annoncés à l'utilisateur ;
 *  - le type `ExtractResult` (`text`, `method`, `pageCount`, `previews`) et
 *    `PagePreview` (« dimensions en points » = échelle 1).
 */

interface FausePage {
  items: unknown[]
  width: number
  height: number
  ocr?: string
}

const etat = vi.hoisted(() => ({
  pages: [] as FausePage[],
  getDocument: vi.fn(),
  destroy: vi.fn(async () => {}),
  createWorker: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(async () => {}),
  canvases: [] as Array<{
    width: number
    height: number
    page: number | null
    toDataURL: ReturnType<typeof vi.fn>
  }>,
  contexteNul: new Set<number>(),
  echelles: [] as number[],
  echecTexte: null as Error | null,
  echecOcr: null as Error | null,
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {} as { workerSrc?: string },
  getDocument: (...a: unknown[]) => etat.getDocument(...a),
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/worker-de-test.mjs',
}))
vi.mock('tesseract.js', () => ({
  createWorker: (...a: unknown[]) => etat.createWorker(...a),
}))

const { extractPdf, MAX_PDF_BYTES, MAX_PDF_PAGES } =
  await import('#/lib/facturation/extract.ts')
const pdfjs = await import('pdfjs-dist')

function fauxPdf() {
  return {
    numPages: etat.pages.length,
    getPage: async (n: number) => {
      const p = etat.pages[n - 1]
      if (!p) throw new Error(`page ${n} inexistante`)
      return {
        getTextContent: async () => {
          if (etat.echecTexte) throw etat.echecTexte
          return { items: p.items }
        },
        getViewport: ({ scale }: { scale: number }) => {
          etat.echelles.push(scale)
          return { width: p.width * scale, height: p.height * scale }
        },
        render: ({ canvas }: { canvas: { page: number | null } }) => {
          canvas.page = n
          return { promise: Promise.resolve() }
        },
      }
    },
  }
}

function fauxFichier(size = 1000) {
  return {
    size,
    arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
  } as unknown as File & { arrayBuffer: ReturnType<typeof vi.fn> }
}

/** Page à couche texte : chaque chaîne devient un item `{ str }`. */
function page(strs: string[], ocr?: string, width = 595, height = 842) {
  return { items: strs.map((str) => ({ str })), width, height, ocr }
}

/** Texte de `n` caractères non blancs. */
const plein = (n: number) => 'x'.repeat(n)
/** Remplissage qui suffit à lui seul au seuil d'une page. */
const F = plein(OCR_CHAR_THRESHOLD)

beforeEach(() => {
  etat.pages = []
  etat.canvases = []
  etat.contexteNul = new Set()
  etat.echelles = []
  etat.echecTexte = null
  etat.echecOcr = null
  etat.destroy.mockClear()
  etat.terminate.mockClear()
  etat.getDocument.mockReset()
  etat.getDocument.mockImplementation(() => ({
    promise: Promise.resolve(fauxPdf()),
    destroy: etat.destroy,
  }))
  etat.recognize.mockReset()
  etat.recognize.mockImplementation(async (canvas: { page: number }) => {
    if (etat.echecOcr) throw etat.echecOcr
    return { data: { text: etat.pages[canvas.page - 1]?.ocr ?? '' } }
  })
  etat.createWorker.mockReset()
  etat.createWorker.mockImplementation(async () => ({
    recognize: etat.recognize,
    terminate: etat.terminate,
  }))
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      expect(tag).toBe('canvas')
      const index = etat.canvases.length
      const canvas = {
        width: 0,
        height: 0,
        page: null as number | null,
        getContext: () => (etat.contexteNul.has(index + 1) ? null : {}),
        toDataURL: vi.fn(
          (type: string, q: number) => `data:${type};q=${q};p=${canvas.page}`,
        ),
      }
      etat.canvases.push(canvas)
      return canvas
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('configuration de pdf.js', () => {
  it('pose le worker servi par Vite', () => {
    // ORACLE : commentaire « pdf.js exige un worker ; Vite le résout en URL ».
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/worker-de-test.mjs')
  })

  it('bornes annoncées : 25 Mo et 30 pages', () => {
    // ORACLE : commentaire « audit 2026-09-06 » et messages « 25 Mo maximum »,
    // « 30 pages maximum ».
    expect(MAX_PDF_BYTES).toBe(25 * 1024 * 1024)
    expect(MAX_PDF_PAGES).toBe(30)
  })
})

describe('bornes d’entrée', () => {
  it('refuse un fichier de plus de 25 Mo AVANT de le lire', async () => {
    // ORACLE : « un PDF tiers ne doit pas pouvoir geler l'onglet » → refus
    // sans arrayBuffer ni pdf.js.
    const f = fauxFichier(MAX_PDF_BYTES + 1)
    await expect(extractPdf(f)).rejects.toThrow(/25 Mo maximum/)
    expect(f.arrayBuffer).not.toHaveBeenCalled()
    expect(etat.getDocument).not.toHaveBeenCalled()
  })

  it('accepte un fichier de 25 Mo pile (borne incluse)', async () => {
    // ORACLE : « 25 Mo maximum » → 25 Mo est permis.
    etat.pages = [page([plein(OCR_CHAR_THRESHOLD)])]
    await expect(extractPdf(fauxFichier(MAX_PDF_BYTES))).resolves.toMatchObject(
      { pageCount: 1 },
    )
  })

  it('refuse un PDF de 31 pages et libère le document', async () => {
    // ORACLE : « 30 pages maximum » + `task.destroy()` avant l'erreur.
    etat.pages = Array.from({ length: MAX_PDF_PAGES + 1 }, () =>
      page([plein(100)]),
    )
    await expect(extractPdf(fauxFichier())).rejects.toThrow(/30 pages maximum/)
    expect(etat.destroy).toHaveBeenCalledTimes(1)
    expect(etat.canvases).toHaveLength(0)
  })

  it('accepte 30 pages pile', async () => {
    // ORACLE : « 30 pages maximum » → 30 est permis.
    etat.pages = Array.from({ length: MAX_PDF_PAGES }, () => page([plein(100)]))
    const r = await extractPdf(fauxFichier())
    expect(r.pageCount).toBe(30)
    expect(r.previews).toHaveLength(30)
  })

  it('transmet les octets du fichier à pdf.js', async () => {
    // ORACLE : `getDocument({ data: new Uint8Array(buf) })` = le contenu lu.
    etat.pages = [page([plein(100)])]
    await extractPdf(fauxFichier())
    const arg = etat.getDocument.mock.calls[0][0] as { data: Uint8Array }
    expect(arg.data).toBeInstanceOf(Uint8Array)
    expect(arg.data.byteLength).toBe(8)
  })
})

describe('chemin natif (couche texte)', () => {
  it('concatène les items d’une page par des espaces, les pages par des retours', async () => {
    // ORACLE : « Concatène la couche texte de toutes les pages » ; la facture
    // est lue ligne par ligne ensuite → une page = une ligne.
    etat.pages = [
      page(['FACTURE', 'N°', 'F-2026-001', 'ACME SARL', F]),
      page(['Total', 'TTC', '1 234,56 €', F]),
    ]
    const r = await extractPdf(fauxFichier())
    expect(r.method).toBe('native')
    expect(r.text).toBe(
      `FACTURE N° F-2026-001 ACME SARL ${F}\nTotal TTC 1 234,56 € ${F}`,
    )
    expect(r.pageCount).toBe(2)
  })

  it('conserve à l’identique montants, avoirs et caractères spéciaux', async () => {
    // ORACLE : l'extraction ne PARSE rien (c'est le rôle de amount.ts) : elle
    // doit rendre chaque caractère tel quel, espaces insécables compris.
    const items = [
      'Avoir',
      '-1 234,56 €', // espace fine insécable U+202F
      '−12,00 €', // signe moins U+2212
      '(45,00)',
      'Société « Éléphant & Cie »',
      'Zürich ß œ',
      '<script>alert(1)</script>',
      '😀',
    ]
    etat.pages = [page(items)]
    const r = await extractPdf(fauxFichier())
    for (const s of items) expect(r.text).toContain(s)
  })

  it('garde l’ordre des items tel que pdf.js le livre (aucun tri)', async () => {
    // ORACLE : le module « concatène » la couche texte, il ne la réordonne pas
    // (le flux d'un PDF peut être dans le désordre : c'est l'aval qui tolère).
    etat.pages = [page(['TTC', '100,00', 'Total', 'Date', F])]
    const r = await extractPdf(fauxFichier())
    expect(r.text.indexOf('TTC')).toBeLessThan(r.text.indexOf('100,00'))
    expect(r.text.indexOf('100,00')).toBeLessThan(r.text.indexOf('Total'))
    expect(r.text.indexOf('Total')).toBeLessThan(r.text.indexOf('Date'))
  })

  it('ignore les items de balisage sans `str`', async () => {
    // ORACLE : `'str' in it ? it.str : ''` — un TextMarkedContent n'apporte
    // aucun caractère ; on compare hors blancs.
    etat.pages = [
      {
        items: [
          { str: 'Montant' },
          { type: 'beginMarkedContent', id: 'mc0' },
          { str: plein(40) },
          { type: 'endMarkedContent' },
        ],
        width: 595,
        height: 842,
      },
    ]
    const r = await extractPdf(fauxFichier())
    expect(r.text.replace(/\s+/g, ' ')).toBe(`Montant ${plein(40)}`)
    expect(r.text).not.toContain('beginMarkedContent')
    expect(r.text).not.toContain('undefined')
  })

  it('retire les blancs de tête et de fin, garde ceux du milieu', async () => {
    // ORACLE : `text.trim()` final seulement.
    etat.pages = [page(['  ', plein(30), '  ']), page([plein(30), '   '])]
    const r = await extractPdf(fauxFichier())
    expect(r.text.startsWith('x')).toBe(true)
    expect(r.text.endsWith('x')).toBe(true)
    expect(r.text).toContain('\n')
  })

  it('ne charge pas tesseract quand la couche texte suffit', async () => {
    // ORACLE : « tesseract.js n'est chargé (import dynamique) que si l'OCR est
    // requis ».
    etat.pages = [page([plein(200)])]
    await extractPdf(fauxFichier())
    expect(etat.createWorker).not.toHaveBeenCalled()
    expect(etat.recognize).not.toHaveBeenCalled()
  })
})

describe('bascule vers l’OCR (seuil par page)', () => {
  it('PDF scanné (aucun texte) → OCR, texte de Tesseract page par page', async () => {
    // ORACLE : « PDF scanné (peu ou pas de texte) → … Tesseract (OCR, français) ».
    etat.pages = [page([], 'FACTURE scannée'), page([], 'Total TTC 99,90 €')]
    const r = await extractPdf(fauxFichier())
    expect(r.method).toBe('ocr')
    expect(r.text).toBe('FACTURE scannée\nTotal TTC 99,90 €')
    expect(etat.recognize).toHaveBeenCalledTimes(2)
  })

  it('crée le worker en français avec les chemins LOCAUX (CSP)', async () => {
    // ORACLE : commentaire « Chemins LOCAUX … la CSP bloque jsdelivr »,
    // `corePath` = un RÉPERTOIRE, modèle `fra`.
    etat.pages = [page([], 'x')]
    await extractPdf(fauxFichier())
    expect(etat.createWorker).toHaveBeenCalledTimes(1)
    const [lang, , opts] = etat.createWorker.mock.calls[0] as [
      string,
      unknown,
      Record<string, string>,
    ]
    expect(lang).toBe('fra')
    expect(opts.workerPath).toBe('/tesseract/worker.min.js')
    expect(opts.corePath.endsWith('/')).toBe(true)
    expect(opts.langPath).toBe('/tesseract/lang')
    for (const v of Object.values(opts)) expect(v).not.toMatch(/^https?:/)
  })

  it('seuil exact : OCR_CHAR_THRESHOLD × pages caractères → natif', async () => {
    // ORACLE : « trop maigre » = STRICTEMENT sous le seuil par page.
    etat.pages = [
      page([plein(OCR_CHAR_THRESHOLD)]),
      page([plein(OCR_CHAR_THRESHOLD)]),
    ]
    expect((await extractPdf(fauxFichier())).method).toBe('native')
  })

  it('un caractère de moins que le seuil × pages → OCR', async () => {
    // ORACLE : même contrat, côté « trop maigre ».
    etat.pages = [
      page([plein(OCR_CHAR_THRESHOLD)]),
      page([plein(OCR_CHAR_THRESHOLD - 1)], 'ocr'),
    ]
    expect((await extractPdf(fauxFichier())).method).toBe('ocr')
  })

  it('le seuil est PAR PAGE : la même couche texte suffit à 1 page, pas à 3', async () => {
    // ORACLE : « seuil par page » → densité comparée à seuil × nombre de pages.
    const n = OCR_CHAR_THRESHOLD + 2
    etat.pages = [page([plein(n)])]
    expect((await extractPdf(fauxFichier())).method).toBe('native')
    etat.pages = [page([plein(n)]), page([]), page([])]
    expect((await extractPdf(fauxFichier())).method).toBe('ocr')
  })

  it('les blancs ne comptent pas dans la densité', async () => {
    // ORACLE : densité = caractères utiles (`replace(/\s+/g, '')`) — une page
    // d'espaces, de tabulations ou d'insécables est une page vide.
    etat.pages = [
      page(
        [' '.repeat(100), '\t'.repeat(50), ' '.repeat(50), ' '.repeat(50)],
        'lu',
      ),
    ]
    const r = await extractPdf(fauxFichier())
    expect(r.method).toBe('ocr')
    expect(r.text).toBe('lu')
  })

  it('libère le worker Tesseract même si la reconnaissance échoue', async () => {
    // ORACLE : `finally { worker.terminate() }` — sinon un worker WASM fuit.
    etat.pages = [page([], 'x')]
    etat.echecOcr = new Error('OCR en panne')
    await expect(extractPdf(fauxFichier())).rejects.toThrow('OCR en panne')
    expect(etat.terminate).toHaveBeenCalledTimes(1)
    expect(etat.destroy).toHaveBeenCalledTimes(1)
  })

  it('libère le worker Tesseract après succès', async () => {
    // ORACLE : même `finally`.
    etat.pages = [page([], 'x')]
    await extractPdf(fauxFichier())
    expect(etat.terminate).toHaveBeenCalledTimes(1)
  })
})

describe('aperçus (rasterisation UNE fois par page)', () => {
  it('un aperçu JPEG par page, dimensions en points (échelle 1)', async () => {
    // ORACLE : `PagePreview` « dimensions en points » + « rasterisée QU'UNE
    // fois » à PREVIEW_RASTER_SCALE.
    etat.pages = [
      page([plein(100)], undefined, 595, 842),
      page([plein(100)], undefined, 842, 595),
    ]
    const r = await extractPdf(fauxFichier())
    expect(r.previews.map((p) => [p.width, p.height])).toEqual([
      [595, 842],
      [842, 595],
    ])
    expect(etat.canvases).toHaveLength(2)
    for (const c of etat.canvases) {
      expect(c.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85)
    }
    expect(r.previews[0].dataUrl).toContain('p=1')
    expect(r.previews[1].dataUrl).toContain('p=2')
  })

  it('canvas à l’échelle d’aperçu, arrondi au pixel supérieur', async () => {
    // ORACLE : `Math.ceil(viewport × PREVIEW_RASTER_SCALE)` — jamais rogné.
    etat.pages = [page([plein(100)], undefined, 595.3, 841.9)]
    await extractPdf(fauxFichier())
    expect(etat.echelles).toContain(PREVIEW_RASTER_SCALE)
    const [c] = etat.canvases
    expect(c.width).toBeGreaterThanOrEqual(595.3 * PREVIEW_RASTER_SCALE)
    expect(c.width).toBeLessThan(595.3 * PREVIEW_RASTER_SCALE + 1)
    expect(Number.isInteger(c.width)).toBe(true)
    expect(c.height).toBeGreaterThanOrEqual(841.9 * PREVIEW_RASTER_SCALE)
    expect(Number.isInteger(c.height)).toBe(true)
  })

  it('en OCR, le MÊME canvas sert à l’aperçu et à la reconnaissance', async () => {
    // ORACLE : « le même canvas sert à l'aperçu ET, si besoin, à l'OCR ».
    etat.pages = [page([], 'a'), page([], 'b')]
    await extractPdf(fauxFichier())
    expect(etat.canvases).toHaveLength(2)
    expect(etat.recognize.mock.calls.map((c) => c[0])).toEqual(etat.canvases)
  })

  it('une page sans contexte 2D n’a pas d’aperçu, les autres oui', async () => {
    // ORACLE : `renderPageToCanvas` « null si pas de 2D » → page sautée.
    etat.pages = [page([plein(100)]), page([plein(100)])]
    etat.contexteNul.add(1)
    const r = await extractPdf(fauxFichier())
    expect(r.previews).toHaveLength(1)
    expect(r.pageCount).toBe(2)
  })
})

describe('libération du document pdf.js', () => {
  it('détruit la tâche après succès', async () => {
    // ORACLE : `finally { task.destroy() }`.
    etat.pages = [page([plein(100)])]
    await extractPdf(fauxFichier())
    expect(etat.destroy).toHaveBeenCalledTimes(1)
  })

  it('détruit la tâche si la lecture du texte échoue', async () => {
    // ORACLE : même `finally`.
    etat.pages = [page([plein(100)])]
    etat.echecTexte = new Error('flux corrompu')
    await expect(extractPdf(fauxFichier())).rejects.toThrow('flux corrompu')
    expect(etat.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('propriétés', () => {
  const chaine = fc.string({ maxLength: 12 })
  const pages = fc.array(fc.array(chaine, { maxLength: 6 }), {
    minLength: 1,
    maxLength: 5,
  })

  fcTest.prop([pages], { numRuns: 150 })(
    'méthode = règle de densité ; en natif, texte = items joints par espace, pages par retour',
    async (contenu) => {
      // ORACLE : modèle de référence écrit depuis le contrat (et non depuis la
      // sortie) : densité hors blancs < seuil × pages ⇔ OCR.
      etat.pages = contenu.map((strs, i) => page(strs, `ocr-${i + 1}`))
      etat.canvases = []
      const r = await extractPdf(fauxFichier())
      const attenduNatif = contenu
        .map((s) => s.join(' '))
        .join('\n')
        .trim()
      const densite = attenduNatif.replace(/\s+/g, '').length
      const ocr = densite < OCR_CHAR_THRESHOLD * contenu.length
      expect(r.method).toBe(ocr ? 'ocr' : 'native')
      expect(r.pageCount).toBe(contenu.length)
      expect(r.previews).toHaveLength(contenu.length)
      expect(r.text).toBe(
        ocr ? contenu.map((_, i) => `ocr-${i + 1}`).join('\n') : attenduNatif,
      )
    },
  )

  fcTest.prop([pages], { numRuns: 100 })(
    'en natif, aucun caractère non blanc n’est perdu ni inventé',
    async (contenu) => {
      // ORACLE : l'extraction est une concaténation : le multiset des
      // caractères non blancs est conservé.
      etat.pages = contenu.map((strs) =>
        page([...strs, plein(OCR_CHAR_THRESHOLD)]),
      )
      etat.canvases = []
      const r = await extractPdf(fauxFichier())
      expect(r.method).toBe('native')
      const tri = (s: string) => [...s.replace(/\s+/g, '')].sort().join('')
      expect(tri(r.text)).toBe(
        tri(
          contenu.map((s) => s.join('') + plein(OCR_CHAR_THRESHOLD)).join(''),
        ),
      )
    },
  )
})
