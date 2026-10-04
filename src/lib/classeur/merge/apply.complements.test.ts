import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appliquerFusionPortee,
  executerPlan,
  importerCommeNouveauClasseur,
  previsualiserFusionPortee,
  resoudreChapitre,
} from '#/lib/classeur/merge/apply.ts'
import type { Ecrivain } from '#/lib/classeur/merge/apply.ts'
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
import type { ActionFusion, ChampsItem } from '#/lib/classeur/merge/merge.ts'
import * as service from '#/lib/classeur/service.ts'

/*
 * Compléments d'`apply.ts` (étape 1 du plan `classeur-fonctions-2026-10-04`,
 * phase /martin) : ce que les mutants survivants de Stryker montraient
 * comme NON VÉRIFIÉ — les champs facultatifs transmis à l'écrivain, la
 * prévisualisation d'un réimport limité, l'instantané sans référentiel et
 * l'import d'un classeur neuf (jamais en remplacement). Valeurs attendues
 * écrites à la main.
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

/** Écrivain qui consigne chaque appel (nom + arguments). */
function ecrivainEspion() {
  const appels: Array<[string, ...unknown[]]> = []
  const note =
    (nom: string, rendu?: number) =>
    (...args: unknown[]) => {
      appels.push([nom, ...args])
      return Promise.resolve(rendu as never)
    }
  const e: Ecrivain = {
    createChapter: note('createChapter', 70),
    updateChapter: note('updateChapter'),
    restaurerChapter: note('restaurerChapter'),
    softDeleteChapter: note('softDeleteChapter'),
    createItem: note('createItem', 80),
    updateItem: note('updateItem'),
    restaurerItem: note('restaurerItem'),
    softDeleteItem: note('softDeleteItem'),
  }
  return { e, appels }
}

const doc: ChampsItem = {
  kind: 'document',
  input: { title: 'T', description: '', content: 'c' },
}
const ISO = '2026-03-01T00:00:00.000Z'

describe('executerPlan : champs facultatifs transmis, ou absents', () => {
  it('avec sort_order, uuid et updated_at', async () => {
    const { e, appels } = ecrivainEspion()
    const actions: ActionFusion[] = [
      {
        type: 'modifierChapitre',
        id: 1,
        label: 'L',
        icon: 'I',
        description: 'D',
        sort_order: 4,
      },
      {
        type: 'restaurerChapitre',
        id: 2,
        label: 'R',
        icon: 'I',
        description: 'D',
        sort_order: 5,
      },
      {
        type: 'creerItem',
        chapitre: { type: 'local', id: 1 },
        uuid: 'u-1',
        sort_order: 1,
        updated_at: ISO,
        item: doc,
      },
      {
        type: 'modifierItem',
        id: 3,
        item: doc,
        chapitre: { type: 'local', id: 2 },
        sort_order: 2,
        uuid: 'u-3',
        updated_at: ISO,
      },
      {
        type: 'restaurerItem',
        id: 4,
        item: doc,
        chapitre: { type: 'local', id: 1 },
        sort_order: 3,
        uuid: 'u-4',
        updated_at: ISO,
      },
    ]
    await executerPlan(9, actions, e)
    expect(appels).toEqual([
      [
        'updateChapter',
        1,
        { label: 'L', icon: 'I', description: 'D', sort_order: 4 },
      ],
      [
        'restaurerChapter',
        2,
        { label: 'R', icon: 'I', description: 'D', sort_order: 5 },
      ],
      ['createItem', 1, doc, { sort_order: 1, uuid: 'u-1', updated_at: ISO }],
      [
        'updateItem',
        'document',
        3,
        {
          title: 'T',
          description: '',
          content: 'c',
          chapter_id: 2,
          sort_order: 2,
          uuid: 'u-3',
          updated_at: ISO,
        },
      ],
      [
        'restaurerItem',
        'document',
        4,
        {
          title: 'T',
          description: '',
          content: 'c',
          chapter_id: 1,
          sort_order: 3,
          uuid: 'u-4',
          updated_at: ISO,
        },
      ],
    ])
  })

  it('sans les champs facultatifs : aucune clé ajoutée', async () => {
    const { e, appels } = ecrivainEspion()
    await executerPlan(
      9,
      [
        {
          type: 'modifierChapitre',
          id: 1,
          label: 'L',
          icon: 'I',
          description: 'D',
        },
        {
          type: 'restaurerChapitre',
          id: 2,
          label: 'R',
          icon: 'I',
          description: 'D',
        },
        {
          type: 'creerItem',
          chapitre: { type: 'local', id: 1 },
          uuid: null,
          sort_order: 1,
          item: doc,
        },
        { type: 'modifierItem', id: 3, item: doc },
        {
          type: 'restaurerItem',
          id: 4,
          item: doc,
          chapitre: { type: 'local', id: 1 },
          sort_order: 3,
        },
      ],
      e,
    )
    expect(appels).toEqual([
      ['updateChapter', 1, { label: 'L', icon: 'I', description: 'D' }],
      ['restaurerChapter', 2, { label: 'R', icon: 'I', description: 'D' }],
      ['createItem', 1, doc, { sort_order: 1 }],
      [
        'updateItem',
        'document',
        3,
        { title: 'T', description: '', content: 'c' },
      ],
      [
        'restaurerItem',
        'document',
        4,
        {
          title: 'T',
          description: '',
          content: 'c',
          chapter_id: 1,
          sort_order: 3,
        },
      ],
    ])
  })

  it('le message d’un plan incohérent numérote le chapitre à partir de 1', () => {
    expect(() => resoudreChapitre({ type: 'nouveau', index: 2 }, [10])).toThrow(
      "Plan de fusion incohérent : le chapitre n° 3 n'a pas encore été créé.",
    )
  })
})

// ---------------------------------------------------------------------------

const A = chapitre({ id: 10, label: 'Accueil' })
const d1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'avant',
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.fetchClasseur.mockResolvedValue(classeur())
  mocks.fetchChaptersAvecSupprimes.mockResolvedValue([A])
  mocks.fetchContentAvecSupprimes.mockResolvedValue(
    contenu({ documents: [d1] }),
  )
  mocks.fetchPeriodicites.mockResolvedValue(PERIODICITES)
  mocks.insertMergeHistory.mockResolvedValue(1)
  mocks.fetchMergeHistory.mockResolvedValue([])
  mocks.createClasseur.mockResolvedValue(42)
  mocks.createChapter.mockResolvedValue(70)
  mocks.createItem.mockResolvedValue(80)
})

const fichierDoc = () =>
  fichier([
    chJson({
      label: 'Accueil',
      uuid: A.uuid,
      items: [
        itJson({
          kind: 'document',
          title: 'Check-in',
          uuid: d1.uuid,
          content: 'après',
        }),
      ],
    }),
  ])

describe('previsualiserFusionPortee', () => {
  it('rend le plan et une ligne avant / après par action, sans écrire', async () => {
    const r = await previsualiserFusionPortee(
      1,
      fichierDoc(),
      { type: 'document', documentId: 1 },
      {
        supprimerAbsents: false,
      },
    )
    expect(r.plan.actions).toHaveLength(1)
    expect(r.lignes).toHaveLength(1)
    expect(r.lignes[0]).toMatchObject({
      cle: 'document:1',
      genre: 'modification',
      avant: { content: 'avant' },
      apres: { content: 'après' },
    })
    expect(mocks.insertMergeHistory).not.toHaveBeenCalled()
    expect(mocks.updateItem).not.toHaveBeenCalled()
  })
})

describe('appliquerFusionPortee : instantané', () => {
  it('référentiel des périodicités absent : instantané avec une liste vide', async () => {
    // Un état local sans `periodicites` : le service n'en rend pas.
    mocks.fetchPeriodicites.mockResolvedValue(undefined as never)
    await appliquerFusionPortee(
      1,
      fichierDoc(),
      { type: 'document', documentId: 1 },
      {
        supprimerAbsents: false,
        sourceName: 'Import',
      },
    )
    const entree = mocks.insertMergeHistory.mock.calls[0][0]
    expect(entree).toMatchObject({
      kind: 'fusion',
      label: 'Import',
      source_name: 'Import',
    })
    const instantane = entree.snapshot as { periodicites?: unknown[] }
    expect(instantane.periodicites ?? []).toEqual([])
  })
})

describe('importerCommeNouveauClasseur', () => {
  it('fusion sur un état VIDE, sans remplacement : seules des créations', async () => {
    await importerCommeNouveauClasseur(fichierDoc())
    expect(mocks.createChapter).toHaveBeenCalledTimes(1)
    expect(mocks.createItem).toHaveBeenCalledTimes(1)
    expect(mocks.updateItem).not.toHaveBeenCalled()
    expect(mocks.softDeleteItem).not.toHaveBeenCalled()
    expect(mocks.softDeleteChapter).not.toHaveBeenCalled()
    // Le chapitre neuf est rangé en fin de liste (fusion), pas à l'ordre du fichier.
    expect(mocks.createChapter.mock.calls[0][2]).toMatchObject({
      sort_order: 1,
    })
    // Uuid NEUF (tiré par la base) : celui du fichier est déjà pris si le
    // fichier est l'export d'un classeur de cette base (UNIQUE sur la table).
    expect(mocks.createChapter.mock.calls[0][2]).not.toHaveProperty('uuid')
    expect(mocks.createItem.mock.calls[0][2]).not.toHaveProperty('uuid')
  })
})
