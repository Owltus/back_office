import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  intercalaire,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'

/*
 * Écritures RELUES du service (suite de l'étape 7b), contre le SIMULATEUR
 * PostgREST : un refus RLS y rend 0 ligne SANS erreur, comme la vraie base.
 * Pour chaque fonction :
 *   - refus RLS ⇒ erreur 42501 (avant : succès annoncé) ;
 *   - déjà dans l'état voulu (suppression faite par un collègue, ligne
 *     disparue) ⇒ pas d'erreur, et l'élément ne « réapparaît » pas ;
 *   - restauration d'un point refusée en partie ⇒ l'erreur remonte.
 * Valeurs attendues écrites à la main ; la base de production n'est jamais
 * touchée.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const service = await import('#/lib/classeur/service.ts')
const { restaurerInstantane } = await import('#/lib/classeur/merge/history.ts')
const { construireExport } = await import('#/lib/classeur/merge/schema.ts')

const SUPPRIME = '2026-09-30T08:00:00.000Z'

const CLASSEUR = classeur({ id: 24 })
const CH1 = chapitre({
  id: 1,
  classeur_id: 24,
  label: 'Accueil',
  sort_order: 1,
})
const CH2 = chapitre({ id: 2, classeur_id: 24, label: 'Caisse', sort_order: 2 })
const DOC = document({
  id: 10,
  chapter_id: 1,
  title: 'Check-in',
  content: 'Accueillir le client.',
  version_majeure: 1,
  version_mineure: 0,
  sort_order: 1,
})
const INTER = intercalaire({
  id: 12,
  chapter_id: 1,
  title: 'Séparateur',
  sort_order: 2,
})
const SUIVI = suivi({ id: 13, chapter_id: 2, title: 'Relevés', sort_order: 1 })

function nouveau(): SimulateurSupabase {
  return new SimulateurSupabase({
    classeur_classeurs: [
      CLASSEUR,
      classeur({ id: 25, uuid: 'cl-25', sort_order: 2 }),
    ] as unknown as Ligne[],
    classeur_chapters: [CH1, CH2] as unknown as Ligne[],
    classeur_documents: [DOC] as unknown as Ligne[],
    classeur_intercalaires: [INTER] as unknown as Ligne[],
    classeur_tracking_sheets: [SUIVI] as unknown as Ligne[],
    classeur_signature_sheets: [],
    classeur_periodicites: PERIODICITES as unknown as Ligne[],
    classeur_images: [
      {
        id: 50,
        classeur_id: 24,
        chemin: '24/a.webp',
        nom: 'a',
        deleted_at: null,
      },
    ],
    classeur_merge_history: [
      { id: 70, classeur_id: 24, kind: 'auto', merged_at: SUPPRIME },
      { id: 71, classeur_id: 24, kind: 'manuel', merged_at: SUPPRIME },
    ],
    classeur_acces: [
      { id: 80, classeur_id: 24, user_id: 'u-1', niveau: 'lecture' },
    ],
  })
}

let sim: SimulateurSupabase
const ligne = (table: string, id: number) =>
  sim.table(table).find((l) => l.id === id)
const REFUS = { code: '42501' }

beforeEach(() => {
  sim = nouveau()
  etat.sim = sim
  service.definirGardeEcriture(null)
})

describe('modifications ciblées : 0 ligne = refus', () => {
  it('updateChapter', async () => {
    await service.updateChapter(1, { label: 'Réception' })
    expect(ligne('classeur_chapters', 1)?.label).toBe('Réception')
    sim.refuser('classeur_chapters', 'update')
    await expect(
      service.updateChapter(1, { label: 'X' }),
    ).rejects.toMatchObject(REFUS)
    expect(ligne('classeur_chapters', 1)?.label).toBe('Réception')
  })

  it('updateClasseur', async () => {
    await service.updateClasseur(24, { name: 'Procédures' })
    expect(ligne('classeur_classeurs', 24)?.name).toBe('Procédures')
    sim.refuser('classeur_classeurs', 'update')
    await expect(
      service.updateClasseur(24, { name: 'X' }),
    ).rejects.toMatchObject(REFUS)
  })

  it('updateImage (renommage)', async () => {
    await service.updateImage(50, { nom: 'plan' })
    expect(ligne('classeur_images', 50)?.nom).toBe('plan')
    sim.refuser('classeur_images', 'update')
    await expect(service.updateImage(50, { nom: 'X' })).rejects.toMatchObject(
      REFUS,
    )
    expect(ligne('classeur_images', 50)?.nom).toBe('plan')
  })

  it('restaurerChapter (fusion, hors corbeille)', async () => {
    ligne('classeur_chapters', 2)!.deleted_at = SUPPRIME
    sim.refuser('classeur_chapters', 'update')
    await expect(service.restaurerChapter(2, {})).rejects.toMatchObject(REFUS)
    expect(ligne('classeur_chapters', 2)?.deleted_at).toBe(SUPPRIME)
  })

  it('restaurerItem non-document (fusion, hors corbeille)', async () => {
    ligne('classeur_intercalaires', 12)!.deleted_at = SUPPRIME
    await service.restaurerItem('intercalaire', 12, { title: 'Bis' })
    expect(ligne('classeur_intercalaires', 12)).toMatchObject({
      deleted_at: null,
      title: 'Bis',
    })
    ligne('classeur_intercalaires', 12)!.deleted_at = SUPPRIME
    sim.politique('classeur_intercalaires', 'update', {
      using: (l) => l.id !== 12,
    })
    await expect(
      service.restaurerItem('intercalaire', 12, {}),
    ).rejects.toMatchObject(REFUS)
    expect(ligne('classeur_intercalaires', 12)?.deleted_at).toBe(SUPPRIME)
  })
})

describe('suppressions douces : refus ⇒ 42501, déjà supprimé ⇒ succès', () => {
  const cas = [
    {
      nom: 'softDeleteChapter',
      table: 'classeur_chapters',
      id: 1,
      jouer: () => service.softDeleteChapter(1),
    },
    {
      nom: 'softDeleteItem',
      table: 'classeur_intercalaires',
      id: 12,
      jouer: () => service.softDeleteItem('intercalaire', 12),
    },
    {
      nom: 'softDeleteClasseur',
      table: 'classeur_classeurs',
      id: 24,
      jouer: () => service.softDeleteClasseur(24),
    },
    {
      nom: 'softDeleteImage',
      table: 'classeur_images',
      id: 50,
      jouer: () => service.softDeleteImage(50),
    },
  ]

  for (const c of cas) {
    it(`${c.nom} : supprime`, async () => {
      await c.jouer()
      expect(ligne(c.table, c.id)?.deleted_at).not.toBeNull()
    })

    it(`${c.nom} : refus RLS ⇒ 42501, la ligne reste`, async () => {
      sim.refuser(c.table, 'update')
      await expect(c.jouer()).rejects.toMatchObject(REFUS)
      expect(ligne(c.table, c.id)?.deleted_at).toBeNull()
    })

    it(`${c.nom} : déjà supprimé par un collègue ⇒ succès, horodatage gardé`, async () => {
      ligne(c.table, c.id)!.deleted_at = SUPPRIME
      await expect(c.jouer()).resolves.toBeUndefined()
      expect(ligne(c.table, c.id)?.deleted_at).toBe(SUPPRIME)
    })

    it(`${c.nom} : déjà supprimé, même sans droit d'écriture ⇒ succès`, async () => {
      ligne(c.table, c.id)!.deleted_at = SUPPRIME
      sim.refuser(c.table, 'update')
      await expect(c.jouer()).resolves.toBeUndefined()
      expect(ligne(c.table, c.id)?.deleted_at).toBe(SUPPRIME)
    })

    it(`${c.nom} : ligne disparue ⇒ succès`, async () => {
      sim.tables[c.table] = sim.table(c.table).filter((l) => l.id !== c.id)
      await expect(c.jouer()).resolves.toBeUndefined()
    })
  }

  it('softDeleteItems : plusieurs familles, un déjà supprimé ⇒ succès', async () => {
    ligne('classeur_documents', 10)!.deleted_at = SUPPRIME
    await service.softDeleteItems([
      { kind: 'document', id: 10 },
      { kind: 'intercalaire', id: 12 },
      { kind: 'tracking_sheet', id: 13 },
    ])
    expect(ligne('classeur_documents', 10)?.deleted_at).toBe(SUPPRIME)
    expect(ligne('classeur_intercalaires', 12)?.deleted_at).not.toBeNull()
    expect(ligne('classeur_tracking_sheets', 13)?.deleted_at).not.toBeNull()
  })

  it('softDeleteItems : refus sur UNE famille ⇒ 42501', async () => {
    sim.politique('classeur_tracking_sheets', 'update', {
      using: () => false,
    })
    await expect(
      service.softDeleteItems([
        { kind: 'intercalaire', id: 12 },
        { kind: 'tracking_sheet', id: 13 },
      ]),
    ).rejects.toMatchObject(REFUS)
    expect(ligne('classeur_tracking_sheets', 13)?.deleted_at).toBeNull()
  })
})

describe('réordonnancements (lots)', () => {
  it('reorderChapters : écrit l’ordre', async () => {
    await service.reorderChapters([2, 1])
    expect(ligne('classeur_chapters', 2)?.sort_order).toBe(1)
    expect(ligne('classeur_chapters', 1)?.sort_order).toBe(2)
  })

  it('reorderChapters : refus RLS ⇒ 42501', async () => {
    sim.refuser('classeur_chapters', 'update')
    await expect(service.reorderChapters([2, 1])).rejects.toMatchObject(REFUS)
  })

  it('reorderChapters : une ligne disparue entre-temps ⇒ succès', async () => {
    await expect(service.reorderChapters([2, 999, 1])).resolves.toBeUndefined()
    expect(ligne('classeur_chapters', 1)?.sort_order).toBe(3)
  })

  it('reorderClasseurs : refus d’UNE ligne ⇒ 42501', async () => {
    sim.politique('classeur_classeurs', 'update', {
      using: (l) => l.id !== 25,
    })
    await expect(service.reorderClasseurs([25, 24])).rejects.toMatchObject(
      REFUS,
    )
  })

  it('reorderItems : refus sur une famille ⇒ 42501', async () => {
    sim.refuser('classeur_intercalaires', 'update')
    await expect(
      service.reorderItems([
        { kind: 'intercalaire', id: 12 },
        { kind: 'document', id: 10 },
      ]),
    ).rejects.toMatchObject(REFUS)
    expect(ligne('classeur_documents', 10)?.sort_order).toBe(2)
  })
})

describe('suppressions physiques', () => {
  it('deleteMergeHistory : refus (point majeur, rang écriture) ⇒ 42501', async () => {
    sim.politique('classeur_merge_history', 'delete', {
      using: (l) => l.kind === 'auto',
    })
    await service.deleteMergeHistory(70)
    expect(ligne('classeur_merge_history', 70)).toBeUndefined()
    await expect(service.deleteMergeHistory(71)).rejects.toMatchObject(REFUS)
    expect(ligne('classeur_merge_history', 71)).toBeDefined()
  })

  it('deleteMergeHistory : déjà supprimée par un collègue ⇒ succès', async () => {
    await expect(service.deleteMergeHistory(999)).resolves.toBeUndefined()
  })

  it('definirAcces(null) : aucune exception à retirer ⇒ succès', async () => {
    await expect(service.definirAcces(24, 'u-2', null)).resolves.toBeUndefined()
  })

  it('definirAcces(null) : retire l’exception ; refus ⇒ 42501', async () => {
    sim.refuser('classeur_acces', 'delete')
    await expect(service.definirAcces(24, 'u-1', null)).rejects.toMatchObject(
      REFUS,
    )
    expect(ligne('classeur_acces', 80)).toBeDefined()
  })

  it('definirAcces(null) : retire l’exception', async () => {
    await service.definirAcces(24, 'u-1', null)
    expect(ligne('classeur_acces', 80)).toBeUndefined()
  })
})

describe('restauration d’un point refusée en partie', () => {
  /** Point = l'état initial ; puis l'état courant s'en écarte. */
  function preparerPoint(): void {
    const snapshot = construireExport(
      CLASSEUR,
      [CH1, CH2],
      {
        documents: [DOC],
        tracking_sheets: [SUIVI],
        signature_sheets: [],
        intercalaires: [INTER],
      },
      PERIODICITES,
    )
    sim.table('classeur_merge_history').push({
      id: 90,
      classeur_id: 24,
      kind: 'manuel',
      label: 'Jalon',
      merged_at: SUPPRIME,
      snapshot: JSON.parse(JSON.stringify(snapshot)) as unknown,
    })
    // Écarts : intercalaire supprimé, chapitre renommé, élément ajouté.
    ligne('classeur_intercalaires', 12)!.deleted_at = SUPPRIME
    ligne('classeur_chapters', 2)!.label = 'Caisse (renommé)'
    sim.table('classeur_signature_sheets').push({
      id: 14,
      uuid: 'sig-14',
      chapter_id: 2,
      title: 'Ajout',
      description: '',
      nombre: 14,
      sort_order: 2,
      deleted_at: null,
      created_at: SUPPRIME,
      updated_at: SUPPRIME,
    })
  }

  it('sans refus : l’état du point revient', async () => {
    preparerPoint()
    await restaurerInstantane(90)
    expect(ligne('classeur_intercalaires', 12)?.deleted_at).toBeNull()
    expect(ligne('classeur_chapters', 2)?.label).toBe('Caisse')
    expect(ligne('classeur_signature_sheets', 14)?.deleted_at).not.toBeNull()
  })

  const refus: Array<[string, string]> = [
    ['restaurerItem', 'classeur_intercalaires'],
    ['updateChapter', 'classeur_chapters'],
    ['softDeleteItem', 'classeur_signature_sheets'],
  ]
  for (const [fonction, table] of refus) {
    it(`refus sur ${table} (${fonction}) ⇒ 42501 remonté, instantané de sécurité pris avant`, async () => {
      preparerPoint()
      sim.refuser(table, 'update')
      await expect(restaurerInstantane(90)).rejects.toMatchObject(REFUS)
      const securite = sim
        .table('classeur_merge_history')
        .filter((l) => l.kind === 'securite')
      expect(securite).toHaveLength(1)
    })
  }
})
