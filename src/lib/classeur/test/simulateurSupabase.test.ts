import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'

/*
 * Témoins du simulateur lui-même : s'il ment, tous les tests qui
 * s'appuieront dessus (corbeille, transfert, déplacement) mentiront aussi.
 * Valeurs écrites à la main, jamais recopiées d'une sortie.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { sauvegarderDocumentSiInchange } =
  await import('#/lib/classeur/service.ts')

const V1 = '2026-09-27T07:35:19.817052+00:00'

function nouveau(): SimulateurSupabase {
  return new SimulateurSupabase({
    classeur_chapters: [
      { id: 1, classeur_id: 10, title: 'A', updated_at: V1 },
      { id: 2, classeur_id: 20, title: 'B', updated_at: V1 },
    ],
    classeur_documents: [
      {
        id: 17,
        chapter_id: 1,
        title: 'Titre',
        description: '',
        content: 'avant',
        version_majeure: 1,
        version_mineure: 0,
        updated_at: V1,
        deleted_at: null,
      },
      {
        id: 18,
        chapter_id: 1,
        content: 'jeté',
        updated_at: V1,
        deleted_at: V1,
      },
    ],
    classeur_document_versions: [{ id: 1, document_id: 17, classeur_id: 10 }],
  })
}

let sim: SimulateurSupabase
beforeEach(() => {
  sim = nouveau()
  etat.sim = sim
})

const docs = () => sim.client.from('classeur_documents')
const statut = (r: { error: unknown }) =>
  (r.error as { statusCode?: string } | null)?.statusCode

describe('simulateur Supabase — témoins', () => {
  it('update refusé par la RLS : 0 ligne, AUCUNE erreur, rien d’écrit', async () => {
    sim.refuser('classeur_documents', 'update')
    const r = await docs().update({ content: 'moi' }).eq('id', 17).select('id')
    expect(r).toEqual({ data: [], error: null })
    expect(sim.table('classeur_documents')[0].content).toBe('avant')
  })

  it('select sans filtre deleted_at : les supprimés sont rendus aussi', async () => {
    const tous = await docs().select('id').order('id')
    expect(tous.data).toEqual([{ id: 17 }, { id: 18 }])
    const vivants = await docs().select('id').is('deleted_at', null)
    expect(vivants.data).toEqual([{ id: 17 }])
  })

  it('panne au 2e appel : erreur PostgREST, sans effet ; le 3e repasse', async () => {
    sim.panneAuAppel(2)
    const a = await docs().update({ content: 'un' }).eq('id', 17).select('id')
    const b = await docs().update({ content: 'deux' }).eq('id', 17).select('id')
    expect(a).toEqual({ data: [{ id: 17 }], error: null })
    expect(b.data).toBeNull()
    expect(b.error?.code).toBe('08006')
    expect(sim.table('classeur_documents')[0].content).toBe('un')
    const c = await docs().update({ content: 'trois' }).eq('id', 17)
    expect(c.error).toBeNull()
    expect(sim.table('classeur_documents')[0].content).toBe('trois')
  })

  it('classeur_stamp : updated_at posé, sauf s’il est fourni et différent', async () => {
    await docs().update({ content: 'x' }).eq('id', 17)
    const pose = sim.table('classeur_documents')[0].updated_at
    expect(pose).not.toBe(V1)
    await docs().update({ content: 'y', updated_at: pose }).eq('id', 17)
    expect(sim.table('classeur_documents')[0].updated_at).not.toBe(pose)
    await docs().update({ updated_at: '2020-01-01T00:00:00.000Z' }).eq('id', 17)
    expect(sim.table('classeur_documents')[0].updated_at).toBe(
      '2020-01-01T00:00:00.000Z',
    )
  })

  it('classeur_versions_suivent : l’historique suit le document et le chapitre', async () => {
    await docs().update({ chapter_id: 2 }).eq('id', 17)
    expect(sim.table('classeur_document_versions')[0].classeur_id).toBe(20)
    await sim.client
      .from('classeur_chapters')
      .update({ classeur_id: 30 })
      .eq('id', 2)
    expect(sim.table('classeur_document_versions')[0].classeur_id).toBe(30)
  })

  it('insert refusé : 42501 ; stockage copy puis remove', async () => {
    sim.refuser('classeur_documents', 'insert')
    const r = await docs().insert({ content: 'z' }).select('id')
    expect(r.error?.code).toBe('42501')
    expect(sim.table('classeur_documents')).toHaveLength(2)

    const b = sim.client.storage.from('classeur-images')
    await b.upload('1/a.webp', 'octets')
    expect((await b.copy('1/a.webp', '2/a.webp')).error).toBeNull()
    expect((await b.copy('1/absent.webp', '2/x.webp')).error).not.toBeNull()
    expect((await b.remove(['1/a.webp'])).data).toEqual([{ name: '1/a.webp' }])
    expect([...sim.stockage['classeur-images'].keys()]).toEqual(['2/a.webp'])
  })

  it('politique : using masque (0 ligne), check refuse la NOUVELLE ligne (42501)', async () => {
    sim.politique('classeur_documents', 'update', {
      using: (l) => l.id !== 17,
      check: (l) => l.content !== 'interdit',
    })
    const masque = await docs()
      .update({ content: 'a' })
      .eq('id', 17)
      .select('id')
    expect(masque).toEqual({ data: [], error: null })
    const refuse = await docs()
      .update({ content: 'interdit' })
      .eq('id', 18)
      .select('id')
    expect(refuse.error?.code).toBe('42501')
    expect(sim.table('classeur_documents')[1].content).not.toBe('interdit')
    sim.politique('classeur_documents', 'insert', {
      check: (l) => l.chapter_id === 7,
    })
    expect((await docs().insert({ chapter_id: 8 })).error?.code).toBe('42501')
    expect((await docs().insert({ chapter_id: 7 })).error).toBeNull()
  })

  it('stockage sous RLS : lecture de la source, insert de la destination, ni écrasement ni upsert', async () => {
    const b = sim.client.storage.from('classeur-images')
    await b.upload('1/a.webp', 'octets')
    await b.upload('2/b.webp', 'autre')
    sim.politiqueStockage('classeur-images', 'select', (c) =>
      c.startsWith('1/'),
    )
    sim.politiqueStockage('classeur-images', 'insert', (c) =>
      c.startsWith('2/'),
    )
    sim.politiqueStockage('classeur-images', 'delete', (c) =>
      c.startsWith('2/'),
    )
    expect((await b.copy('2/b.webp', '2/c.webp')).error?.message).toBe(
      'Object not found',
    )
    expect(statut(await b.copy('1/a.webp', '1/c.webp'))).toBe('403')
    expect(statut(await b.copy('1/a.webp', '2/b.webp'))).toBe('409')
    const avecUpsert = await b.copy('1/a.webp', '2/d.webp', { upsert: true })
    expect(statut(avecUpsert)).toBe('403')
    expect(sim.journal.at(-1)?.options).toEqual({ upsert: true })
    expect((await b.copy('1/a.webp', '2/d.webp')).error).toBeNull()
    // remove : ce que la policy refuse est ignoré EN SILENCE.
    expect((await b.remove(['1/a.webp', '2/d.webp'])).data).toEqual([
      { name: '2/d.webp' },
    ])
    sim.refuserStockage('classeur-images', 'remove')
    expect(await b.remove(['2/b.webp'])).toEqual({ data: [], error: null })
  })

  it('surAppel : appelé AVANT l’exécution, avec le rang de l’appel', async () => {
    const vus: string[] = []
    sim.surAppel = (n, cible, op) => {
      vus.push(`${String(n)}:${cible}:${op}`)
      sim.table('classeur_documents')[0].content = 'collègue'
    }
    const r = await docs().select('content').eq('id', 17).single()
    expect(r.data).toEqual({ content: 'collègue' })
    expect(vus).toEqual(['1:classeur_documents:select'])
  })
})

describe('sauvegarderDocumentSiInchange sur le simulateur', () => {
  it('un collègue a sauvegardé entre-temps : conflit, RIEN d’écrit', async () => {
    const T2 = '2026-09-27T09:00:00.000001+00:00'
    Object.assign(sim.table('classeur_documents')[0], {
      updated_at: T2,
      content: 'collègue',
    })
    const r = await sauvegarderDocumentSiInchange(17, { content: 'moi' }, V1)
    expect(r).toEqual({ statut: 'conflit', updatedAt: T2 })
    expect(sim.table('classeur_documents')[0].content).toBe('collègue')
  })

  it('inchangé depuis le début : écrit, nouvel updated_at rendu', async () => {
    const r = await sauvegarderDocumentSiInchange(17, { content: 'moi' }, V1)
    expect(r.statut).toBe('ok')
    expect(r.updatedAt).not.toBe(V1)
    expect(sim.table('classeur_documents')[0].content).toBe('moi')
  })

  it('refus RLS (même version, rien d’écrit) : 42501', async () => {
    sim.refuser('classeur_documents', 'update')
    await expect(
      sauvegarderDocumentSiInchange(17, { content: 'moi' }, V1),
    ).rejects.toMatchObject({ code: '42501' })
  })
})
