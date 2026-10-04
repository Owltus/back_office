import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'

/*
 * Relecture ADVERSE du transfert (étapes 7a-7c) : retour arrière par les
 * points de restauration que le transfert prend « avant, dans chaque
 * classeur ».
 *
 * Fait de la base (lu au catalogue, 2026-10-04) : `classeur_documents` porte
 * `UNIQUE (uuid)` sur TOUTE la table, pas par classeur. Le simulateur ne
 * modélise pas les contraintes d'unicité : on l'émule par une politique
 * `check` à l'insert (le refus y prend la forme d'un 42501 au lieu d'un
 * 23505 — c'est la collision qui compte, pas son code).
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
const { transfererItems } = await import('#/lib/classeur/transfertExecution.ts')

const T = '2026-09-20T10:00:00.000Z'

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

const chapitre = (id: number, classeur_id: number, label: string) => ({
  id,
  uuid: `00000000-0000-4000-8000-0000000000${String(id)}`,
  classeur_id,
  label,
  icon: '',
  description: '',
  sort_order: 1,
  updated_at: T,
})

let sim: SimulateurSupabase

/** Émule `UNIQUE (uuid)` de `classeur_documents` (toute la table). */
function uuidUnique() {
  sim.politique('classeur_documents', 'insert', {
    check: (l: Ligne) =>
      l.uuid == null ||
      !sim.table('classeur_documents').some((d) => d.uuid === l.uuid),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-04T08:00:00.000Z'))
  reinitialiserPointsAuto()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sim = new SimulateurSupabase({
    classeur_classeurs: [classeur(2), classeur(5)],
    classeur_chapters: [
      chapitre(20, 2, 'Réception'),
      chapitre(50, 5, 'Arrivée'),
    ],
    classeur_documents: [
      {
        id: 100,
        uuid: 'aaaaaaaa-0000-4000-8000-000000000100',
        chapter_id: 20,
        title: 'Procédure',
        description: '',
        content: 'Ouvrir la porte.',
        version_majeure: 1,
        version_mineure: 0,
        sort_order: 1,
        updated_at: T,
        created_at: T,
      },
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

const pointAuto = (classeurId: number) =>
  sim
    .table('classeur_merge_history')
    .find((p) => p.classeur_id === classeurId && p.kind === 'auto')

const deplacer = () =>
  transfererItems({
    mode: 'deplacer',
    elements: [{ kind: 'document', id: 100 }],
    origine: 2,
    arrivee: 5,
    chapitreArrivee: 50,
    niveaux: { origine: 'ecriture', arrivee: 'ecriture' },
  })

describe('retour arrière d’un DÉPLACEMENT par les points pris avant', () => {
  it('le point de l’ORIGINE se restaure : le document revient dans son classeur', async () => {
    await deplacer()
    const point = pointAuto(2)
    expect(point).toBeDefined()
    // Le transfert annonce ce filet (« un point de restauration a été pris
    // avant dans chaque classeur ») : il doit servir.
    await restaurerInstantane(point?.id as number)
    const vivantsDans = (chapterId: number) =>
      sim
        .table('classeur_documents')
        .filter((d) => d.chapter_id === chapterId && d.deleted_at == null)
    expect(vivantsDans(20).map((d) => d.title)).toEqual(['Procédure'])
  })

  it('les DEUX points restaurés (arrivée puis origine) : état d’avant le déplacement', async () => {
    await deplacer()
    await restaurerInstantane(pointAuto(5)?.id as number)
    await restaurerInstantane(pointAuto(2)?.id as number)
    const vivants = sim
      .table('classeur_documents')
      .filter((d) => d.deleted_at == null)
    expect(vivants.map((d) => [d.chapter_id, d.title])).toEqual([
      [20, 'Procédure'],
    ])
  })
})

describe('planTransfert : uuid neuf d’un élément déplacé', () => {
  const doc = (id: number) =>
    ({
      kind: 'document',
      data: {
        id,
        uuid: `u-${String(id)}`,
        chapter_id: 20,
        title: 'D',
        description: '',
        content: 'Texte.',
        sort_order: id,
        deleted_at: null,
        created_at: '',
        updated_at: '',
        version_majeure: 1,
        version_mineure: 0,
      },
    }) as never
  const base = {
    mode: 'deplacer' as const,
    origine: 2,
    chapitreArrivee: 50,
    ordreSuivant: 1,
    imagesOrigine: [],
  }

  it('refuse un uuid généré invalide ou répété', async () => {
    const { planTransfert } = await import('#/lib/classeur/transfert.ts')
    const fixe = '11111111-1111-4111-8111-111111111111'
    expect(() =>
      planTransfert({
        ...base,
        arrivee: 5,
        elements: [doc(1), doc(2)],
        nouveauxUuids: () => fixe,
      }),
    ).toThrow(/élément/)
    expect(() =>
      planTransfert({
        ...base,
        arrivee: 5,
        elements: [doc(1)],
        nouveauxUuids: () => 'pas-un-uuid',
      }),
    ).toThrow(/élément/)
  })

  it('dans le même classeur, l’uuid ne change pas', async () => {
    const { planTransfert } = await import('#/lib/classeur/transfert.ts')
    const plan = planTransfert({
      ...base,
      arrivee: 2,
      elements: [doc(1)],
      nouveauxUuids: () => {
        throw new Error('aucun uuid ne doit être tiré')
      },
    })
    expect(plan.operations.at(-1)).not.toHaveProperty('uuid')
  })
})
