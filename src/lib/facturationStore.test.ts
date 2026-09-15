import { beforeEach, describe, expect, it } from 'vitest'

import {
  addInvoices,
  clearFacturation,
  facturationStore,
  patchInvoice,
  removeInvoice,
  selectInvoice,
} from '#/lib/facturationStore.ts'
import type { InvoiceRecord } from '#/lib/facturation/types.ts'

/*
 * `facturationStore` (src/lib/facturationStore.ts) est un magasin d'état `@tanstack/store`
 * module-level, sans aucun test. Couvert ici comme un RÉDUCTEUR : état initial, chaque action
 * (addInvoices/patchInvoice/removeInvoice/selectInvoice/clearFacturation), et l'invariant
 * qu'une action ne modifie JAMAIS l'état précédent EN PLACE (immuabilité).
 */

/** Facture minimale valide, avec juste ce qui distingue chaque instance (id/fileName). */
function makeRecord(id: string, overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id,
    file: new File(['%PDF-1.4'], `${id}.pdf`, { type: 'application/pdf' }),
    fileName: `${id}.pdf`,
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
    supplierName: '',
    learned: false,
    comment: '',
    invoiceDate: '',
    processedDate: '',
    error: null,
    ...overrides,
  }
}

// Le store est un SINGLETON module-level (partagé par tout import) : on le remet à zéro avant
// chaque test pour que les tests restent indépendants les uns des autres.
beforeEach(() => {
  clearFacturation()
})

describe('facturationStore — état initial', () => {
  it('après clearFacturation : aucune facture, aucune sélection', () => {
    expect(facturationStore.state).toEqual({ records: [], selectedId: null })
  })
})

describe('facturationStore — addInvoices', () => {
  it('ajoute les factures EN TÊTE et sélectionne la PREMIÈRE ajoutée', () => {
    const r1 = makeRecord('a')
    addInvoices([r1])
    const r2 = makeRecord('b')
    const r3 = makeRecord('c')
    addInvoices([r2, r3])

    expect(facturationStore.state.records.map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(facturationStore.state.selectedId).toBe('b')
  })

  it('un appel avec un tableau vide est un no-op (garde explicite)', () => {
    addInvoices([makeRecord('a')])
    selectInvoice(null) // dé-sélectionne volontairement
    const before = facturationStore.state

    addInvoices([])

    expect(facturationStore.state).toBe(before) // même référence : rien n'a bougé
  })

  it('n’altère pas l’état précédent en place', () => {
    addInvoices([makeRecord('a')])
    const prev = facturationStore.state
    const prevRecordsSnapshot = [...prev.records]

    addInvoices([makeRecord('b')])

    expect(prev.records).toEqual(prevRecordsSnapshot) // l'ancien tableau n'a pas bougé
    expect(prev.records).not.toBe(facturationStore.state.records) // nouvelle référence émise
  })
})

describe('facturationStore — patchInvoice', () => {
  it('met à jour uniquement les champs fournis, sur la bonne facture', () => {
    addInvoices([makeRecord('a', { comment: 'avant' }), makeRecord('b')])

    patchInvoice('a', { comment: 'après', stampScale: 1.5 })

    const a = facturationStore.state.records.find((r) => r.id === 'a')!
    const b = facturationStore.state.records.find((r) => r.id === 'b')!
    expect(a.comment).toBe('après')
    expect(a.stampScale).toBe(1.5)
    expect(a.fileName).toBe('a.pdf') // champs non touchés préservés
    expect(b.comment).toBe('') // l'autre facture est intacte
  })

  it('id inconnu → no-op silencieux (aucune facture ne matche)', () => {
    addInvoices([makeRecord('a')])
    const before = facturationStore.state.records

    patchInvoice('inconnu', { comment: 'x' })

    expect(facturationStore.state.records[0]).toEqual(before[0])
  })

  it('n’altère pas l’état précédent en place', () => {
    addInvoices([makeRecord('a', { comment: 'avant' })])
    const prev = facturationStore.state
    const prevRecord = prev.records[0]

    patchInvoice('a', { comment: 'après' })

    expect(prevRecord.comment).toBe('avant') // l'ancien objet-facture n'a pas été muté
    expect(facturationStore.state.records[0]).not.toBe(prevRecord) // nouvel objet émis
  })
})

describe('facturationStore — removeInvoice', () => {
  it('retire la facture demandée, laisse les autres intactes', () => {
    addInvoices([makeRecord('a'), makeRecord('b'), makeRecord('c')])

    removeInvoice('b')

    expect(facturationStore.state.records.map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('retirer la facture SÉLECTIONNÉE re-sélectionne la première restante', () => {
    addInvoices([makeRecord('a'), makeRecord('b')]) // sélectionne 'a' (tête)

    removeInvoice('a')

    expect(facturationStore.state.selectedId).toBe('b')
  })

  it('retirer une facture NON sélectionnée laisse la sélection inchangée', () => {
    addInvoices([makeRecord('a'), makeRecord('b')])
    selectInvoice('b')

    removeInvoice('a')

    expect(facturationStore.state.selectedId).toBe('b')
  })

  it('retirer la DERNIÈRE facture sélectionnée → sélection à null', () => {
    addInvoices([makeRecord('a')])

    removeInvoice('a')

    expect(facturationStore.state.records).toEqual([])
    expect(facturationStore.state.selectedId).toBeNull()
  })

  it('n’altère pas l’état précédent en place', () => {
    addInvoices([makeRecord('a'), makeRecord('b')])
    const prev = facturationStore.state
    const prevRecordsSnapshot = [...prev.records]

    removeInvoice('a')

    expect(prev.records).toEqual(prevRecordsSnapshot)
  })
})

describe('facturationStore — selectInvoice', () => {
  it('change la sélection vers un id donné', () => {
    addInvoices([makeRecord('a'), makeRecord('b')])

    selectInvoice('b')

    expect(facturationStore.state.selectedId).toBe('b')
    expect(facturationStore.state.records).toHaveLength(2) // les factures ne bougent pas
  })

  it('accepte null (dé-sélection explicite)', () => {
    addInvoices([makeRecord('a')])

    selectInvoice(null)

    expect(facturationStore.state.selectedId).toBeNull()
  })

  it('n’altère pas l’état précédent en place', () => {
    addInvoices([makeRecord('a')])
    const prev = facturationStore.state

    selectInvoice(null)

    expect(prev.selectedId).toBe('a')
  })
})

describe('facturationStore — clearFacturation', () => {
  it('vide tout : factures ET sélection', () => {
    addInvoices([makeRecord('a'), makeRecord('b')])
    selectInvoice('b')

    clearFacturation()

    expect(facturationStore.state).toEqual({ records: [], selectedId: null })
  })

  it('n’altère pas l’état précédent en place', () => {
    addInvoices([makeRecord('a')])
    const prev = facturationStore.state
    const prevRecordsSnapshot = [...prev.records]

    clearFacturation()

    expect(prev.records).toEqual(prevRecordsSnapshot)
    expect(prev.selectedId).toBe('a')
  })
})
