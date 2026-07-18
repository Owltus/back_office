import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { detect, normalize, redetect } from '#/lib/facturation/detect.ts'
import { normalizeIssuer } from '#/lib/facturation/text.ts'
import {
  closestName,
  levenshtein,
  similarity,
} from '#/lib/facturation/similarity.ts'
import {
  abstains,
  maturity,
  preselect,
  scoreInvoice,
  seedPool,
  tokenize,
} from '#/lib/facturation/wordpool.ts'
import { matchIssuer } from '#/lib/facturation/issuers.ts'
import { buildGalaxy } from '#/lib/facturation/galaxy.ts'
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

describe('similarity', () => {
  it('levenshtein compte les éditions', () => {
    expect(levenshtein('booking', 'bookng')).toBe(1)
    expect(levenshtein('abc', 'abc')).toBe(0)
    expect(levenshtein('', 'abc')).toBe(3)
  })

  it('similarity : 1 identique, décroît avec la distance', () => {
    expect(similarity('abc', 'abc')).toBe(1)
    expect(similarity('booking', 'bookng')).toBeGreaterThan(0.8)
    expect(similarity('booking', 'xyzzy')).toBeLessThan(0.5)
  })

  it('closestName suggère un proche, ignore l’identique et le lointain', () => {
    expect(closestName('bookng', ['booking', 'adyen'])).toBe('booking')
    expect(closestName('booking', ['booking', 'adyen'])).toBeNull() // identique
    expect(closestName('zzzzz', ['booking', 'adyen'])).toBeNull() // trop loin
  })
})

describe('normalizeIssuer', () => {
  it('compacte espaces et retire les suffixes juridiques', () => {
    expect(normalizeIssuer('Martin SARL')).toBe('martin')
    expect(normalizeIssuer('Martin SA')).toBe(normalizeIssuer('martin sa'))
    expect(normalizeIssuer('  Booking.com  ')).toBe('booking com')
  })

  it('ne vide jamais un nom réduit à un seul mot-suffixe', () => {
    expect(normalizeIssuer('SA')).toBe('sa') // garde-fou words.length > 1
  })
})

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

  it('un nuage MÛR et FORT est proposé même si une règle tranche ailleurs', () => {
    // Règle : mot-clé « martin » → code A (curé). Mais le corps de la facture ressemble
    // fortement au nuage de HECOMMOTAo (B). Base mûre (3 codes, > 60 tokens) → B proposé.
    const rules: SupplierRule[] = [
      {
        id: 'r:martin',
        supplier: 'Martin',
        code: 'RESSTFBooo',
        keywords: ['martin'],
        learned: false,
      },
    ]
    const pool = {
      perCode: {
        HECOMMOTAo: {
          booking: 20,
          sejour: 15,
          nuitee: 12,
          reservation: 10,
          commission: 8,
        },
        FMELECoooo: { edf: 3, kwh: 2 },
        RESSTFBooo: { autre: 2, chose: 1 },
      },
    }
    const text = 'Facture Martin — booking sejour nuitee reservation commission'
    const d = detect(text, rules, pool)
    expect(d.codes).toContain('HECOMMOTAo') // le nuage fort remonte…
    expect(d.codes[0]).toBe('HECOMMOTAo') // …et passe en tête (ordonné par confiance)
    expect(d.codes).toContain('RESSTFBooo') // la règle reste proposée
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

describe('redetect', () => {
  it('ré-impute depuis le texte quand le pool s’enrichit', () => {
    const text = 'intervention reparation ascenseur en panne'
    const froid = redetect(text, { perCode: {} })
    // Deux codes : l'idf est non nul (pouvoir discriminant), condition d'un score.
    const chaud = redetect(text, {
      perCode: {
        TECH: { ascenseur: 5, reparation: 3, panne: 2 },
        OTA: { booking: 5, sejour: 3, nuitee: 2 },
      },
    })
    expect(froid.codes).toEqual([]) // base vide → aucune imputation par les nuages
    expect(chaud.codes).toContain('TECH') // pool enrichi → imputation trouvée
    expect(chaud.codes).not.toEqual(froid.codes)
  })
})

describe('maturity', () => {
  it('base vide → niveau « vide »', () => {
    const m = maturity({ perCode: {} })
    expect(m.tokens).toBe(0)
    expect(m.level).toBe('vide')
  })

  it('peu de codes/tokens → « faible »', () => {
    const m = maturity({ perCode: { A: { x: 2, y: 1 } } })
    expect(m.codes).toBe(1)
    expect(m.level).toBe('faible')
  })

  it('assez de codes et de volume → « ok »', () => {
    const m = maturity({
      perCode: {
        A: { a: 30, b: 20 },
        B: { c: 15 },
        C: { d: 10 },
      },
    })
    expect(m.codes).toBe(3)
    expect(m.tokens).toBe(75)
    expect(m.level).toBe('ok')
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

  it('confiance BASSE quand peu de mots votent (pas de sur-confiance)', () => {
    const pool = {
      perCode: {
        A: { castalie: 5, autre: 3 },
        B: { zzz: 5, www: 3 },
      },
    }
    const s = scoreInvoice('castalie', pool)
    expect(s[0].code).toBe('A')
    // Un seul mot vote : même si le cosinus est élevé, la proba reste modeste.
    expect(s[0].proba).toBeLessThan(0.4)
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

describe('buildGalaxy', () => {
  it('construit le graphe émetteur → code → mots', () => {
    const pool = { perCode: { FMELECoooo: { edf: 5, kwh: 3, releve: 2 } } }
    const issuers = [{ name: 'edf', display: 'EDF', count: 4 }]
    const g = buildGalaxy(pool, issuers, 5)
    expect(g.nodes.filter((n) => n.type === 'code')).toHaveLength(1)
    expect(g.nodes.filter((n) => n.type === 'issuer')).toHaveLength(1) // edf
    expect(g.nodes.filter((n) => n.type === 'word')).toHaveLength(2) // kwh, releve
    expect(g.links).toContainEqual({
      source: 'issuer:edf',
      target: 'code:FMELECoooo',
      weight: 5,
    })
    const code = g.nodes.find((n) => n.type === 'code')!
    expect(code.category).toBe('Énergie & fluides')
  })

  it('un émetteur partagé entre plusieurs codes = un seul nœud', () => {
    const pool = { perCode: { A: { edf: 5 }, B: { edf: 4 } } }
    const g = buildGalaxy(pool, [{ name: 'edf', display: 'EDF', count: 9 }], 5)
    expect(g.nodes.filter((n) => n.type === 'issuer')).toHaveLength(1)
    expect(g.links.filter((l) => l.source === 'issuer:edf')).toHaveLength(2)
  })

  it('ignore un code sans mot', () => {
    expect(buildGalaxy({ perCode: { FMELECoooo: {} } }, []).nodes).toHaveLength(
      0,
    )
  })

  it('minCount masque le bruit à faible count (hygiène)', () => {
    const pool = { perCode: { FMELECoooo: { edf: 5, kwh: 3, typo: 1 } } }
    const g = buildGalaxy(pool, [], 5) // minCount défaut = 2
    const words = g.nodes.filter((n) => n.type === 'word').map((n) => n.label)
    expect(words).toContain('kwh')
    expect(words).not.toContain('typo') // count 1 → écarté
    // minCount = 1 le laisse passer.
    const all = buildGalaxy(pool, [], 5, 1)
    expect(all.nodes.some((n) => n.label === 'typo')).toBe(true)
  })

  it('attribue une position logique finie et déterministe à chaque nœud', () => {
    const pool = { perCode: { FMELECoooo: { edf: 5, kwh: 3 } } }
    const issuers = [{ name: 'edf', display: 'EDF', count: 4 }]
    const a = buildGalaxy(pool, issuers, 5)
    const b = buildGalaxy(pool, issuers, 5)
    for (const n of a.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
    // Le layout a écarté les nœuds (pas tous à l'origine)…
    expect(a.nodes.some((n) => n.x !== 0 || n.y !== 0)).toBe(true)
    // …et reste reproductible d'un appel à l'autre.
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(
      b.nodes.map((n) => [n.x, n.y]),
    )
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
