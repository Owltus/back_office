import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * `UNIQUE (uuid)` sur TOUTE la table (chapitres et 4 familles d'éléments,
 * pas par classeur — fait de la base relevé le 2026-10-04 par la relecture
 * adverse du transfert). Le simulateur ne modélise pas l'unicité : on
 * l'émule par une politique `check` à l'insert et à l'update (le refus y
 * prend la forme d'un 42501 au lieu d'un 23505 — c'est la collision qui
 * compte, pas son code).
 *
 *  (A) « Importer classeur » (nouveau classeur depuis un export) reprenait
 *      les uuid du fichier : collision dès le premier chapitre si le fichier
 *      est l'export d'un classeur de cette base, classeur laissé incomplet.
 *  (B) une fusion qui apparie un élément par TITRE lui donnait l'uuid du
 *      fichier (E6) — l'uuid d'un élément d'un AUTRE classeur, invisible
 *      d'ici : collision, fusion interrompue au milieu.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { reinitialiserPointsAuto } =
  await import('#/lib/classeur/restauration.ts')
const { restaurerInstantane } = await import('#/lib/classeur/merge/history.ts')
const { appliquerFusion, importerCommeNouveauClasseur } =
  await import('#/lib/classeur/merge/apply.ts')
const { construireExport } = await import('#/lib/classeur/merge/schema.ts')
const { fetchClasseur, fetchChaptersAvecSupprimes, fetchContentAvecSupprimes } =
  await import('#/lib/classeur/service.ts')

const T = '2026-09-20T10:00:00.000Z'
const U_CH20 = '00000000-0000-4000-8000-000000000020'
const U_CH50 = '00000000-0000-4000-8000-000000000050'
const U_DOC100 = 'aaaaaaaa-0000-4000-8000-000000000100'
const U_DOC500 = 'aaaaaaaa-0000-4000-8000-000000000500'

function classeur(id: number) {
  return {
    id,
    uuid: `c-${String(id)}`,
    name: `Classeur ${String(id)}`,
    icon: 'book',
    etablissement: 'OKKO Nantes',
    etablissement_complement: '',
    created_by: null,
    acces_tous: 'lecture',
    sort_order: id,
    created_at: T,
    updated_at: T,
  }
}

const chapitre = (
  id: number,
  uuid: string,
  classeur_id: number,
  label: string,
) => ({
  id,
  uuid,
  classeur_id,
  label,
  icon: '',
  description: '',
  sort_order: 1,
  updated_at: T,
  created_at: T,
})

const doc = (
  id: number,
  uuid: string,
  chapter_id: number,
  content: string,
) => ({
  id,
  uuid,
  chapter_id,
  title: 'Procédure',
  description: '',
  content,
  version_majeure: 1,
  version_mineure: 0,
  sort_order: 1,
  updated_at: T,
  created_at: T,
})

const TABLES_UUID = [
  'classeur_chapters',
  'classeur_documents',
  'classeur_tracking_sheets',
  'classeur_signature_sheets',
  'classeur_intercalaires',
]

let sim: SimulateurSupabase

/** Émule `UNIQUE (uuid)` (toute la table) à l'insert et à l'update. */
function uuidUnique() {
  for (const table of TABLES_UUID) {
    const libre = (l: Ligne) =>
      l.uuid == null ||
      !sim.table(table).some((d) => d.uuid === l.uuid && d.id !== l.id)
    sim.politique(table, 'insert', { check: libre })
    sim.politique(table, 'update', { check: libre })
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-04T08:00:00.000Z'))
  reinitialiserPointsAuto()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sim = new SimulateurSupabase({
    classeur_classeurs: [classeur(2), classeur(5)],
    classeur_chapters: [
      chapitre(20, U_CH20, 2, 'Réception'),
      chapitre(50, U_CH50, 5, 'Arrivée'),
    ],
    classeur_documents: [
      doc(100, U_DOC100, 20, 'Ouvrir la porte.'),
      doc(500, U_DOC500, 50, 'Accueillir.'),
    ],
    classeur_tracking_sheets: [],
    classeur_signature_sheets: [],
    classeur_intercalaires: [],
    classeur_images: [],
    classeur_periodicites: [
      { id: 1, label: 'Mensuelle', nombre: 12, sort_order: 1 },
    ],
    classeur_merge_history: [],
  })
  etat.sim = sim
  uuidUnique()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Export v2 du classeur `id`, tel que le bouton « Exporter en JSON » le rend. */
async function exporter(id: number): Promise<ClasseurJson> {
  const c = await fetchClasseur(id)
  if (c === null) throw new Error('classeur absent')
  const chapters = await fetchChaptersAvecSupprimes(id)
  const content = await fetchContentAvecSupprimes(chapters.map((ch) => ch.id))
  return JSON.parse(
    JSON.stringify(construireExport(c, chapters, content, [])),
  ) as ClasseurJson
}

const vivants = (table: string) =>
  sim.table(table).filter((l) => l.deleted_at == null)

describe('(A) importer comme NOUVEAU classeur l’export d’un classeur de la base', () => {
  it('réussit : chapitres et éléments reçoivent des uuid neufs, l’original est intact', async () => {
    const fichier = await exporter(2)
    const id = await importerCommeNouveauClasseur(fichier)
    const chapitres = vivants('classeur_chapters').filter(
      (c) => c.classeur_id === id,
    )
    expect(chapitres.map((c) => c.label)).toEqual(['Réception'])
    expect(chapitres[0].uuid).not.toBe(U_CH20)
    const docs = vivants('classeur_documents').filter(
      (d) => d.chapter_id === chapitres[0].id,
    )
    expect(docs.map((d) => d.content)).toEqual(['Ouvrir la porte.'])
    expect(docs[0].uuid).not.toBe(U_DOC100)
    // L'original n'a pas bougé.
    expect(
      sim.table('classeur_documents').find((d) => d.id === 100),
    ).toMatchObject({ uuid: U_DOC100, chapter_id: 20 })
  })

  it('un échec au milieu : erreur CLAIRE qui dit que le classeur créé est incomplet', async () => {
    const fichier = await exporter(2)
    sim.politique('classeur_documents', 'insert', { check: () => false })
    await expect(importerCommeNouveauClasseur(fichier)).rejects.toThrow(
      /incomplet/,
    )
  })
})

describe('(B) fusion : un élément apparié par TITRE ne prend pas l’uuid du fichier', () => {
  it('l’export du classeur 2 fusionné dans le 5 : le document local est modifié, son uuid reste le sien', async () => {
    const fichier = await exporter(2)
    // Remplacement (le fichier fait foi ; en fusion, R7 le jugerait aussi
    // ancien que le local), appliqué deux fois. Le chapitre du fichier (uuid
    // du classeur 2, inconnu ici) s'apparie par
    // libellé au chapitre « Arrivée » ; son document par titre au doc 500.
    fichier.chapters[0].label = 'Arrivée'
    for (let passe = 0; passe < 2; passe++) {
      await appliquerFusion(5, fichier, { replace: true, sourceName: 'essai' })
      expect(
        sim.table('classeur_documents').find((d) => d.id === 500),
      ).toMatchObject({ uuid: U_DOC500, content: 'Ouvrir la porte.' })
    }
    // Restaurer le point pris avant la fusion : l'état d'avant revient.
    const point = sim
      .table('classeur_merge_history')
      .find((p) => p.classeur_id === 5 && p.kind === 'fusion')
    await restaurerInstantane(point?.id as number)
    const d500 = sim.table('classeur_documents').find((d) => d.id === 500)
    expect(d500).toMatchObject({ uuid: U_DOC500, content: 'Accueillir.' })
    expect(d500?.deleted_at ?? null).toBeNull()
  })
})
