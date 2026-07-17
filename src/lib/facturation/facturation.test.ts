import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { detect, normalize } from '#/lib/facturation/detect.ts'
import {
  abstains,
  preselect,
  scoreInvoice,
  seedPool,
  tokenize,
} from '#/lib/facturation/wordpool.ts'
import { matchIssuer } from '#/lib/facturation/issuers.ts'
import { buildStampedPdf } from '#/lib/facturation/stamp.ts'
import { stampBoxSize, stampLines } from '#/lib/facturation/stampLayout.ts'
import { computeGrid, pageAt } from '#/lib/facturation/grid.ts'
import { SEED_RULES, budgetLabel } from '#/lib/facturation/constants.ts'
import type {
  PagePreview,
  StampData,
  SupplierRule,
} from '#/lib/facturation/types.ts'

const A4 = (): PagePreview => ({ dataUrl: '', width: 595, height: 842 })

const STAMP: StampData = {
  codes: ['FMELECoooo'],
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
  it('reconnaît l’électricité → code analytique malgré les accents', () => {
    const d = detect(EDF_TEXT, SEED_RULES)
    expect(d.supplier).toBe('Électricité')
    expect(d.code).toBe('FMELECoooo')
    expect(d.matchedKeyword).toBe('electricite')
    expect(d.codes).toEqual(['FMELECoooo'])
    expect(d.confidence).toBeGreaterThan(0.5)
    expect(budgetLabel(d.code!)).toBe('Electricité')
  })

  it('pré-sélectionne TOUS les codes dont un mot-clé matche', () => {
    const d = detect('Facture booking.com et commission adyen', SEED_RULES)
    expect(d.codes).toContain('HECOMMOTAo') // booking → OTA
    expect(d.codes).toContain('FACOMMENCo') // adyen → encaissement
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
    expect(d.codes).toEqual([])
    expect(d.confidence).toBe(0)
  })

  it('une règle apprise démarre avec une confiance plus haute', () => {
    const learned: SupplierRule[] = [
      {
        id: 'learned:acme',
        supplier: 'ACME Traiteur',
        code: 'RESSTFBooo',
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

describe('wordpool', () => {
  const POOL = {
    perCode: {
      TECH: { ascenseur: 5, reparation: 3, panne: 2 },
      OTA: { booking: 5, sejour: 3, nuitee: 2 },
    },
  }

  it('tokenize retire chiffres, mots courts et mots vides', () => {
    const t = tokenize('Facture 12/07/2026 réparation ASCENSEUR TTC 150')
    expect(t).toContain('reparation')
    expect(t).toContain('ascenseur')
    expect(t).not.toContain('facture') // mot vide
    expect(t.some((x) => /\d/.test(x))).toBe(false) // aucun token avec chiffre
  })

  it('les mots concentrés votent le bon code', () => {
    const s = scoreInvoice('intervention reparation ascenseur en panne', POOL)
    expect(s[0].code).toBe('TECH')
    expect(s[0].words).toContain('ascenseur')
  })

  it('abstention quand aucun mot informatif', () => {
    expect(abstains(scoreInvoice('xyzzy plughx', POOL))).toBe(true)
  })

  it('pré-sélectionne le SEUL meilleur code quand il domine', () => {
    expect(preselect(scoreInvoice('reparation ascenseur panne', POOL))).toEqual(
      ['TECH'],
    )
  })

  it('garde plusieurs codes seulement s’ils sont comparables', () => {
    const pool3 = {
      perCode: {
        A: { alpha: 5, xray: 3 },
        B: { alpha: 5, yoyo: 3 },
        C: { zeta: 5, whis: 3 },
      },
    }
    // « alpha » est partagé par A et B (scores égaux), absent de C.
    expect(preselect(scoreInvoice('alpha', pool3)).sort()).toEqual(['A', 'B'])
  })

  it('la graine amorce le nuage OTA depuis « booking »', () => {
    expect(seedPool().perCode['HECOMMOTAo']?.booking).toBeGreaterThan(0)
  })
})

describe('matchIssuer', () => {
  it('reconnaît un émetteur connu par sous-chaîne', () => {
    const list = [{ name: 'martin', display: 'Entreprise Martin', count: 3 }]
    expect(matchIssuer('facture MARTIN sarl 2026', list)?.display).toBe(
      'Entreprise Martin',
    )
  })

  it('retourne null si aucun émetteur connu', () => {
    const list = [{ name: 'martin', display: 'M', count: 1 }]
    expect(matchIssuer('facture dupont', list)).toBeNull()
  })

  it('préfère l’émetteur le plus confirmé', () => {
    const list = [
      { name: 'martins', display: 'A', count: 1 },
      { name: 'martin', display: 'B', count: 9 },
    ]
    // « martins » contient « martin » → les deux matchent ; le plus confirmé gagne.
    expect(matchIssuer('facture martins', list)?.display).toBe('B')
  })

  it('ignore un nom trop court', () => {
    const list = [{ name: 'sa', display: 'SA', count: 5 }]
    expect(matchIssuer('facture sa', list)).toBeNull()
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

describe('stampLines', () => {
  it('émet une ligne par code d’imputation', () => {
    const lines = stampLines({ ...STAMP, codes: ['FMELECoooo', 'FMGAZooooo'] })
    expect(lines[0].text).toBe('IMPUTATIONS COMPTABLES')
    const codeLines = lines.filter((l) => /^FM/.test(l.text))
    expect(codeLines).toHaveLength(2)
    expect(codeLines[0].text).toContain('Electricité')
    expect(codeLines[1].text).toContain('Gaz')
  })

  it('affiche un placeholder quand aucun code', () => {
    const lines = stampLines({ ...STAMP, codes: [] })
    expect(lines[0].text).toBe('IMPUTATION COMPTABLE')
    expect(lines[1].text).toBe('— à imputer —')
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
