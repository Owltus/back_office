import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { detect, normalize } from '#/lib/facturation/detect.ts'
import { buildStampedPdf } from '#/lib/facturation/stamp.ts'
import { stampBoxSize } from '#/lib/facturation/stampLayout.ts'
import { computeGrid, pageAt } from '#/lib/facturation/grid.ts'
import { SEED_RULES, budgetLabel } from '#/lib/facturation/constants.ts'
import type {
  PagePreview,
  StampData,
  SupplierRule,
} from '#/lib/facturation/types.ts'

const A4 = (): PagePreview => ({ dataUrl: '', width: 595, height: 842 })

const STAMP: StampData = {
  code: '606110',
  comment: 'Contrôlé — juin 2026',
  invoiceDate: '2026-07-12',
  processedDate: '2026-07-15',
  scale: 1,
}

/*
 * Vérifie la brique métier du prototype Facturation, hors navigateur :
 *  - détection déterministe fournisseur → code (robuste aux accents),
 *  - extraction best-effort des indices (date, montant, n° de facture),
 *  - bump de confiance d'une règle apprise,
 *  - construction d'un PDF tamponné valide (pdf-lib tourne en Node).
 * L'extraction PDF/OCR (pdf.js + Tesseract) est browser-only et n'est pas couverte ici.
 */

const EDF_TEXT = [
  'EDF Entreprises',
  'Facture d’électricité',
  'Facture n° FR-2026-004512',
  'Date : 12/07/2026',
  'Consommation électricité - Juin 2026',
  'Total TTC 1 488,60 €',
].join('\n')

describe('detect', () => {
  it('reconnaît EDF → 606110 malgré les accents', () => {
    const d = detect(EDF_TEXT, SEED_RULES)
    expect(d.supplier).toBe('EDF')
    expect(d.code).toBe('606110')
    expect(d.matchedKeyword).toBe('edf')
    expect(d.confidence).toBeGreaterThan(0.6)
    expect(budgetLabel(d.code!)).toBe('Électricité')
  })

  it('extrait les indices date / montant / numéro', () => {
    const d = detect(EDF_TEXT, SEED_RULES)
    expect(d.hints.date).toBe('2026-07-12')
    expect(d.hints.amount).toBe('1 488,60')
    expect(d.hints.invoiceNumber).toBe('FR-2026-004512')
  })

  it('retourne un résultat vide quand rien ne matche', () => {
    const d = detect('Boulangerie du coin — baguette', SEED_RULES)
    expect(d.supplier).toBeNull()
    expect(d.code).toBeNull()
    expect(d.confidence).toBe(0)
  })

  it('une règle apprise démarre avec une confiance plus haute', () => {
    const learned: SupplierRule[] = [
      {
        id: 'learned:acme',
        supplier: 'ACME Traiteur',
        code: '602600',
        keywords: ['acme'],
        learned: true,
      },
    ]
    const d = detect('Facture ACME Traiteur', learned)
    expect(d.supplier).toBe('ACME Traiteur')
    expect(d.learned).toBe(true)
    expect(d.confidence).toBeGreaterThanOrEqual(0.75)
  })
})

describe('normalize', () => {
  it('minuscule et retire les accents', () => {
    expect(normalize('Électricité GÉNÉRALE')).toBe('electricite generale')
  })
})

describe('buildStampedPdf', () => {
  it('produit un PDF valide, plus lourd, sans perdre de page', async () => {
    const src = await PDFDocument.create()
    src.addPage([595, 842])
    const font = await src.embedFont(StandardFonts.Helvetica)
    src
      .getPages()[0]
      .drawText('Facture test', { x: 50, y: 800, size: 12, font })
    const srcBytes = await src.save()

    const stamped = await buildStampedPdf(srcBytes, STAMP)

    expect(stamped.byteLength).toBeGreaterThan(srcBytes.byteLength)
    const reloaded = await PDFDocument.load(stamped)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('accepte une échelle de tampon et reste valide', async () => {
    const src = await PDFDocument.create()
    src.addPage([595, 842])
    const srcBytes = await src.save()

    const stamped = await buildStampedPdf(srcBytes, { ...STAMP, scale: 2 })
    const reloaded = await PDFDocument.load(stamped)
    expect(reloaded.getPageCount()).toBe(1)
  })
})

describe('stampBoxSize', () => {
  it('met la boîte à l’échelle proportionnellement', () => {
    const base = stampBoxSize(STAMP)
    const twice = stampBoxSize({ ...STAMP, scale: 2 })
    expect(twice.width).toBeCloseTo(base.width * 2)
    expect(twice.height).toBeCloseTo(base.height * 2)
  })
})

describe('computeGrid', () => {
  it('page seule : une colonne, tenue en hauteur, centrée en (0,0)', () => {
    const g = computeGrid([A4()], 1000, 700, 1.5)
    expect(g.cols).toBe(1)
    expect(g.boxes).toHaveLength(1)
    expect(g.boxes[0].left).toBe(0)
    expect(g.boxes[0].top).toBe(0)
    // 676/842 borne l'échelle (plus contraignant que 976/595).
    expect(g.scale).toBeCloseTo(676 / 842)
  })

  it('plusieurs pages sur un large écran : deux colonnes côte à côte', () => {
    const g = computeGrid([A4(), A4()], 1400, 800, 1.5)
    expect(g.cols).toBe(2)
    expect(g.boxes[1].left).toBeGreaterThan(g.boxes[0].left)
    expect(g.boxes[1].top).toBe(g.boxes[0].top) // même rangée
  })

  it('taille inconnue → échelle 0 (rien à rendre)', () => {
    expect(computeGrid([A4()], 0, 0, 1.5).scale).toBe(0)
  })
})

describe('pageAt', () => {
  it('retourne l’index de la cellule sous le point', () => {
    const g = computeGrid([A4(), A4()], 1400, 800, 1.5)
    expect(pageAt(g, 10, 10)).toBe(0)
    expect(pageAt(g, g.boxes[1].left + 10, 10)).toBe(1)
    // hors grille → borné à une page existante.
    expect(pageAt(g, 99999, 99999)).toBe(1)
  })
})
