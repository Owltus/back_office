import { beforeAll, describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { invoiceNotices } from '#/lib/facturation/notices.ts'
import { setBudgetLines } from '#/lib/facturation/budgetRegistry.ts'
import type { BudgetLine, Detection, InvoiceRecord } from '#/lib/facturation/types.ts'

/*
 * `invoiceNotices` (src/lib/facturation/notices.ts) n'avait AUCUN test. Couvre chaque branche
 * (dans l'ordre de priorité du code : processing → error → learned → no-code →
 * compte-manquant → duplicate → famille-improbable → will-learn/no-issuer) et l'absence de
 * doublon d'id.
 */

// Référentiel minimal : un code MONO-compte (rien à choisir) et un code MULTI-comptes (choix
// requis), avec des catégories distinctes pour exercer le guidage par famille.
const BUDGET_FIXTURE: BudgetLine[] = [
  {
    code: 'MONO01',
    compte: '60700000',
    label: 'Fournitures',
    category: 'Exploitation',
    tags: ['Administratif'],
  },
  {
    code: 'MULTI01',
    compte: '61100000',
    label: 'Entretien',
    category: 'Restauration',
    tags: ['Restauration'],
  },
  {
    code: 'MULTI01',
    compte: '61200000',
    label: 'Entretien',
    category: 'Restauration',
    tags: ['Restauration'],
  },
]

beforeAll(() => {
  setBudgetLines(BUDGET_FIXTURE)
})

/** Facture minimale « prête », modifiable par override — les champs non pertinents pour
 *  `invoiceNotices` sont remplis avec des valeurs neutres mais VALIDES (types stricts). */
function baseRecord(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 'inv-1',
    file: new File(['%PDF-1.4'], 'facture.pdf', { type: 'application/pdf' }),
    fileName: 'facture.pdf',
    status: 'ready',
    method: 'native',
    pageCount: 1,
    text: '',
    detection: null,
    previews: [],
    position: null,
    stampScale: 1,
    codes: [],
    comptes: {},
    supplierName: 'Fournisseur Exemple SARL',
    learned: false,
    comment: '',
    invoiceDate: '',
    processedDate: '',
    error: null,
    ...overrides,
  }
}

describe('invoiceNotices — chaque branche', () => {
  it('facture en lecture → notice « processing » (info)', () => {
    const notices = invoiceNotices(baseRecord({ status: 'processing' }))
    expect(notices).toEqual([
      { id: 'processing', tone: 'info', text: 'Lecture de la facture en cours.' },
    ])
  })

  it('erreur de lecture avec message → reprend le message', () => {
    const notices = invoiceNotices(
      baseRecord({ status: 'error', error: 'PDF corrompu' }),
    )
    expect(notices).toEqual([{ id: 'error', tone: 'error', text: 'PDF corrompu' }])
  })

  it('erreur de lecture sans message → texte générique de repli', () => {
    const notices = invoiceNotices(baseRecord({ status: 'error', error: null }))
    expect(notices).toEqual([
      { id: 'error', tone: 'error', text: 'La lecture de la facture a échoué.' },
    ])
  })

  it('facture déjà tamponnée+apprise (learned) → prioritaire sur tout le reste', () => {
    const notices = invoiceNotices(
      baseRecord({
        learned: true,
        codes: [], // même sans code retenu, `learned` prime
        duplicate: true,
      }),
    )
    expect(notices).toEqual([
      { id: 'learned', tone: 'ok', text: 'Facture tamponnée et téléchargée.' },
    ])
  })

  it('aucun code retenu → invite à choisir une imputation', () => {
    const notices = invoiceNotices(baseRecord({ codes: [] }))
    expect(notices).toEqual([
      {
        id: 'no-code',
        tone: 'warn',
        text: 'Choisissez au moins une imputation pour pouvoir tamponner.',
      },
    ])
  })

  it('un code multi-comptes sans compte choisi → message au singulier', () => {
    const notices = invoiceNotices(
      baseRecord({ codes: ['MULTI01'], comptes: {} }),
    )
    expect(notices).toEqual([
      {
        id: 'compte-manquant',
        tone: 'warn',
        text: 'Choisissez le compte de MULTI01 pour pouvoir tamponner.',
      },
    ])
  })

  it('un code sans compte au référentiel (« MULTI01B », inexistant) n’est jamais « manquant »', () => {
    // comptesForCode('MULTI01B') → [] (référentiel muet) → missingComptes exige
    // comptesFor(code).length > 1, donc ce code inconnu n'est jamais compté comme « à choisir »
    // et seul MULTI01 fait basculer la notice — le message reste au SINGULIER.
    const notices = invoiceNotices(
      baseRecord({ codes: ['MULTI01', 'MULTI01B'], comptes: {} }),
    )
    expect(notices).toEqual([
      {
        id: 'compte-manquant',
        tone: 'warn',
        text: 'Choisissez le compte de MULTI01 pour pouvoir tamponner.',
      },
    ])
  })

  it('deux codes multi-comptes non résolus → message au pluriel (compte)', () => {
    const BUDGET_WITH_SECOND_MULTI: BudgetLine[] = [
      ...BUDGET_FIXTURE,
      {
        code: 'MULTI02',
        compte: '61300000',
        label: 'Divers',
        category: 'Exploitation',
        tags: ['Administratif'],
      },
      {
        code: 'MULTI02',
        compte: '61400000',
        label: 'Divers',
        category: 'Exploitation',
        tags: ['Administratif'],
      },
    ]
    setBudgetLines(BUDGET_WITH_SECOND_MULTI)
    try {
      const notices = invoiceNotices(
        baseRecord({ codes: ['MULTI01', 'MULTI02'], comptes: {} }),
      )
      expect(notices).toEqual([
        {
          id: 'compte-manquant',
          tone: 'warn',
          text: 'Choisissez le compte de 2 imputations pour pouvoir tamponner.',
        },
      ])
    } finally {
      setBudgetLines(BUDGET_FIXTURE) // restaure le référentiel pour les tests suivants
    }
  })

  it('code multi-comptes déjà résolu → n’est plus « manquant »', () => {
    const notices = invoiceNotices(
      baseRecord({
        codes: ['MULTI01'],
        comptes: { MULTI01: '61100000' },
        supplierName: 'Fournisseur Exemple SARL',
      }),
    )
    // Plus de compte manquant → tombe sur will-learn (canLearn vrai avec ce nom).
    expect(notices[0].id).toBe('will-learn')
  })

  it('facture déjà tamponnée (duplicate) → avertit, même codes/comptes complets', () => {
    const notices = invoiceNotices(
      baseRecord({
        codes: ['MONO01'],
        comptes: {},
        duplicate: true,
      }),
    )
    expect(notices).toEqual([
      {
        id: 'duplicate',
        tone: 'warn',
        text:
          'Cette facture a déjà été tamponnée. La tamponner à nouveau ne la réapprendra pas.',
      },
    ])
  })

  it('imputation improbable pour cet émetteur (guidage famille) → avertissement doux', () => {
    const detection: Detection = {
      supplier: null,
      code: 'MULTI01',
      codes: ['MULTI01'],
      matchedKeyword: null,
      confidence: 0,
      learned: false,
      hints: { date: null, invoiceNumber: null, amount: null },
      familyReady: true,
      familyPrior: { Restauration: 0.01, Technique: 0.9 }, // Restauration ≤ FAMILY_FAINT (0.02)
    }
    const notices = invoiceNotices(
      baseRecord({
        codes: ['MULTI01'],
        comptes: { MULTI01: '61100000' },
        detection,
      }),
    )
    expect(notices).toEqual([
      {
        id: 'famille-improbable',
        tone: 'warn',
        text: 'Imputation inhabituelle pour cet émetteur. À vérifier.',
      },
    ])
  })

  it('famille non prête (familyReady faux) → n’avertit pas, passe à will-learn/no-issuer', () => {
    const detection: Detection = {
      supplier: null,
      code: 'MULTI01',
      codes: ['MULTI01'],
      matchedKeyword: null,
      confidence: 0,
      learned: false,
      hints: { date: null, invoiceNumber: null, amount: null },
      familyReady: false,
      familyPrior: { Restauration: 0.01 },
    }
    const notices = invoiceNotices(
      baseRecord({
        codes: ['MULTI01'],
        comptes: { MULTI01: '61100000' },
        detection,
        supplierName: 'Fournisseur Exemple SARL',
      }),
    )
    expect(notices[0].id).toBe('will-learn')
  })

  it('émetteur mémorisable (canLearn) → confirme que l’imputation sera apprise', () => {
    const notices = invoiceNotices(
      baseRecord({
        codes: ['MONO01'],
        comptes: {},
        supplierName: '  Grand Fournisseur SARL  ',
      }),
    )
    expect(notices).toEqual([
      {
        id: 'will-learn',
        tone: 'ok',
        text: "L'imputation sera mémorisée pour Grand Fournisseur SARL.",
      },
    ])
  })

  it('émetteur non mémorisable (nom trop court, pas de SIREN) → invite à le renseigner', () => {
    const notices = invoiceNotices(
      baseRecord({ codes: ['MONO01'], comptes: {}, supplierName: 'AB' }),
    )
    expect(notices).toEqual([
      {
        id: 'no-issuer',
        tone: 'warn',
        text: "Renseignez le nom de l'émetteur pour que l'imputation soit mémorisée.",
      },
    ])
  })

  it('nom vide mais SIREN présent → mémorisable quand même (clé = siren:<9 chiffres>)', () => {
    const notices = invoiceNotices(
      baseRecord({
        codes: ['MONO01'],
        comptes: {},
        supplierName: '',
        siren: '123456789',
      }),
    )
    expect(notices[0].id).toBe('will-learn')
  })
})

describe('invoiceNotices — jamais de doublon d’id', () => {
  const codeArb = fc.constantFrom('MONO01', 'MULTI01', 'INCONNU')
  const statusArb = fc.constantFrom<InvoiceRecord['status']>(
    'processing',
    'ready',
    'error',
  )

  it('sur un large éventail de factures générées, les ids de notices restent uniques', () => {
    fc.assert(
      fc.property(
        statusArb,
        fc.boolean(), // learned
        fc.array(codeArb, { minLength: 0, maxLength: 3 }),
        fc.boolean(), // duplicate
        fc.string({ minLength: 0, maxLength: 20 }), // supplierName
        fc.option(fc.boolean(), { nil: undefined }), // familyReady
        (status, learned, codes, duplicate, supplierName, familyReady) => {
          const detection: Detection | null =
            familyReady === undefined
              ? null
              : {
                  supplier: null,
                  code: codes[0] ?? null,
                  codes,
                  matchedKeyword: null,
                  confidence: 0,
                  learned: false,
                  hints: { date: null, invoiceNumber: null, amount: null },
                  familyReady,
                  familyPrior: { Restauration: 0.01 },
                }
          const record = baseRecord({
            status,
            learned,
            codes,
            comptes: {},
            duplicate,
            supplierName,
            detection,
          })
          const notices = invoiceNotices(record)
          const ids = notices.map((n) => n.id)
          return new Set(ids).size === ids.length
        },
      ),
      { numRuns: 300 },
    )
  })
})
