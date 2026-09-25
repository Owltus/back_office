import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appliquerFusion,
  elaguerHistorique,
  executerPlan,
  importerCommeNouveauClasseur,
  resoudreChapitre,
} from '#/lib/classeur/merge/apply.ts'
import type { Ecrivain } from '#/lib/classeur/merge/apply.ts'
import type { ActionFusion, ChampsItem } from '#/lib/classeur/merge/merge.ts'
import {
  PERIODICITES,
  chJson,
  chapitre,
  classeur,
  contenu,
  document,
  fichier,
  itJson,
} from '#/lib/classeur/merge/fixtures.ts'
import * as service from '#/lib/classeur/service.ts'
import type { DbMergeHistoryEntry } from '#/lib/classeur/types.ts'

/*
 * Le service Supabase est SIMULÉ : chaque fonction consigne son appel dans
 * `journal` (nom + arguments), dans l'ordre. Les oracles portent sur cet
 * ordre — c'est lui, et non le contenu des écritures (déjà couvert par
 * merge.test.ts), que ce module garantit.
 */

vi.mock('#/lib/classeur/service.ts', () => ({
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  restaurerChapter: vi.fn(),
  softDeleteChapter: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  restaurerItem: vi.fn(),
  softDeleteItem: vi.fn(),
  createClasseur: vi.fn(),
  fetchClasseur: vi.fn(),
  fetchChaptersAvecSupprimes: vi.fn(),
  fetchContentAvecSupprimes: vi.fn(),
  fetchPeriodicites: vi.fn(),
  insertMergeHistory: vi.fn(),
  fetchMergeHistory: vi.fn(),
  deleteMergeHistory: vi.fn(),
}))

const mocks = vi.mocked(service)
let journal: string[]

function consigner<T>(nom: string, valeur?: T) {
  return (...args: unknown[]) => {
    journal.push(`${nom}(${args.map((a) => JSON.stringify(a)).join(', ')})`)
    return Promise.resolve(valeur as T)
  }
}

const noms = (j: string[]) => j.map((l) => l.slice(0, l.indexOf('(')))

/** Entrée d'historique minimale pour l'élagage (seuls id et merged_at comptent). */
function entree(id: number, merged_at: string): DbMergeHistoryEntry {
  return {
    id,
    classeur_id: 1,
    merged_at,
    source_name: 's',
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  }
}

beforeEach(() => {
  journal = []
  vi.resetAllMocks()
  mocks.fetchClasseur.mockImplementation(consigner('fetchClasseur', classeur()))
  mocks.fetchChaptersAvecSupprimes.mockImplementation(
    consigner('fetchChaptersAvecSupprimes', []),
  )
  mocks.fetchContentAvecSupprimes.mockImplementation(
    consigner('fetchContentAvecSupprimes', contenu()),
  )
  mocks.fetchPeriodicites.mockImplementation(
    consigner('fetchPeriodicites', PERIODICITES),
  )
  mocks.insertMergeHistory.mockImplementation(
    consigner('insertMergeHistory', 99),
  )
  mocks.fetchMergeHistory.mockImplementation(consigner('fetchMergeHistory', []))
  mocks.deleteMergeHistory.mockImplementation(consigner('deleteMergeHistory'))
  mocks.createChapter.mockImplementation(consigner('createChapter', 777))
  mocks.createItem.mockImplementation(consigner('createItem', 555))
  mocks.updateChapter.mockImplementation(consigner('updateChapter'))
  mocks.restaurerChapter.mockImplementation(consigner('restaurerChapter'))
  mocks.softDeleteChapter.mockImplementation(consigner('softDeleteChapter'))
  mocks.updateItem.mockImplementation(consigner('updateItem'))
  mocks.restaurerItem.mockImplementation(consigner('restaurerItem'))
  mocks.softDeleteItem.mockImplementation(consigner('softDeleteItem'))
  mocks.createClasseur.mockImplementation(consigner('createClasseur', 42))
})

/** Fichier : un chapitre nouveau portant un document. */
const fichierNouveau = () =>
  fichier([
    chJson({
      label: 'Sécurité',
      uuid: 'u-sec',
      items: [
        itJson({
          kind: 'document',
          title: 'Consignes',
          uuid: 'u-doc',
          content: '#',
        }),
      ],
    }),
  ])

describe('appliquerFusion — ordre strict', () => {
  it("(a) l'instantané est inséré AVANT la première écriture de contenu", async () => {
    await appliquerFusion(1, fichierNouveau(), {
      replace: false,
      sourceName: 'export.json',
    })
    const n = noms(journal)
    const iInstantane = n.indexOf('insertMergeHistory')
    const iPremiereEcriture = n.findIndex((x) =>
      ['createChapter', 'createItem', 'updateChapter', 'updateItem'].includes(
        x,
      ),
    )
    expect(iInstantane).toBeGreaterThanOrEqual(0)
    expect(iPremiereEcriture).toBeGreaterThan(iInstantane)
    // Lectures → instantané → écritures → élagage.
    expect(n).toEqual([
      'fetchClasseur',
      'fetchChaptersAvecSupprimes',
      'fetchPeriodicites',
      'fetchContentAvecSupprimes',
      'insertMergeHistory',
      'createChapter',
      'createItem',
      'fetchMergeHistory',
    ])
  })

  it("l'instantané porte le classeur, la source et les compteurs du plan", async () => {
    await appliquerFusion(1, fichierNouveau(), {
      replace: false,
      sourceName: 'export.json',
    })
    const ecrite = mocks.insertMergeHistory.mock.calls[0][0]
    expect(ecrite.classeur_id).toBe(1)
    expect(ecrite.source_name).toBe('export.json')
    expect(ecrite.inserted).toBe(2)
    expect(ecrite.updated).toBe(0)
    const snapshot = ecrite.snapshot as {
      format_version: number
      chapters: unknown[]
    }
    expect(snapshot.format_version).toBe(2)
    expect(snapshot.chapters).toEqual([])
  })

  it("(b) {type:'nouveau', index} est résolu avec l'id rendu par createChapter", async () => {
    mocks.createChapter.mockImplementation(consigner('createChapter', 4321))
    await appliquerFusion(1, fichierNouveau(), {
      replace: false,
      sourceName: 's',
    })
    expect(mocks.createItem).toHaveBeenCalledTimes(1)
    expect(mocks.createItem.mock.calls[0][0]).toBe(4321)
    expect(mocks.createItem.mock.calls[0][2]).toEqual({
      sort_order: 1,
      uuid: 'u-doc',
    })
    expect(mocks.createChapter.mock.calls[0][2]).toEqual({
      sort_order: 1,
      uuid: 'u-sec',
    })
  })

  it('(c) une erreur au milieu remonte et arrête le plan (instantané déjà écrit)', async () => {
    const panne = Object.assign(new Error('boom'), { code: '23505' })
    mocks.createChapter.mockImplementation(() => {
      journal.push('createChapter()')
      return Promise.reject(panne)
    })
    await expect(
      appliquerFusion(1, fichierNouveau(), { replace: false, sourceName: 's' }),
    ).rejects.toBe(panne)
    const n = noms(journal)
    expect(n).toContain('insertMergeHistory')
    expect(n.indexOf('insertMergeHistory')).toBeLessThan(
      n.indexOf('createChapter'),
    )
    expect(mocks.createItem).not.toHaveBeenCalled()
    expect(mocks.fetchMergeHistory).not.toHaveBeenCalled()
  })

  it("(d) un 42501 sur l'élagage est ignoré, la fusion rend ses compteurs", async () => {
    const entrees = Array.from({ length: 12 }, (_, i) =>
      entree(i + 1, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    )
    mocks.fetchMergeHistory.mockImplementation(
      consigner('fetchMergeHistory', entrees),
    )
    mocks.deleteMergeHistory.mockImplementation(() => {
      journal.push('deleteMergeHistory()')
      return Promise.reject(Object.assign(new Error('rls'), { code: '42501' }))
    })
    const resultat = await appliquerFusion(1, fichierNouveau(), {
      replace: false,
      sourceName: 's',
    })
    expect(resultat.inserted).toBe(2)
    // Le refus arrête l'élagage au premier essai : inutile d'insister.
    expect(mocks.deleteMergeHistory).toHaveBeenCalledTimes(1)
  })

  it("l'élagage supprime les entrées au-delà de la dixième, les plus anciennes", async () => {
    const entrees = Array.from({ length: 12 }, (_, i) =>
      entree(i + 1, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    )
    mocks.fetchMergeHistory.mockImplementation(
      consigner('fetchMergeHistory', entrees),
    )
    await elaguerHistorique(1)
    expect(mocks.deleteMergeHistory.mock.calls.map((c) => c[0])).toEqual([2, 1])
  })

  it("une autre erreur d'élagage remonte, en disant que la fusion est appliquée", async () => {
    mocks.fetchMergeHistory.mockImplementation(
      consigner('fetchMergeHistory', [
        entree(1, '2026-01-01T00:00:00Z'),
        ...Array.from({ length: 10 }, (_, i) =>
          entree(i + 2, `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
        ),
      ]),
    )
    mocks.deleteMergeHistory.mockRejectedValue(new Error('réseau'))
    await expect(
      appliquerFusion(1, fichierNouveau(), { replace: false, sourceName: 's' }),
    ).rejects.toThrow(/Fusion appliquée.*réseau/)
  })

  it("un plan sans action n'écrit RIEN (ni instantané, ni élagage)", async () => {
    mocks.fetchChaptersAvecSupprimes.mockImplementation(
      consigner('fetchChaptersAvecSupprimes', [
        chapitre({ id: 10, label: 'Sécurité', uuid: 'u-sec' }),
      ]),
    )
    mocks.fetchContentAvecSupprimes.mockImplementation(
      consigner(
        'fetchContentAvecSupprimes',
        contenu({
          documents: [
            document({
              id: 1,
              chapter_id: 10,
              title: 'Consignes',
              uuid: 'u-doc',
              content: '#',
            }),
          ],
        }),
      ),
    )
    const resultat = await appliquerFusion(1, fichierNouveau(), {
      replace: false,
      sourceName: 's',
    })
    expect(resultat).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 2,
      skipped: 0,
      deleted: 0,
    })
    expect(mocks.insertMergeHistory).not.toHaveBeenCalled()
    expect(mocks.fetchMergeHistory).not.toHaveBeenCalled()
  })

  it('un classeur introuvable refuse avant toute écriture', async () => {
    mocks.fetchClasseur.mockImplementation(consigner('fetchClasseur', null))
    await expect(
      appliquerFusion(1, fichierNouveau(), { replace: false, sourceName: 's' }),
    ).rejects.toThrow(/introuvable/)
    expect(mocks.insertMergeHistory).not.toHaveBeenCalled()
  })
})

describe('executerPlan — résolution des références', () => {
  function ecrivainJournal(): Ecrivain {
    let prochain = 100
    const ok = () => Promise.resolve()
    return {
      createChapter: (_classeurId, input, options) => {
        journal.push(`createChapter:${input.label}:${JSON.stringify(options)}`)
        prochain += 1
        return Promise.resolve(prochain)
      },
      updateChapter: (id) => {
        journal.push(`updateChapter:${id}`)
        return ok()
      },
      restaurerChapter: (id, patch) => {
        journal.push(`restaurerChapter:${id}:${patch?.label ?? ''}`)
        return ok()
      },
      softDeleteChapter: (id) => {
        journal.push(`softDeleteChapter:${id}`)
        return ok()
      },
      createItem: (chapterId, item, options) => {
        journal.push(
          `createItem:${chapterId}:${item.input.title}:${JSON.stringify(options)}`,
        )
        return Promise.resolve(1)
      },
      updateItem: (kind, id) => {
        journal.push(`updateItem:${kind}:${id}`)
        return ok()
      },
      restaurerItem: (kind, id) => {
        journal.push(`restaurerItem:${kind}:${id}`)
        return ok()
      },
      softDeleteItem: (kind, id) => {
        journal.push(`softDeleteItem:${kind}:${id}`)
        return ok()
      },
    }
  }

  const creer = (index: number, label: string): ActionFusion => ({
    type: 'creerChapitre',
    index,
    uuid: null,
    label,
    icon: 'FileText',
    description: '',
    sort_order: index + 1,
  })
  const doc = (title: string): ChampsItem => ({
    kind: 'document',
    input: { title, description: '', content: '' },
  })

  it('deux chapitres nouveaux : chaque élément va dans le sien, dans l’ordre', async () => {
    const actions: ActionFusion[] = [
      creer(0, 'A'),
      {
        type: 'creerItem',
        chapitre: { type: 'nouveau', index: 0 },
        uuid: null,
        sort_order: 1,
        item: doc('a1'),
      },
      creer(1, 'B'),
      {
        type: 'creerItem',
        chapitre: { type: 'nouveau', index: 1 },
        uuid: 'u',
        sort_order: 2,
        item: doc('b1'),
      },
      {
        type: 'creerItem',
        chapitre: { type: 'local', id: 7 },
        uuid: null,
        sort_order: 3,
        item: doc('l1'),
      },
      { type: 'modifierItem', id: 8, item: doc('m') },
      { type: 'restaurerItem', kind: 'intercalaire', id: 9 },
      {
        type: 'restaurerChapitre',
        id: 3,
        label: 'R',
        icon: 'X',
        description: '',
      },
      {
        type: 'modifierChapitre',
        id: 4,
        label: 'M',
        icon: 'X',
        description: '',
      },
      { type: 'supprimerItem', kind: 'document', id: 5 },
      { type: 'supprimerChapitre', id: 6 },
    ]
    const ids = await executerPlan(1, actions, ecrivainJournal())
    expect(ids).toEqual([101, 102])
    expect(journal).toEqual([
      'createChapter:A:{"sort_order":1}',
      'createItem:101:a1:{"sort_order":1}',
      'createChapter:B:{"sort_order":2}',
      'createItem:102:b1:{"sort_order":2,"uuid":"u"}',
      'createItem:7:l1:{"sort_order":3}',
      'updateItem:document:8',
      'restaurerItem:intercalaire:9',
      'restaurerChapter:3:R',
      'updateChapter:4',
      'softDeleteItem:document:5',
      'softDeleteChapter:6',
    ])
  })

  it('une référence vers un chapitre pas encore créé est une erreur, sans écriture', async () => {
    const actions: ActionFusion[] = [
      {
        type: 'creerItem',
        chapitre: { type: 'nouveau', index: 0 },
        uuid: null,
        sort_order: 1,
        item: doc('x'),
      },
      creer(0, 'A'),
    ]
    await expect(executerPlan(1, actions, ecrivainJournal())).rejects.toThrow(
      /incohérent/,
    )
    expect(journal).toEqual([])
  })

  it('resoudreChapitre : local tel quel, nouveau par index', () => {
    expect(resoudreChapitre({ type: 'local', id: 5 }, [])).toBe(5)
    expect(resoudreChapitre({ type: 'nouveau', index: 1 }, [10, 11])).toBe(11)
    expect(() =>
      resoudreChapitre({ type: 'nouveau', index: 2 }, [10, 11]),
    ).toThrow()
  })
})

describe('importerCommeNouveauClasseur', () => {
  it('crée le classeur puis son contenu, sans entrée d’historique', async () => {
    const id = await importerCommeNouveauClasseur(fichierNouveau())
    expect(id).toBe(42)
    expect(mocks.createClasseur).toHaveBeenCalledWith({
      name: 'Registre de sécurité',
      icon: 'Shield',
      etablissement: 'OKKO Nantes',
      etablissement_complement: '',
    })
    expect(noms(journal)).toEqual([
      'fetchPeriodicites',
      'createClasseur',
      'createChapter',
      'createItem',
    ])
    expect(mocks.createChapter.mock.calls[0][0]).toBe(42)
    expect(mocks.createItem.mock.calls[0][0]).toBe(777)
    expect(mocks.insertMergeHistory).not.toHaveBeenCalled()
  })
})
