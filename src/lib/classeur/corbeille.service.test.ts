import { beforeEach, describe, expect, it, vi } from 'vitest'

import { construireCorbeille } from '#/lib/classeur/corbeille.ts'
import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { RefEcriture } from '#/lib/classeur/service.ts'

/*
 * Restauration depuis la corbeille (étape 6) contre le SIMULATEUR
 * PostgREST : la base de production n'est jamais touchée. Un refus RLS y
 * rend 0 ligne sans erreur, comme la vraie base. Valeurs attendues écrites
 * à la main.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const {
  definirGardeEcriture,
  fetchCorbeille,
  restaurerAvecChapitre,
  restaurerChapter,
  restaurerItem,
} = await import('#/lib/classeur/service.ts')

const T = '2026-09-20T10:00:00Z'
const SUPPR = '2026-09-25T10:00:00Z'

function nouveau(): SimulateurSupabase {
  return new SimulateurSupabase({
    classeur_chapters: [
      {
        id: 1,
        classeur_id: 24,
        label: 'Accueil',
        sort_order: 1,
        deleted_at: null,
        updated_at: T,
      },
      {
        id: 2,
        classeur_id: 24,
        label: 'Vide',
        sort_order: 5,
        deleted_at: null,
        updated_at: T,
      },
      {
        id: 3,
        classeur_id: 24,
        label: 'Jeté',
        sort_order: 2,
        deleted_at: SUPPR,
        updated_at: T,
      },
      // Autre classeur : jamais lu par la corbeille du 24.
      {
        id: 9,
        classeur_id: 99,
        label: 'Ailleurs',
        sort_order: 40,
        deleted_at: null,
        updated_at: T,
      },
    ],
    classeur_documents: [
      {
        id: 10,
        chapter_id: 1,
        title: 'Procédure',
        description: '',
        content: 'texte',
        version_majeure: 2,
        version_mineure: 3,
        sort_order: 1,
        deleted_at: SUPPR,
        updated_at: T,
      },
      {
        id: 11,
        chapter_id: 1,
        title: 'Actif',
        description: '',
        content: '',
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 3,
        deleted_at: null,
        updated_at: T,
      },
      {
        id: 14,
        chapter_id: 3,
        title: 'Dans le jeté',
        description: '',
        content: '',
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 4,
        deleted_at: null,
        updated_at: T,
      },
      {
        id: 90,
        chapter_id: 9,
        title: 'Autre classeur',
        description: '',
        content: '',
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 1,
        deleted_at: SUPPR,
        updated_at: T,
      },
    ],
    classeur_intercalaires: [
      {
        id: 12,
        chapter_id: 1,
        title: 'Séparateur',
        description: '',
        sort_order: 7,
        deleted_at: null,
        updated_at: T,
      },
    ],
    classeur_signature_sheets: [
      {
        id: 13,
        chapter_id: 3,
        title: 'Émargement',
        description: '',
        nombre: 10,
        sort_order: 1,
        deleted_at: SUPPR,
        updated_at: T,
      },
    ],
    classeur_tracking_sheets: [],
  })
}

let sim: SimulateurSupabase
let garde: ReturnType<typeof vi.fn<(ref: RefEcriture) => Promise<void>>>

beforeEach(() => {
  sim = nouveau()
  etat.sim = sim
  garde = vi.fn(async () => {})
  definirGardeEcriture(garde)
})

const ligne = (table: string, id: number) =>
  sim.table(table).find((l) => l.id === id) as Record<string, unknown>
const ecritures = () =>
  sim.journal.filter((j) => j.operation === 'update').map((j) => j.cible)

describe('fetchCorbeille', () => {
  it('lit tout le classeur (supprimés compris), rien des autres', async () => {
    const d = await fetchCorbeille(24)
    expect(d.chapitres.map((c) => c.id)).toEqual([1, 3, 2])
    expect(d.chapitres[0]).toEqual({
      id: 1,
      label: 'Accueil',
      sort_order: 1,
      deleted_at: null,
    })
    expect(d.elements.map((e) => `${e.kind}:${e.id}`).sort()).toEqual([
      'document:10',
      'document:11',
      'document:14',
      'intercalaire:12',
      'signature_sheet:13',
    ])
    // Colonnes légères : jamais le Markdown.
    expect(d.elements.find((e) => e.id === 10)).toEqual({
      kind: 'document',
      id: 10,
      chapter_id: 1,
      title: 'Procédure',
      deleted_at: SUPPR,
    })
    expect(
      construireCorbeille(d)
        .map((e) => e.cle)
        .sort(),
    ).toEqual(['chapitre:3', 'document:10', 'signature_sheet:13'])
  })

  it('classeur sans chapitre : aucune lecture d’éléments', async () => {
    const d = await fetchCorbeille(1234)
    expect(d).toEqual({ chapitres: [], elements: [] })
    expect(sim.journal).toHaveLength(1)
  })

  it('une panne remonte en erreur', async () => {
    sim.panneAuAppel(2)
    await expect(fetchCorbeille(24)).rejects.toMatchObject({ code: '08006' })
  })

  it('une panne de la lecture des chapitres remonte aussi', async () => {
    sim.panneAuAppel(1)
    await expect(fetchCorbeille(24)).rejects.toMatchObject({ code: '08006' })
  })
})

describe('restaurerItem — corbeille', () => {
  it('revient EN FIN de son chapitre, garde sur le classeur appelée une fois, version inchangée', async () => {
    await restaurerItem('document', 10, {}, { classeurId: 24 })
    const d = ligne('classeur_documents', 10)
    expect(d.deleted_at).toBeNull()
    expect(d.chapter_id).toBe(1)
    // Actifs du chapitre 1 : 3 (document 11) et 7 (intercalaire 12).
    expect(d.sort_order).toBe(8)
    expect(d.version_majeure).toBe(2)
    expect(d.version_mineure).toBe(3)
    expect(d.content).toBe('texte')
    expect(garde).toHaveBeenCalledTimes(1)
    expect(garde).toHaveBeenCalledWith({ classeurId: 24 })
    expect(ecritures()).toEqual(['classeur_documents'])
  })

  it('la garde passe AVANT toute écriture', async () => {
    let ecrituresAvantGarde = -1
    garde.mockImplementation(async () => {
      ecrituresAvantGarde = ecritures().length
    })
    await restaurerItem('document', 10, {}, { classeurId: 24 })
    expect(ecrituresAvantGarde).toBe(0)
  })

  it('refus RLS (0 ligne) → erreur 42501, l’élément reste dans la corbeille', async () => {
    sim.refuser('classeur_documents', 'update')
    await expect(
      restaurerItem('document', 10, {}, { classeurId: 24 }),
    ).rejects.toMatchObject({ code: '42501' })
    expect(ligne('classeur_documents', 10).deleted_at).toBe(SUPPR)
    const cles = construireCorbeille(await fetchCorbeille(24)).map((e) => e.cle)
    expect(cles).toContain('document:10')
  })

  it('élément illisible (refus de lecture) → 42501, rien d’écrit', async () => {
    sim.refuser('classeur_documents', 'select')
    await expect(
      restaurerItem('document', 10, {}, { classeurId: 24 }),
    ).rejects.toMatchObject({ code: '42501' })
    expect(ecritures()).toEqual([])
  })

  it('panne pendant l’écriture → erreur remontée', async () => {
    // 1 lecture de l'élément, 4 lectures de l'ordre, puis l'écriture.
    sim.panneAuAppel(6)
    await expect(
      restaurerItem('document', 10, {}, { classeurId: 24 }),
    ).rejects.toMatchObject({ code: '08006' })
    expect(ligne('classeur_documents', 10).deleted_at).toBe(SUPPR)
  })

  it('orphelin remis dans un AUTRE chapitre : en fin de celui-ci', async () => {
    await restaurerItem(
      'signature_sheet',
      13,
      {},
      { classeurId: 24, chapterId: 1 },
    )
    const s = ligne('classeur_signature_sheets', 13)
    expect(s.chapter_id).toBe(1)
    expect(s.sort_order).toBe(8)
    expect(s.deleted_at).toBeNull()
    // Chapitre vide : premier rang.
    await restaurerItem('document', 90, {}, { classeurId: 99, chapterId: 2 })
    expect(ligne('classeur_documents', 90).sort_order).toBe(1)
    expect(ligne('classeur_documents', 90).chapter_id).toBe(2)
  })

  it('refus RLS sur une famille autre que document → 42501', async () => {
    sim.refuser('classeur_signature_sheets', 'update')
    await expect(
      restaurerItem(
        'signature_sheet',
        13,
        {},
        { classeurId: 24, chapterId: 1 },
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('document avec texte : passe par le versionnage, à sa place de fin', async () => {
    await restaurerItem(
      'document',
      10,
      { content: 'texte entièrement réécrit pour la circonstance' },
      { classeurId: 24 },
    )
    const d = ligne('classeur_documents', 10)
    expect(d.deleted_at).toBeNull()
    expect(d.sort_order).toBe(8)
    expect(d.content).toBe('texte entièrement réécrit pour la circonstance')
    expect([d.version_majeure, d.version_mineure].join('.')).not.toBe('2.3')
  })
})

describe('restaurerItem — fusion (sans option) : comportement d’origine', () => {
  it('garde par élément, ordre et chapitre du patch respectés, pas de fin forcée', async () => {
    await restaurerItem('signature_sheet', 13, { sort_order: 2 })
    const s = ligne('classeur_signature_sheets', 13)
    expect(s.deleted_at).toBeNull()
    expect(s.sort_order).toBe(2)
    expect(s.chapter_id).toBe(3)
    expect(garde).toHaveBeenCalledWith({ kind: 'signature_sheet', id: 13 })
  })

  it('chapitre : ordre conservé', async () => {
    await restaurerChapter(3, { label: 'Revenu' })
    const c = ligne('classeur_chapters', 3)
    expect(c.deleted_at).toBeNull()
    expect(c.sort_order).toBe(2)
    expect(c.label).toBe('Revenu')
    expect(garde).toHaveBeenCalledWith({ chapterId: 3 })
  })
})

describe('restaurerChapter — corbeille', () => {
  it('revient en fin du classeur, garde une fois sur le classeur', async () => {
    await restaurerChapter(3, {}, { classeurId: 24 })
    const c = ligne('classeur_chapters', 3)
    expect(c.deleted_at).toBeNull()
    // Actifs du 24 : 1 et 5 (le classeur 99 ne compte pas).
    expect(c.sort_order).toBe(6)
    expect(garde).toHaveBeenCalledTimes(1)
    expect(garde).toHaveBeenCalledWith({ classeurId: 24 })
    // Son élément actif revient avec lui, sans écriture.
    expect(ecritures()).toEqual(['classeur_chapters'])
  })

  it('classeur sans autre chapitre actif : rang 1', async () => {
    sim.table('classeur_chapters').forEach((c) => {
      if (c.classeur_id === 24 && c.id !== 3) c.deleted_at = SUPPR
    })
    await restaurerChapter(3, {}, { classeurId: 24 })
    expect(ligne('classeur_chapters', 3).sort_order).toBe(1)
  })

  it('refus RLS → 42501, le chapitre reste supprimé', async () => {
    sim.refuser('classeur_chapters', 'update')
    await expect(
      restaurerChapter(3, {}, { classeurId: 24 }),
    ).rejects.toMatchObject({ code: '42501' })
    expect(ligne('classeur_chapters', 3).deleted_at).toBe(SUPPR)
  })
})

describe('restaurerAvecChapitre', () => {
  it('écrit le chapitre AVANT l’élément, l’élément en fin de chapitre', async () => {
    await restaurerAvecChapitre(24, 'signature_sheet', 13, 3)
    expect(ecritures()).toEqual([
      'classeur_chapters',
      'classeur_signature_sheets',
    ])
    expect(ligne('classeur_chapters', 3).deleted_at).toBeNull()
    const s = ligne('classeur_signature_sheets', 13)
    expect(s.deleted_at).toBeNull()
    expect(s.chapter_id).toBe(3)
    // Actif du chapitre 3 : document 14 au rang 4.
    expect(s.sort_order).toBe(5)
    expect(garde).toHaveBeenCalledTimes(2)
    for (const appel of garde.mock.calls) {
      expect(appel[0]).toEqual({ classeurId: 24 })
    }
  })

  it('chapitre refusé : l’élément n’est pas touché', async () => {
    sim.refuser('classeur_chapters', 'update')
    await expect(
      restaurerAvecChapitre(24, 'signature_sheet', 13, 3),
    ).rejects.toMatchObject({ code: '42501' })
    expect(ligne('classeur_signature_sheets', 13).deleted_at).toBe(SUPPR)
    expect(ecritures()).toEqual(['classeur_chapters'])
  })

  it('élément refusé après le chapitre : erreur, l’élément reste listé', async () => {
    sim.refuser('classeur_signature_sheets', 'update')
    await expect(
      restaurerAvecChapitre(24, 'signature_sheet', 13, 3),
    ).rejects.toMatchObject({ code: '42501' })
    const cles = construireCorbeille(await fetchCorbeille(24)).map((e) => e.cle)
    // Le chapitre est revenu ; l'élément, lui, est toujours à restaurer.
    expect(cles).toEqual(['document:10', 'signature_sheet:13'])
  })
})
