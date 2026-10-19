import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Points de restauration SANS mode d'emploi pour une IA (étape 4 du plan
 * `classeur-echange-ia-2026-10-19`, D6). Les trois chemins qui écrivent un
 * instantané — point auto / manuel (`creerPoint`), fusion
 * (`appliquerFusion`), sécurité avant restauration (`restaurerInstantane`) —
 * passent par le VRAI service sur le simulateur. Oracles : aucun n'a
 * `instructions` ; tous gardent les cinq clés de Registre avec leurs types,
 * dont `periodicites` que la restauration relit ; un instantané léger se
 * relit par `parseImportJson` et se restaure exactement ; l'export
 * utilisateur, lui, garde son mode d'emploi.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { creerPoint, reinitialiserPointsAuto } =
  await import('#/lib/classeur/restauration.ts')
const { restaurerInstantane } = await import('#/lib/classeur/merge/history.ts')
const { appliquerFusion } = await import('#/lib/classeur/merge/apply.ts')
const { construireExport, parseImportJson } =
  await import('#/lib/classeur/merge/schema.ts')
const { fetchChapters, fetchClasseur, fetchContentParChapitres } =
  await import('#/lib/classeur/service.ts')

const T = '2026-09-20T10:00:00.000Z'
const CLES_REGISTRE = [
  'description',
  'generated_at',
  'note',
  'schema',
  'periodicites',
]

let sim: SimulateurSupabase

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-19T08:00:00.000Z'))
  reinitialiserPointsAuto()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sim = new SimulateurSupabase({
    classeur_classeurs: [
      {
        id: 5,
        uuid: 'c-5',
        name: 'Registre',
        icon: 'book',
        etablissement: 'OKKO Nantes',
        etablissement_complement: '',
        created_by: null,
        acces_tous: 'lecture',
        sort_order: 1,
        created_at: T,
        updated_at: T,
      },
    ],
    classeur_chapters: [
      {
        id: 50,
        uuid: '00000000-0000-4000-8000-000000000050',
        classeur_id: 5,
        label: 'Arrivée',
        icon: '',
        description: '',
        sort_order: 1,
        updated_at: T,
        created_at: T,
      },
    ],
    classeur_documents: [
      {
        id: 500,
        uuid: 'aaaaaaaa-0000-4000-8000-000000000500',
        chapter_id: 50,
        title: 'Accueil',
        description: '',
        content: 'Accueillir.',
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 1,
        updated_at: T,
        created_at: T,
      },
    ],
    classeur_tracking_sheets: [
      {
        id: 700,
        uuid: 'bbbbbbbb-0000-4000-8000-000000000700',
        chapter_id: 50,
        title: 'Contrôle extincteurs',
        periodicite_id: 1,
        sort_order: 2,
        updated_at: T,
        created_at: T,
      },
    ],
    classeur_signature_sheets: [],
    classeur_intercalaires: [],
    classeur_images: [],
    classeur_periodicites: [
      { id: 1, label: 'Mensuelle', nombre: 12, sort_order: 1 },
    ],
    classeur_merge_history: [],
  })
  etat.sim = sim
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** L'export utilisateur (pour une IA) de l'état courant. */
async function exportPourIa(): Promise<ClasseurJson> {
  const c = await fetchClasseur(5)
  if (c === null) throw new Error('classeur absent')
  const chapters = await fetchChapters(5)
  const content = await fetchContentParChapitres(chapters.map((ch) => ch.id))
  return JSON.parse(
    JSON.stringify(
      construireExport(c, chapters, content, [
        { id: 1, label: 'Mensuelle', nombre: 12, sort_order: 1 },
      ]),
    ),
  ) as ClasseurJson
}

const points = () => sim.table('classeur_merge_history')

function attendreInstantaneLeger(snapshot: unknown) {
  const meta = (snapshot as { _metadata: Record<string, unknown> })._metadata
  expect(Object.keys(meta).sort()).toEqual([...CLES_REGISTRE].sort())
  expect('instructions' in meta).toBe(false)
  expect(typeof meta.description).toBe('string')
  expect(typeof meta.generated_at).toBe('string')
  expect(typeof meta.note).toBe('string')
  expect(typeof meta.schema).toBe('object')
  expect(meta.periodicites).toEqual([{ id: 1, label: 'Mensuelle', nombre: 12 }])
  // Toujours lisible par le même lecteur que l'import.
  expect(() => parseImportJson(JSON.stringify(snapshot))).not.toThrow()
}

describe('instantanés sans mode d’emploi (D6)', () => {
  it('l’export pour une IA, lui, garde son mode d’emploi', async () => {
    const e = await exportPourIa()
    expect(e._metadata?.instructions?.length).toBeGreaterThan(5)
  })

  it('point manuel (creerPoint) : cinq clés, pas d’instructions', async () => {
    const id = await creerPoint(5, { kind: 'manuel', label: 'Jalon' })
    expect(id).not.toBeNull()
    expect(points()).toHaveLength(1)
    attendreInstantaneLeger(points()[0].snapshot)
  })

  it('fusion d’un export pour une IA : l’instantané pris avant n’a pas d’instructions', async () => {
    const fichier = await exportPourIa()
    fichier.chapters[0].items[0].content = 'Accueillir avec le sourire.'
    await appliquerFusion(5, fichier, { replace: true, sourceName: 'IA.json' })
    const fusion = points().filter((p) => p.kind === 'fusion')
    expect(fusion).toHaveLength(1)
    attendreInstantaneLeger(fusion[0].snapshot)
  })

  it('restauration : point de sécurité léger, et retour EXACT à l’état du point', async () => {
    const id = await creerPoint(5, { kind: 'manuel', label: 'Avant' })
    if (id === null) throw new Error('point non écrit')
    const d = sim.table('classeur_documents').find((l) => l.id === 500)
    if (d !== undefined) d.content = 'Texte changé.'
    const s = sim.table('classeur_tracking_sheets').find((l) => l.id === 700)
    if (s !== undefined) s.title = 'Renommé'
    const r = await restaurerInstantane(id)
    expect(r).not.toBeNull()
    const securite = points().filter((p) => p.kind === 'securite')
    expect(securite).toHaveLength(1)
    attendreInstantaneLeger(securite[0].snapshot)
    expect(
      sim.table('classeur_documents').find((l) => l.id === 500)?.content,
    ).toBe('Accueillir.')
    expect(
      sim.table('classeur_tracking_sheets').find((l) => l.id === 700),
    ).toMatchObject({ title: 'Contrôle extincteurs', periodicite_id: 1 })
    // Rejouer : l'état est déjà celui du point, rien n'est écrit (le libellé
    // `periodicite` des feuilles de suivi ne fausse pas la comparaison).
    expect(await restaurerInstantane(id)).toBeNull()
  })
})
