import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { RefEcriture } from '#/lib/classeur/service.ts'

/*
 * Défauts d'écriture corrigés à l'étape 7b, contre le SIMULATEUR PostgREST
 * (la base de production n'est jamais touchée). Un refus RLS y rend 0 ligne
 * SANS erreur, comme la vraie base : c'est ce que le service prenait pour un
 * succès.
 *   (a) `moveItems` : refus détecté, point sur l'origine ET l'arrivée ;
 *   (b) `updateItem` (toutes familles) et `ecrireDocumentVersionne` : refus
 *       détecté, sans casser la détection des COURSES (`updated_at`).
 * Valeurs attendues écrites à la main.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const {
  definirGardeEcriture,
  definirOubliDeplacement,
  moveItems,
  sauvegarderDocumentSiInchange,
  updateItem,
} = await import('#/lib/classeur/service.ts')

const T = '2026-09-20T10:00:00.000Z'

function nouveau(): SimulateurSupabase {
  return new SimulateurSupabase({
    classeur_chapters: [
      { id: 1, classeur_id: 24, label: 'A', sort_order: 1, updated_at: T },
      { id: 2, classeur_id: 24, label: 'B', sort_order: 2, updated_at: T },
    ],
    classeur_documents: [
      {
        id: 10,
        chapter_id: 1,
        title: 'Procédure',
        description: '',
        content: 'Ouvrir la porte.',
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 1,
        updated_at: T,
      },
      {
        id: 11,
        chapter_id: 2,
        title: 'Déjà là',
        description: '',
        content: '',
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 4,
        updated_at: T,
      },
    ],
    classeur_intercalaires: [
      {
        id: 12,
        chapter_id: 1,
        title: 'Séparateur',
        description: '',
        sort_order: 2,
        updated_at: T,
      },
    ],
    classeur_tracking_sheets: [],
    classeur_signature_sheets: [],
  })
}

let sim: SimulateurSupabase
/** Appels de la garde, avec le nombre d'appels base déjà faits à cet instant. */
let gardes: Array<{ ref: RefEcriture; appelsAvant: number }>

function ligne(table: string, id: number) {
  const l = sim.tables[table].find((x) => x.id === id)
  if (!l) throw new Error('ligne absente')
  return l
}

/** Rang (1 = premier) du premier appel d'écriture du journal. */
function premiereEcriture(): number {
  return (
    sim.journal.findIndex(
      (j) => j.operation !== 'select' && !j.cible.startsWith('storage'),
    ) + 1
  )
}

beforeEach(() => {
  sim = nouveau()
  etat.sim = sim
  gardes = []
  definirGardeEcriture(async (ref) => {
    gardes.push({ ref, appelsAvant: sim.journal.length })
  })
  definirOubliDeplacement(null)
})

describe('(a) moveItems', () => {
  const refs = [
    { kind: 'document' as const, id: 10 },
    { kind: 'intercalaire' as const, id: 12 },
  ]

  it('déplace en fin du chapitre cible, dans l’ordre donné', async () => {
    await moveItems(refs, 2)
    expect(ligne('classeur_documents', 10)).toMatchObject({
      chapter_id: 2,
      sort_order: 5,
    })
    expect(ligne('classeur_intercalaires', 12)).toMatchObject({
      chapter_id: 2,
      sort_order: 6,
    })
  })

  it('point de restauration sur l’ORIGINE puis sur l’ARRIVÉE, avant toute écriture', async () => {
    await moveItems(refs, 2)
    expect(gardes.map((g) => g.ref)).toEqual([
      { kind: 'document', id: 10 },
      { chapterId: 2 },
    ])
    const ecriture = premiereEcriture()
    expect(ecriture).toBeGreaterThan(0)
    for (const g of gardes) expect(g.appelsAvant).toBeLessThan(ecriture)
  })

  it('refus RLS (0 ligne, aucune erreur) : erreur 42501, plus un succès annoncé', async () => {
    sim.refuser('classeur_documents', 'update')
    await expect(moveItems(refs, 2)).rejects.toMatchObject({ code: '42501' })
    expect(ligne('classeur_documents', 10).chapter_id).toBe(1)
    // Séquentiel : rien n'est écrit après le refus.
    expect(ligne('classeur_intercalaires', 12).chapter_id).toBe(1)
  })

  it('refus du chapitre d’ARRIVÉE seulement (WITH CHECK) : erreur, rien n’a bougé', async () => {
    sim.politique('classeur_documents', 'update', {
      check: (l) => l.chapter_id !== 2,
    })
    await expect(moveItems(refs, 2)).rejects.toMatchObject({ code: '42501' })
    expect(ligne('classeur_documents', 10).chapter_id).toBe(1)
  })

  it('oublie la résolution mémorisée de chaque élément déplacé', async () => {
    const oublis: unknown[] = []
    definirOubliDeplacement((r) => oublis.push(...r))
    await moveItems(refs, 2)
    expect(oublis).toEqual(refs)
  })

  it('aucune référence : rien, pas même un point', async () => {
    await moveItems([], 2)
    expect(gardes).toEqual([])
    expect(sim.journal).toEqual([])
  })
})

describe('(b) updateItem', () => {
  it('famille non-document : refus RLS = erreur 42501', async () => {
    sim.refuser('classeur_intercalaires', 'update')
    await expect(
      updateItem('intercalaire', 12, { title: 'Nouveau' }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('famille non-document : écrit quand c’est permis', async () => {
    await updateItem('intercalaire', 12, { title: 'Nouveau' })
    expect(ligne('classeur_intercalaires', 12).title).toBe('Nouveau')
  })

  it('document : refus RLS = erreur 42501, détecté sans épuiser les essais', async () => {
    sim.refuser('classeur_documents', 'update')
    await expect(
      updateItem('document', 10, { content: 'Fermer la porte.' }),
    ).rejects.toMatchObject({ code: '42501' })
    const updates = sim.journal.filter(
      (j) => j.cible === 'classeur_documents' && j.operation === 'update',
    )
    // Un essai gardé, la relecture montre le même état : refus, pas course.
    expect(updates).toHaveLength(1)
    expect(ligne('classeur_documents', 10).content).toBe('Ouvrir la porte.')
  })

  it('document illisible ET non modifiable : erreur 42501', async () => {
    sim.refuser('classeur_documents', 'select')
    sim.refuser('classeur_documents', 'update')
    await expect(
      updateItem('document', 10, { content: 'x' }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('document sans champ de texte (ordre seul) refusé : erreur 42501', async () => {
    sim.refuser('classeur_documents', 'update')
    await expect(
      updateItem('document', 10, { sort_order: 9 }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('COURSE : un collègue écrit entre la lecture et l’écriture → nouveau calcul, écrit', async () => {
    let fait = false
    sim.surAppel = (_n, cible, operation) => {
      if (!fait && cible === 'classeur_documents' && operation === 'update') {
        fait = true
        const l = ligne('classeur_documents', 10)
        l.content = 'Ouvrir la porte, puis la fermer.'
        l.version_mineure = 1
        l.updated_at = '2026-09-21T10:00:00.000Z'
      }
    }
    await updateItem('document', 10, { content: 'Fermer la porte.' })
    const l = ligne('classeur_documents', 10)
    expect(l.content).toBe('Fermer la porte.')
    // Numéro calculé depuis l'état du collègue (1.1), pas depuis 1.0.
    expect(
      Number(l.version_majeure) * 10 + Number(l.version_mineure),
    ).toBeGreaterThan(11)
  })

  it('TROIS courses de suite : écriture finale relue, réussie', async () => {
    let n = 0
    sim.surAppel = (_k, cible, operation) => {
      if (cible === 'classeur_documents' && operation === 'update' && n < 3) {
        n += 1
        ligne('classeur_documents', 10).updated_at =
          `2026-09-2${String(n)}T11:00:00.000Z`
      }
    }
    await updateItem('document', 10, { content: 'Fermer la porte.' })
    expect(ligne('classeur_documents', 10).content).toBe('Fermer la porte.')
  })
})

describe('(b) écriture finale après trois courses', () => {
  it('refusée : erreur 42501 (elle était la dernière écriture non relue)', async () => {
    let n = 0
    sim.surAppel = (_k, cible, operation) => {
      if (cible !== 'classeur_documents' || operation !== 'update') return
      n += 1
      if (n <= 3) {
        ligne('classeur_documents', 10).updated_at =
          `2026-09-2${String(n)}T11:00:00.000Z`
      } else {
        sim.refuser('classeur_documents', 'update')
      }
    }
    await expect(
      updateItem('document', 10, { content: 'Fermer la porte.' }),
    ).rejects.toMatchObject({ code: '42501' })
    expect(n).toBe(4)
  })
})

describe('(b) sauvegarderDocumentSiInchange : le conflit reste un conflit', () => {
  it('un collègue a sauvegardé : conflit, rien d’écrit', async () => {
    ligne('classeur_documents', 10).updated_at = '2026-09-22T10:00:00.000Z'
    const r = await sauvegarderDocumentSiInchange(
      10,
      { content: 'Fermer la porte.' },
      T,
    )
    expect(r).toEqual({
      statut: 'conflit',
      updatedAt: '2026-09-22T10:00:00.000Z',
    })
    expect(ligne('classeur_documents', 10).content).toBe('Ouvrir la porte.')
  })

  it('même version mais refus RLS : 42501, pas un conflit', async () => {
    sim.refuser('classeur_documents', 'update')
    await expect(
      sauvegarderDocumentSiInchange(10, { content: 'x' }, T),
    ).rejects.toMatchObject({ code: '42501' })
  })
})
