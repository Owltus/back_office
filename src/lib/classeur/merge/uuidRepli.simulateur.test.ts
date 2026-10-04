import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'

/*
 * Fusion dans un classeur Y de l'export d'un AUTRE classeur X (décision du
 * 2026-10-04, « piste 2 »). `UNIQUE (uuid)` porte sur toute la table : les
 * créations du plan reprennent les uuid de X et sont refusées en 23505.
 * L'exécution les réessaie UNE fois sans uuid et le dit.
 *
 * L'unicité est émulée à la frontière du service, avec la FORME de l'erreur
 * PostgREST réelle (code 23505, contrainte `<table>_uuid_key`, détail
 * « Key (uuid)=(…) already exists. ») : le simulateur, lui, ne sait rendre
 * qu'un 42501.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const TABLE: Record<ItemKind, string> = {
  document: 'classeur_documents',
  tracking_sheet: 'classeur_tracking_sheets',
  signature_sheet: 'classeur_signature_sheets',
  intercalaire: 'classeur_intercalaires',
}

function garde(table: string, uuid: string | undefined): void {
  if (uuid === undefined) return
  if (etat.sim.table(table).some((l) => l.uuid === uuid)) {
    throw {
      code: '23505',
      message: `duplicate key value violates unique constraint "${table}_uuid_key"`,
      details: `Key (uuid)=(${uuid}) already exists.`,
      hint: null,
    }
  }
}

vi.mock('#/lib/classeur/service.ts', async (importOriginal) => {
  const reel =
    await importOriginal<typeof import('#/lib/classeur/service.ts')>()
  return {
    ...reel,
    createChapter: (async (classeurId, input, options = {}) => {
      garde('classeur_chapters', options.uuid)
      return reel.createChapter(classeurId, input, options)
    }) as typeof reel.createChapter,
    createItem: (async (chapterId, item, options = {}) => {
      garde(TABLE[item.kind], options.uuid)
      return reel.createItem(chapterId, item, options)
    }) as typeof reel.createItem,
  }
})

const { reinitialiserPointsAuto } =
  await import('#/lib/classeur/restauration.ts')
const { restaurerInstantane } = await import('#/lib/classeur/merge/history.ts')
const { appliquerFusion, appliquerFusionPortee } =
  await import('#/lib/classeur/merge/apply.ts')
const { construireExport } = await import('#/lib/classeur/merge/schema.ts')
const {
  fetchClasseur,
  fetchChaptersAvecSupprimes,
  fetchContentAvecSupprimes,
  insertMergeHistory,
} = await import('#/lib/classeur/service.ts')

const T = '2026-09-20T10:00:00.000Z'
const U_CH20 = '00000000-0000-4000-8000-000000000020'
const U_CH50 = '00000000-0000-4000-8000-000000000050'
const U_DOC100 = 'aaaaaaaa-0000-4000-8000-000000000100'
const U_DOC500 = 'aaaaaaaa-0000-4000-8000-000000000500'
const AVERTISSEMENT_2 =
  '2 éléments ont reçu un nouvel identifiant : ils existaient ailleurs.'

const classeur = (id: number) => ({
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
})

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
  title: string,
  content: string,
) => ({
  id,
  uuid,
  chapter_id,
  title,
  description: '',
  content,
  version_majeure: 1,
  version_mineure: 0,
  sort_order: 1,
  updated_at: T,
  created_at: T,
})

let sim: SimulateurSupabase

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
      doc(100, U_DOC100, 20, 'Procédure', 'Ouvrir la porte.'),
      doc(500, U_DOC500, 50, 'Accueil', 'Accueillir.'),
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
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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
const chapitresDe = (classeurId: number) =>
  vivants('classeur_chapters').filter((c) => c.classeur_id === classeurId)
const docsDe = (chapterId: unknown) =>
  vivants('classeur_documents').filter((d) => d.chapter_id === chapterId)

describe('fusion dans Y de l’export de X : uuid déjà pris ailleurs', () => {
  it('aboutit : chapitre et document créés avec des uuid NEUFS, avertissement, X intact', async () => {
    const r = await appliquerFusion(5, await exporter(2), {
      replace: false,
      sourceName: 'Classeur 2.json',
    })
    expect(r).toMatchObject({ inserted: 2, avertissements: [AVERTISSEMENT_2] })
    const reception = chapitresDe(5).find((c) => c.label === 'Réception')
    expect(reception).toBeDefined()
    expect(reception?.uuid).not.toBe(U_CH20)
    // Le document vise le chapitre RECRÉÉ (résolution de l'index `nouveau`).
    const docs = docsDe(reception?.id)
    expect(docs.map((d) => d.content)).toEqual(['Ouvrir la porte.'])
    expect(docs[0].uuid).not.toBe(U_DOC100)
    expect(
      sim.table('classeur_documents').find((d) => d.id === 100),
    ).toMatchObject({ uuid: U_DOC100, chapter_id: 20 })
  })

  it('rejouée (fusion) : appariée par libellé et par titre, AUCUNE nouvelle création ni avertissement', async () => {
    const fichier = await exporter(2)
    await appliquerFusion(5, fichier, { replace: false, sourceName: 's' })
    const avant = sim.table('classeur_documents').length
    const r2 = await appliquerFusion(5, fichier, {
      replace: false,
      sourceName: 's',
    })
    expect(r2).toMatchObject({ inserted: 0, updated: 0, deleted: 0 })
    expect(r2.avertissements).toBeUndefined()
    expect(sim.table('classeur_documents')).toHaveLength(avant)
    expect(chapitresDe(5).filter((c) => c.label === 'Réception')).toHaveLength(
      1,
    )
  })

  it('rejouée (remplacement) : la seconde passe ne crée rien de plus', async () => {
    const fichier = await exporter(2)
    const r1 = await appliquerFusion(5, fichier, {
      replace: true,
      sourceName: 's',
    })
    expect(r1.avertissements).toEqual([AVERTISSEMENT_2])
    const lignes = sim.table('classeur_documents').length
    const r2 = await appliquerFusion(5, fichier, {
      replace: true,
      sourceName: 's',
    })
    expect(r2).toMatchObject({ inserted: 0, deleted: 0 })
    expect(sim.table('classeur_documents')).toHaveLength(lignes)
  })

  it('un export de Y dans Y (cas normal) : aucun réessai, aucun avertissement', async () => {
    const r = await appliquerFusion(5, await exporter(5), {
      replace: true,
      sourceName: 's',
    })
    expect(r.avertissements).toBeUndefined()
  })
})

describe('fusion de PORTÉE et restauration passent par le même repli', () => {
  it('portée chapitre : un élément au uuid d’un autre classeur est créé, avertissement au singulier', async () => {
    const fichier = await exporter(5)
    fichier.chapters[0].items.push({
      kind: 'document',
      uuid: U_DOC100,
      title: 'Copie',
      content: 'x',
      sort_order: 2,
    })
    // Portée = un seul chapitre : garder celui d'Arrivée.
    fichier.chapters = fichier.chapters.slice(0, 1)
    const r = await appliquerFusionPortee(
      5,
      fichier,
      { type: 'chapitre', chapitreId: 50 },
      { supprimerAbsents: false, sourceName: 's' },
    )
    expect(r.avertissements).toEqual([
      '1 élément a reçu un nouvel identifiant : il existait ailleurs.',
    ])
    expect(docsDe(50).map((d) => d.title)).toEqual(['Accueil', 'Copie'])
  })

  it('restauration : un élément dont l’uuid vit désormais ailleurs revient avec un uuid neuf', async () => {
    const instantane = await exporter(5)
    const pointId = await insertMergeHistory({
      classeur_id: 5,
      kind: 'manuel',
      label: 'avant',
      source_name: '',
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      snapshot: instantane,
    })
    // Le doc 500 est parti dans le classeur 2 EN GARDANT son uuid (ce que
    // faisait le transfert avant b3911c2).
    const d500 = sim.table('classeur_documents').find((d) => d.id === 500)
    if (d500 !== undefined) d500.chapter_id = 20
    const r = await restaurerInstantane(pointId)
    expect(r?.avertissements).toEqual([
      '1 élément a reçu un nouvel identifiant : il existait ailleurs.',
    ])
    const revenus = docsDe(50)
    expect(revenus.map((d) => d.content)).toEqual(['Accueillir.'])
    expect(revenus[0].uuid).not.toBe(U_DOC500)
  })
})
