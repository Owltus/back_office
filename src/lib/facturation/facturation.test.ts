import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import {
  canLearn,
  detect,
  normalize,
  redetect,
} from '#/lib/facturation/detect.ts'
import { issuerKey, normalizeIssuer } from '#/lib/facturation/text.ts'
import { hashText, hashBytes } from '#/lib/facturation/hash.ts'
import {
  closestName,
  levenshtein,
  similarity,
} from '#/lib/facturation/similarity.ts'
import {
  abstains,
  confusableCodes,
  countTokens,
  maturity,
  partitionWords,
  preselect,
  scoreInvoice,
  seedPool,
  tokenize,
  visibleWords,
} from '#/lib/facturation/wordpool.ts'
import {
  INVOICE_STOPWORDS,
  documentStoplist,
} from '#/lib/facturation/stopwords.ts'
import { matchIssuer } from '#/lib/facturation/issuers.ts'
import {
  bumpIssuerCodes,
  issuerMaturity,
  issuerOutliers,
  issuerPrior,
  mergeIssuerCodes,
  removeIssuerCode,
} from '#/lib/facturation/issuerCodes.ts'
import { reviewQueue } from '#/lib/facturation/anomalies.ts'
import {
  deniedCodes,
  mergeDenylist,
  removeDeny,
} from '#/lib/facturation/issuerDenylist.ts'
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

describe('issuerKey (clé émetteur canonique, anti-fragmentation)', () => {
  it('unifie les variantes d’un même émetteur sous une seule clé', () => {
    const k = issuerKey('Martin')
    expect(issuerKey('Martin SARL')).toBe(k)
    expect(issuerKey('MARTIN,')).toBe(k)
    expect(issuerKey('Martin  ')).toBe(k) // double espace
    expect(k).toBe('martin')
  })

  it('canLearn juge la LONGUEUR de la clé canonique (suffixe retiré)', () => {
    expect(canLearn('Martin')).toBe(true)
    // « EDF SAS » → clé « edf » (3 car.) → NON mémorisable, cohérent avec « EDF ».
    expect(canLearn('EDF')).toBe(false)
    expect(canLearn('EDF SAS')).toBe(false)
    expect(canLearn('EDF SAS')).toBe(canLearn('EDF'))
  })
})

describe('hash (empreinte de document)', () => {
  it('hashText est déterministe, normalisé (casse/accents) et long de 64 hex', async () => {
    const h = await hashText('Facture ACME')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashText('facture acme')).toBe(h) // normalize absorbe la casse
    expect(await hashText('Facture ACMÉ')).toBe(h) // et les accents
  })

  it('hashText distingue deux textes différents', async () => {
    expect(await hashText('alpha')).not.toBe(await hashText('beta'))
  })

  it('hashBytes est déterministe sur les mêmes octets', async () => {
    const a = new TextEncoder().encode('xyz').buffer
    const b = new TextEncoder().encode('xyz').buffer
    expect(await hashBytes(a)).toBe(await hashBytes(b))
    expect(await hashBytes(new TextEncoder().encode('zzz').buffer)).not.toBe(
      await hashBytes(a),
    )
  })
})

describe('detect', () => {
  it('électricité : plus de règle mot-clé générique → détection par le pull APPRIS', () => {
    // Plus de règle « electricite » (mot générique = libellé) : sans éducation, on
    // s'abstient plutôt que d'imputer par le nom de la ligne.
    const cold = detect(EDF_TEXT, SEED_RULES)
    expect(cold.code).toBeNull()
    // Avec un pull APPRIS (mots d'une vraie facture d'électricité), le contexte tranche.
    const pool = {
      perCode: {
        FMELECoooo: { electricite: 5, consommation: 4, releve: 3, edf: 3 },
        HECOMMOTAo: { booking: 5, sejour: 3, nuitee: 2 },
      },
    }
    const warm = detect(EDF_TEXT, SEED_RULES, pool)
    expect(warm.codes).toContain('FMELECoooo')
    expect(budgetLabel('FMELECoooo')).toBe('Electricité')
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

  it('mots génériques = libellé retirés → imputation laissée à l’éducation', () => {
    // alcool / chauffage urbain / blanchissage / gardiennage ne sont plus des règles :
    // sans pull appris, on s'abstient au lieu d'imputer par le nom de la ligne.
    expect(
      detect('Facture achat alcool — vins et spiritueux', SEED_RULES).code,
    ).toBeNull()
    expect(detect('Facture chauffage urbain', SEED_RULES).code).toBeNull()
    expect(
      detect('Prestation gardiennage nocturne', SEED_RULES).code,
    ).toBeNull()
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

describe('detect + filtre émetteur', () => {
  const POOL = {
    perCode: {
      TECH: { ascenseur: 5, reparation: 3, panne: 2 },
      OTA: { booking: 5, sejour: 3, nuitee: 2 },
    },
  }

  it('sans émetteur : mots muets → abstention (comportement inchangé)', () => {
    const d = detect('xyzzy plughx sans rapport', undefined, POOL)
    expect(d.codes).toEqual([])
    expect(d.abstained).toBe(true)
  })

  it('émetteur concentré + mots muets : propose son code, marqué « à vérifier »', () => {
    const d = detect('xyzzy plughx sans rapport', undefined, POOL, {
      prior: { TECH: 1 },
      concentrated: true,
    })
    expect(d.codes).toContain('TECH')
    expect(d.abstained).toBe(false)
    expect(d.fromIssuerOnly).toBe(true) // suggestion émetteur seul → à confirmer
  })

  it('les mots priment : un code voté par les mots n’est jamais « à vérifier »', () => {
    const d = detect('reparation ascenseur panne', undefined, POOL, {
      prior: { TECH: 1 },
      concentrated: true,
    })
    expect(d.codes).toContain('TECH')
    expect(d.fromIssuerOnly).toBeFalsy() // les mots soutiennent → pas un simple « à vérifier »
  })

  it('émetteur re-pondère le départage entre codes soutenus par les mots', () => {
    const pool2 = {
      perCode: {
        A: { alpha: 5, xray: 3 },
        B: { alpha: 5, yoyo: 3 },
        C: { zeta: 5, whis: 3 },
      },
    }
    // « alpha » soutient A et B à égalité ; le prior émetteur départage vers B.
    const d = detect('alpha', undefined, pool2, {
      prior: { B: 1 },
      concentrated: false,
    })
    expect(d.codes[0]).toBe('B')
  })

  it('denylist : un code interdit disparaît même si les mots le soutiennent', () => {
    // « ascenseur/reparation » vote TECH, mais l'émetteur a TECH banni → OTA sinon rien.
    const d = detect('reparation ascenseur panne', undefined, POOL, {
      prior: {},
      concentrated: false,
      deny: new Set(['TECH']),
    })
    expect(d.codes).not.toContain('TECH')
  })

  it('denylist : ne bloque pas un émetteur immature sur les autres codes', () => {
    // Émetteur non mûr (prior vide, non concentré) mais avec une interdiction : les mots
    // continuent de piloter, seul le code banni est retiré.
    const d = detect('booking sejour nuitee', [], POOL, {
      prior: {},
      concentrated: false,
      deny: new Set(['TECH']),
    })
    expect(d.codes).toContain('OTA')
    expect(d.codes).not.toContain('TECH')
  })

  it('denylist : retire aussi un code issu de la couche 1 (règle déterministe)', () => {
    const rules = [
      {
        id: 'r-widget',
        supplier: 'Widget SA',
        code: 'BANNI',
        keywords: ['widget'],
      },
    ]
    const allowed = detect('facture widget', rules)
    expect(allowed.codes).toContain('BANNI') // sans denylist, la règle vote
    const denied = detect('facture widget', rules, undefined, {
      prior: {},
      concentrated: false,
      deny: new Set(['BANNI']),
    })
    expect(denied.codes).not.toContain('BANNI') // la règle bannie ne remonte plus
  })
})

describe('denylist (modèle pur)', () => {
  it('mergeDenylist fait l’union et removeDeny retire un seul code', () => {
    const base = mergeDenylist(
      { perIssuer: {} },
      { perIssuer: { martin: new Set(['A']) } },
    )
    const twoCodes = mergeDenylist(base, {
      perIssuer: { martin: new Set(['B']) },
    })
    expect([...deniedCodes(twoCodes, 'martin')].sort()).toEqual(['A', 'B'])

    const afterUnban = removeDeny(twoCodes, 'martin', 'A')
    expect(deniedCodes(afterUnban, 'martin').has('A')).toBe(false)
    expect(deniedCodes(afterUnban, 'martin').has('B')).toBe(true)
  })

  it('removeDeny supprime l’entrée émetteur une fois vidée de tous ses codes', () => {
    const one = mergeDenylist(
      { perIssuer: {} },
      { perIssuer: { dupont: new Set(['X']) } },
    )
    const empty = removeDeny(one, 'dupont', 'X')
    expect(empty.perIssuer.dupont).toBeUndefined() // pas de coquille vide
    expect(deniedCodes(empty, 'dupont').size).toBe(0)
  })

  it('removeDeny est immuable (n’altère pas l’entrée d’origine)', () => {
    const src = mergeDenylist(
      { perIssuer: {} },
      { perIssuer: { martin: new Set(['A', 'B']) } },
    )
    removeDeny(src, 'martin', 'A')
    expect(deniedCodes(src, 'martin').has('A')).toBe(true) // source intacte
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

  it('couche 1 : filtre le générique de facture (paiement/légal/logistique)', () => {
    const t = tokenize(
      'Règlement par chèque, bon de livraison, échéance 30 jours, mentions légales',
    )
    for (const w of [
      'reglement',
      'cheque',
      'livraison',
      'echeance',
      'mentions',
    ])
      expect(t).not.toContain(w)
  })

  it('couche 1 : conserve les mots de NATURE produit', () => {
    const t = tokenize(
      'Livraison de gaz et alcool, consommation electricite, réparation',
    )
    for (const w of [
      'gaz',
      'alcool',
      'consommation',
      'electricite',
      'reparation',
    ])
      expect(t).toContain(w)
  })

  it('couche 1 : la liste est pré-normalisée (sans accents) et n’apprend pas le générique', () => {
    for (const w of INVOICE_STOPWORDS) expect(normalize(w)).toBe(w)
    expect(countTokens('reglement livraison gaz')).toEqual({ gaz: 1 })
  })

  it('couche 2 : documentStoplist retient les parasites TRANSVERSES, garde le cold-start', () => {
    const doc = (tokens: string[], codes: string[]) => ({
      hash: '',
      issuerKey: null,
      codes,
      deltas: Object.fromEntries(tokens.map((t) => [t, 1])),
      method: 'native' as const,
      learnedAt: '',
    })
    // Sous le seuil minDocs → inerte, quel que soit le contenu.
    expect(documentStoplist([doc(['legallais'], ['A'])], 0.5, 8).size).toBe(0)
    // 10 docs : « legallais » sur 9/10 ET réparti sur 3 imputations (A,B,C) → parasite ;
    // « scie » sur 1/10, une seule imputation → conservé.
    const entries = Array.from({ length: 10 }, (_, i) =>
      i < 9
        ? doc(['legallais', `mot${i}`], [['A', 'B', 'C'][i % 3]])
        : doc(['scie'], ['A']),
    )
    const stop = documentStoplist(entries, 0.5, 8)
    expect(stop.has('legallais')).toBe(true)
    expect(stop.has('scie')).toBe(false)
  })

  it('couche 2 : transversalité — un mot propre à UNE imputation dominante est protégé', () => {
    const doc = (tokens: string[], codes: string[]) => ({
      hash: '',
      issuerKey: null,
      codes,
      deltas: Object.fromEntries(tokens.map((t) => [t, 1])),
      method: 'native' as const,
      learnedAt: '',
    })
    // « foret » sur 8/10 docs (fréquent) MAIS tous sur l'imputation A → mot-signal, PAS écarté.
    const entries = Array.from({ length: 10 }, (_, i) =>
      i < 8 ? doc(['foret', `x${i}`], ['A']) : doc(['autre'], ['B']),
    )
    expect(documentStoplist(entries, 0.5, 8).has('foret')).toBe(false)
  })

  it('les mots concentrés votent le bon code', () => {
    const s = scoreInvoice('intervention reparation ascenseur en panne', POOL)
    expect(s[0].code).toBe('TECH')
    expect(s[0].words).toContain('ascenseur')
  })

  it('max_df : un mot transverse (≥60% des codes, base ≥8) est ignoré au scoring', () => {
    // 8 codes : « commun » présent dans 6/8 (75% ≥ 60%) → idf 0 → n'aide pas à trancher ;
    // « special » présent dans 1 code → discrimine.
    const cell = (extra: Record<string, number>) => ({ commun: 3, ...extra })
    const big = {
      perCode: {
        C1: cell({ special: 5 }),
        C2: cell({}),
        C3: cell({}),
        C4: cell({}),
        C5: cell({}),
        C6: cell({}),
        C7: { autre: 4 },
        C8: { encore: 4 },
      },
    }
    // Un doc qui ne contient QUE le mot transverse → aucun signal → abstention.
    expect(abstains(scoreInvoice('commun', big))).toBe(true)
    // Le mot rare, lui, vote pour son code.
    expect(scoreInvoice('special', big)[0]?.code).toBe('C1')
  })

  it('stoplist adaptative : un token dénié ne vote plus au scoring', () => {
    const pool = { perCode: { A: { alpha: 5, xray: 3 }, B: { yoyo: 5 } } }
    // Sans stoplist : « alpha » vote pour A.
    expect(scoreInvoice('alpha', pool)[0]?.code).toBe('A')
    // Avec « alpha » en stoplist : plus aucun vote → abstention.
    expect(scoreInvoice('alpha', pool, new Set(['alpha']))).toHaveLength(0)
  })

  it('visibleWords : masque stopwords statiques + stoplist, trie par fréquence', () => {
    const cell = { legallais: 9, scie: 2, lame: 5, livraison: 8 }
    // « livraison » est un stopword statique → masqué même sans stoplist adaptative.
    expect(visibleWords(cell)).toEqual([
      ['legallais', 9],
      ['lame', 5],
      ['scie', 2],
    ])
    // + stoplist adaptative « legallais ».
    expect(visibleWords(cell, new Set(['legallais']))).toEqual([
      ['lame', 5],
      ['scie', 2],
    ])
  })

  it('partitionWords : sépare mots retenus et parasites (stopwords + stoplist)', () => {
    const cell = { legallais: 9, scie: 2, lame: 5, livraison: 8 }
    const { kept, hidden } = partitionWords(cell, new Set(['legallais']))
    expect(kept).toEqual([
      ['lame', 5],
      ['scie', 2],
    ])
    // « livraison » (stopword statique) + « legallais » (stoplist) → dans hidden, triés.
    expect(hidden).toEqual([
      ['legallais', 9],
      ['livraison', 8],
    ])
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

describe('issuerCodes (modèle émetteur→codes)', () => {
  const M = {
    perIssuer: {
      martin: { HECOMMOTAo: 5, FMELECoooo: 1 }, // concentré (5/6 ≥ 0.8)
      dupont: { A: 2, B: 2 }, // multi-codes, immature (total 4 mais 50/50)
      neuf: { A: 1 }, // immature (total 1)
    },
  }

  it('issuerPrior : distribution sommant à 1, {} si inconnu', () => {
    const p = issuerPrior(M, 'martin')
    expect(p.HECOMMOTAo).toBeCloseTo(5 / 6)
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(issuerPrior(M, 'inconnu')).toEqual({})
  })

  it('issuerMaturity : fort au-delà du seuil, concentré si un code domine', () => {
    expect(issuerMaturity(M, 'neuf').strong).toBe(false) // total 1 < 5 (seuil)
    expect(issuerMaturity(M, 'martin').strong).toBe(true) // total 6 ≥ 5
    expect(issuerMaturity(M, 'martin').concentrated).toBe(true) // 5/6 ≥ 0.8
    expect(issuerMaturity(M, 'dupont').concentrated).toBe(false) // 2/4 < 0.8
  })

  it('bumpIssuerCodes incrémente sans muter la source', () => {
    const next = bumpIssuerCodes(M, 'martin', ['HECOMMOTAo', 'ZZ'])
    expect(next.perIssuer.martin.HECOMMOTAo).toBe(6)
    expect(next.perIssuer.martin.ZZ).toBe(1)
    expect(M.perIssuer.martin.HECOMMOTAo).toBe(5) // source intacte
  })

  it('mergeIssuerCodes additionne les compteurs', () => {
    const merged = mergeIssuerCodes(M, {
      perIssuer: { martin: { HECOMMOTAo: 2 } },
    })
    expect(merged.perIssuer.martin.HECOMMOTAo).toBe(7)
    expect(merged.perIssuer.dupont.A).toBe(2)
  })

  it('removeIssuerCode retire un couple, purge l’émetteur vidé, sans muter', () => {
    const m = {
      perIssuer: { martin: { A: 3, B: 2 }, dupont: { A: 1 } },
    }
    const afterA = removeIssuerCode(m, 'martin', 'A')
    expect(afterA.perIssuer.martin).toEqual({ B: 2 }) // A retiré, B conservé
    expect(m.perIssuer.martin.A).toBe(3) // source intacte

    const gone = removeIssuerCode(afterA, 'dupont', 'A')
    expect(gone.perIssuer.dupont).toBeUndefined() // émetteur vidé → supprimé
  })
})

describe('anomalies', () => {
  it('issuerOutliers : isole une imputation marginale chez un émetteur mûr', () => {
    const model = {
      perIssuer: {
        ramery: { FMPONCTUEL: 12, HECOMMOTAo: 1 }, // Z marginal (1/13) → suspect
        petit: { A: 2 }, // total 2 < 5 → pas mûr → ignoré
      },
    }
    const out = issuerOutliers(model)
    expect(out).toHaveLength(1)
    expect(out[0].code).toBe('HECOMMOTAo')
    expect(out[0].dominant).toBe('FMPONCTUEL')
  })

  it('confusableCodes : remonte deux nuages qui se ressemblent (pas les autres)', () => {
    // 3 codes (N≥3 pour que l'idf des tokens partagés soit > 0). A et B ont le MÊME
    // vocabulaire → cosinus élevé ; C est disjoint.
    const pool = {
      perCode: {
        A: { alpha: 5, beta: 5, gamma: 5 },
        B: { alpha: 5, beta: 5, gamma: 5 },
        C: { zeta: 5, whis: 5 },
      },
    }
    const pairs = confusableCodes(pool, 0.6)
    expect(pairs).toHaveLength(1)
    expect([pairs[0].a, pairs[0].b].sort()).toEqual(['A', 'B'])
    expect(pairs[0].cosine).toBeGreaterThan(0.9)
  })

  it('reviewQueue agrège outliers + confusables', () => {
    const pool = {
      perCode: { A: { x: 3, y: 3 }, B: { x: 3, y: 3 }, C: { z: 3 } },
    }
    const model = { perIssuer: { acme: { A: 10, B: 1 } } }
    const q = reviewQueue(pool, model)
    expect(q.some((a) => a.kind === 'issuer-outlier')).toBe(true)
    expect(q.some((a) => a.kind === 'confusable-codes')).toBe(true)
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
  it('construit le graphe émetteur → code → mots (émetteur depuis issuerCodes)', () => {
    const pool = { perCode: { FMELECoooo: { edf: 5, kwh: 3, releve: 2 } } }
    const issuers = [{ name: 'edf', display: 'EDF', count: 4 }]
    const issuerCodes = { perIssuer: { edf: { FMELECoooo: 5 } } }
    const g = buildGalaxy(pool, issuers, 5, 2, issuerCodes)
    expect(g.nodes.filter((n) => n.type === 'code')).toHaveLength(1)
    expect(g.nodes.filter((n) => n.type === 'issuer')).toHaveLength(1) // edf (issuerCodes)
    // Tous les tokens du pool sont des MOTS désormais (edf, kwh, releve).
    expect(g.nodes.filter((n) => n.type === 'word')).toHaveLength(3)
    expect(g.links).toContainEqual({
      source: 'issuer:edf',
      target: 'code:FMELECoooo',
      weight: 5,
    })
    expect(g.nodes.find((n) => n.type === 'issuer')?.label).toBe('EDF')
    const code = g.nodes.find((n) => n.type === 'code')!
    expect(code.category).toBe('Énergie & fluides')
  })

  it('un émetteur partagé entre plusieurs codes = un seul nœud', () => {
    const pool = { perCode: { A: { edf: 5 }, B: { edf: 4 } } }
    const issuers = [{ name: 'edf', display: 'EDF', count: 9 }]
    const g = buildGalaxy(pool, issuers, 5, 2, {
      perIssuer: { edf: { A: 5, B: 4 } },
    })
    expect(g.nodes.filter((n) => n.type === 'issuer')).toHaveLength(1)
    expect(g.links.filter((l) => l.source === 'issuer:edf')).toHaveLength(2)
  })

  it('un émetteur dont le code n’est pas présent n’ajoute pas de nœud', () => {
    const pool = { perCode: { A: { edf: 5 } } }
    const g = buildGalaxy(pool, [], 5, 2, {
      perIssuer: { edf: { Z: 3 } }, // code Z absent du pool → aucun lien/nœud émetteur
    })
    expect(g.nodes.filter((n) => n.type === 'issuer')).toHaveLength(0)
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
  it('émet une ligne par code d’imputation (code seul, sans en-tête ni libellé)', () => {
    const lines = stampLines({ ...STAMP, codes: ['FMELECoooo', 'FMGAZooooo'] })
    const codeLines = lines.filter((l) => /^FM/.test(l.text))
    expect(codeLines.map((l) => l.text)).toEqual(['FMELECoooo', 'FMGAZooooo'])
    // Plus d'en-tête « IMPUTATION(S) COMPTABLE(S) ».
    expect(lines.some((l) => /IMPUTATION/.test(l.text))).toBe(false)
  })

  it('affiche un placeholder quand aucun code', () => {
    const lines = stampLines({ ...STAMP, codes: [] })
    expect(lines[0].text).toBe('— à imputer —')
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
