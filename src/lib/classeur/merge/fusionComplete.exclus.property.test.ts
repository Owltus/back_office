import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appliquerFusion } from '#/lib/classeur/merge/apply.ts'
import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type {
  ActionFusion,
  EtatLocal,
  PlanFusion,
} from '#/lib/classeur/merge/merge.ts'
import {
  chapitresDesLignes,
  clesActions,
  filtrerPlan,
  lignesImport,
} from '#/lib/classeur/merge/portee.ts'
import {
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson, ItemJson } from '#/lib/classeur/merge/schema.ts'
import * as service from '#/lib/classeur/service.ts'
import type { DbChapter, DbDocument } from '#/lib/classeur/types.ts'

/*
 * Refus d'un document à l'import du CLASSEUR COMPLET (audit du 2026-10-04 :
 * l'aperçu par document et le refus n'existaient que pour un chapitre ou un
 * document). Propriétés sur des fusions GÉNÉRÉES, à travers le vrai
 * `appliquerFusion` et un service simulé qui enregistre les écritures.
 *
 * Oracles indépendants du code testé :
 *   - sans refus (\`exclus\` absent OU vide) : la suite d'écritures est
 *     EXACTEMENT celle des actions de \`planifierFusion\` (planificateur
 *     d'avant ce correctif, intouché), traduites ici à la main en appels du
 *     service ; le point de restauration porte ses compteurs ;
 *   - avec refus : les actions d'origine dont la clé est refusée sont
 *     retirées (filtre naïf écrit ici), rien d'autre ;
 *   - tout refusé : aucune écriture ni point de restauration s'il ne reste
 *     aucune action de chapitre.
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
const NUM_RUNS = 300
const PLUS_TARD = '2026-05-01T00:00:00+00:00'

// ---------------------------------------------------------------------------
// Générateur : un classeur à 3 chapitres et le fichier retravaillé
// ---------------------------------------------------------------------------

const CHAPITRES: DbChapter[] = [
  chapitre({ id: 10, label: 'Accueil', sort_order: 1 }),
  chapitre({ id: 20, label: 'Sécurité', sort_order: 2 }),
  chapitre({ id: 30, label: 'Ménage', sort_order: 3 }),
]
const TEXTES = ['', 'Une ligne', 'a\nb\nc', '# Titre\n\nTexte']

interface Cas {
  local: EtatLocal
  fichier: ClasseurJson
  replace: boolean
}

const casArb: fc.Arbitrary<Cas> = fc
  .record({
    docs: fc.array(
      fc.record({
        chapitre: fc.constantFrom(10, 20, 30),
        titre: fc.constantFrom('Check-in', 'Clés', 'Extincteur', 'Linge'),
        texte: fc.constantFrom(...TEXTES),
        // 0 garder, 1 texte changé (plus récent), 2 retiré, 3 déplacé, 4 texte changé (plus ancien)
        sort: fc.nat({ max: 4 }),
        texteFichier: fc.constantFrom(...TEXTES),
        versChapitre: fc.constantFrom(10, 20, 30),
        supprime: fc.boolean(),
      }),
      { maxLength: 6 },
    ),
    retirerChapitre: fc.option(fc.constantFrom(20, 30), { nil: null }),
    renommer: fc.boolean(),
    nouveauChapitre: fc.boolean(),
    nouveaux: fc.array(
      fc.record({
        dansNouveau: fc.boolean(),
        titre: fc.constantFrom('Nouveau', 'Annexe'),
        ordre: fc.integer({ min: 1, max: 2 }),
      }),
      { maxLength: 3 },
    ),
    replace: fc.boolean(),
  })
  .map((g) => {
    const documents: DbDocument[] = g.docs.map((d, i) =>
      document({
        id: i + 1,
        chapter_id: d.chapitre,
        title: d.titre,
        content: d.texte,
        sort_order: i + 1,
        deleted_at: d.supprime ? '2026-02-01T00:00:00+00:00' : null,
      }),
    )
    const local = etat(CHAPITRES, { documents })
    const f = relire(
      construireExport(classeur(), CHAPITRES, local.content, PERIODICITES),
    )
    const parUuid = new Map(documents.map((d, i) => [d.uuid, g.docs[i]]))
    const deplaces: Array<[number, ItemJson]> = []
    for (const ch of f.chapters) {
      const items: ItemJson[] = []
      for (const elt of ch.items) {
        const desc = parUuid.get(elt.uuid ?? '')
        if (desc === undefined) continue
        if (desc.sort === 2) continue
        const copie = { ...elt }
        if (desc.sort === 1) {
          copie.content = desc.texteFichier
          copie.updated_at = PLUS_TARD
        }
        if (desc.sort === 4) copie.content = `${desc.texteFichier}!`
        if (desc.sort === 3) {
          copie.updated_at = PLUS_TARD
          deplaces.push([desc.versChapitre, copie])
          continue
        }
        items.push(copie)
      }
      ch.items = items
    }
    for (const [vers, elt] of deplaces)
      f.chapters.find((c) => c.uuid === `ch-${String(vers)}`)?.items.push(elt)
    if (g.renommer) f.chapters[0].label = 'Accueil (révisé)'
    if (g.retirerChapitre !== null)
      f.chapters = f.chapters.filter(
        (c) => c.uuid !== `ch-${String(g.retirerChapitre)}`,
      )
    if (g.nouveauChapitre)
      f.chapters.push({
        uid: 'annexes',
        uuid: 'ch-nouveau',
        label: 'Annexes',
        icon: 'FileText',
        description: '',
        sort_order: 9,
        items: [],
      })
    for (const n of g.nouveaux) {
      const cible =
        n.dansNouveau && g.nouveauChapitre
          ? f.chapters[f.chapters.length - 1]
          : f.chapters[0]
      cible.items.push({
        kind: 'document',
        title: n.titre,
        description: '',
        content: 'Texte neuf',
        sort_order: n.ordre,
      })
    }
    return { local, fichier: relire(f), replace: g.replace }
  })

function relire(f: ClasseurJson): ClasseurJson {
  return parseImportJson(JSON.stringify(f))
}

const planDe = (c: Cas): PlanFusion =>
  planifierFusion(c.local, c.fichier, { replace: c.replace })

const casEtRefusArb = casArb.chain((c) => {
  const cles = clesActions(planDe(c).actions).filter(
    (k): k is string => k !== null,
  )
  return fc
    .tuple(fc.subarray(cles), fc.array(fc.constantFrom('document:999', 'x')))
    .map(([refus, bruit]) => ({
      cas: c,
      exclus: new Set([...refus, ...bruit]),
    }))
})

// ---------------------------------------------------------------------------
// Service simulé : chaque écriture est enregistrée, dans l'ordre
// ---------------------------------------------------------------------------

type Ecriture = [string, unknown]
let journal: Ecriture[] = []

function brancher(c: Cas) {
  vi.clearAllMocks()
  journal = []
  let prochainId = 1000
  mocks.fetchClasseur.mockResolvedValue(classeur())
  mocks.fetchPeriodicites.mockResolvedValue(PERIODICITES)
  mocks.fetchChaptersAvecSupprimes.mockResolvedValue(c.local.chapters)
  mocks.fetchContentAvecSupprimes.mockResolvedValue(c.local.content)
  mocks.fetchMergeHistory.mockResolvedValue([])
  mocks.insertMergeHistory.mockImplementation((e) => {
    journal.push([
      'point',
      { inserted: e.inserted, updated: e.updated, unchanged: e.unchanged },
    ])
    return Promise.resolve(1)
  })
  mocks.createChapter.mockImplementation((_c, input) => {
    journal.push(['createChapter', input.label])
    return Promise.resolve(prochainId++)
  })
  mocks.updateChapter.mockImplementation((id) => {
    journal.push(['updateChapter', id])
    return Promise.resolve()
  })
  mocks.restaurerChapter.mockImplementation((id) => {
    journal.push(['restaurerChapter', id])
    return Promise.resolve()
  })
  mocks.softDeleteChapter.mockImplementation((id) => {
    journal.push(['softDeleteChapter', id])
    return Promise.resolve()
  })
  mocks.createItem.mockImplementation((_ch, item) => {
    journal.push(['createItem', item.input.title])
    return Promise.resolve(prochainId++)
  })
  mocks.updateItem.mockImplementation((kind, id) => {
    journal.push(['updateItem', `${kind}:${String(id)}`])
    return Promise.resolve()
  })
  mocks.restaurerItem.mockImplementation((kind, id) => {
    journal.push(['restaurerItem', `${kind}:${String(id)}`])
    return Promise.resolve()
  })
  mocks.softDeleteItem.mockImplementation((kind, id) => {
    journal.push(['softDeleteItem', `${kind}:${String(id)}`])
    return Promise.resolve()
  })
}

/** Traduction À LA MAIN d'une action en l'écriture attendue. */
function ecritureAttendue(a: ActionFusion): Ecriture {
  switch (a.type) {
    case 'creerChapitre':
      return ['createChapter', a.label]
    case 'modifierChapitre':
      return ['updateChapter', a.id]
    case 'restaurerChapitre':
      return ['restaurerChapter', a.id]
    case 'supprimerChapitre':
      return ['softDeleteChapter', a.id]
    case 'creerItem':
      return ['createItem', a.item.input.title]
    case 'modifierItem':
      return ['updateItem', `${a.item.kind}:${String(a.id)}`]
    case 'restaurerItem':
      return ['restaurerItem', `${a.item.kind}:${String(a.id)}`]
    case 'supprimerItem':
      return ['softDeleteItem', `${a.kind}:${String(a.id)}`]
    case 'ordonnerItem':
    case 'ordonnerChapitre':
      throw new Error('Une fusion ne pose jamais de renumérotation seule.')
  }
}

function journalAttendu(plan: PlanFusion, actions: ActionFusion[]): Ecriture[] {
  if (actions.length === 0) return []
  return [
    [
      'point',
      {
        inserted: plan.resultat.inserted,
        updated: plan.resultat.updated,
        unchanged: plan.resultat.unchanged,
      },
    ],
    ...actions.map(ecritureAttendue),
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------

describe('import du classeur complet — refus (propriétés)', () => {
  it('sans refus (absent ou vide) : écritures et point IDENTIQUES au plan d’avant', async () => {
    await fc.assert(
      fc.asyncProperty(casArb, async (c) => {
        const plan = planDe(c)
        const attendu = journalAttendu(plan, plan.actions)
        // Le filtre vide rend le MÊME objet : rien n'est recopié.
        expect(filtrerPlan(plan, new Set()).plan).toBe(plan)
        for (const exclus of [undefined, new Set<string>()]) {
          brancher(c)
          const r = await appliquerFusion(1, c.fichier, {
            replace: c.replace,
            sourceName: 's',
            ...(exclus === undefined ? {} : { exclus }),
          })
          expect(journal).toEqual(attendu)
          const { avertissements: _a, ignores, ...compteurs } = r
          expect(compteurs).toEqual(plan.resultat)
          expect(ignores).toBe(exclus === undefined ? undefined : 0)
        }
      }),
      { numRuns: NUM_RUNS, seed: 20261041 },
    )
  })

  it('avec refus : seules les actions refusées disparaissent, avant le point', async () => {
    await fc.assert(
      fc.asyncProperty(casEtRefusArb, async ({ cas, exclus }) => {
        const plan = planDe(cas)
        const cles = clesActions(plan.actions)
        const gardees = plan.actions.filter((_, i) => {
          const k = cles[i]
          return k === null || !exclus.has(k)
        })
        const retirees = plan.actions.length - gardees.length
        brancher(cas)
        const r = await appliquerFusion(1, cas.fichier, {
          replace: cas.replace,
          sourceName: 's',
          exclus,
        })
        expect(r.ignores).toBe(retirees)
        expect(journal.slice(1).map(([n, v]) => [n, v])).toEqual(
          gardees.length === 0 ? [] : gardees.map(ecritureAttendue),
        )
        if (gardees.length === 0) {
          expect(journal).toEqual([])
          expect(mocks.fetchMergeHistory).not.toHaveBeenCalled()
        } else {
          // Point AVANT la première écriture, compteurs du plan FILTRÉ.
          expect(journal[0][0]).toBe('point')
          const filtre = filtrerPlan(plan, exclus).plan
          expect(journal[0][1]).toEqual({
            inserted: filtre.resultat.inserted,
            updated: filtre.resultat.updated,
            unchanged: filtre.resultat.unchanged,
          })
          // Somme des compteurs conservée : un refus ne fait que déplacer.
          const somme = (x: PlanFusion['resultat']) =>
            x.inserted + x.updated + x.unchanged + x.skipped + x.deleted
          expect(somme(filtre.resultat)).toBe(somme(plan.resultat))
        }
      }),
      { numRuns: NUM_RUNS, seed: 20261042 },
    )
  })

  it('chapitre de chaque ligne : une entrée par action, chapitres nouveaux nommés', () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const plan = planDe(c)
        const lignes = lignesImport(c.local, plan)
        const chapitres = chapitresDesLignes(c.local, plan)
        expect(chapitres).toHaveLength(lignes.length)
        plan.actions.forEach((a, i) => {
          const ch = chapitres[i]
          expect(ch.libelle).not.toBe('Sans chapitre')
          if (a.type === 'creerItem' && a.chapitre.type === 'nouveau') {
            const index = a.chapitre.index
            const cree = plan.actions.find(
              (b) => b.type === 'creerChapitre' && b.index === index,
            )
            expect(cree && 'label' in cree ? cree.label : null).toBe(ch.libelle)
          }
          if (a.type === 'supprimerItem') {
            const doc = c.local.content.documents.find((d) => d.id === a.id)
            expect(ch.cle).toBe(`local:${String(doc?.chapter_id)}`)
          }
        })
      }),
      { numRuns: NUM_RUNS, seed: 20261043 },
    )
  })

  it('le générateur couvre les cas utiles', () => {
    const vus = { modif: 0, creation: 0, suppression: 0, chapitre: 0, vide: 0 }
    fc.assert(
      fc.property(casArb, (c) => {
        const plan = planDe(c)
        if (plan.actions.length === 0) vus.vide += 1
        for (const a of plan.actions) {
          if (a.type === 'modifierItem') vus.modif += 1
          if (a.type === 'creerItem') vus.creation += 1
          if (a.type === 'supprimerItem') vus.suppression += 1
          if (a.type.endsWith('Chapitre')) vus.chapitre += 1
        }
      }),
      { numRuns: NUM_RUNS, seed: 20261041 },
    )
    expect(vus.modif).toBeGreaterThan(50)
    expect(vus.creation).toBeGreaterThan(50)
    expect(vus.suppression).toBeGreaterThan(20)
    expect(vus.chapitre).toBeGreaterThan(50)
    expect(vus.vide).toBeGreaterThan(2)
  })
})
