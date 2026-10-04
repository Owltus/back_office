import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'

/*
 * Transfert (étape 7b) avec la VRAIE garde des points de restauration
 * (`restauration.ts`, chargé ici : il pose `definirGardeEcriture` et
 * `definirOubliDeplacement`), contre le simulateur. Deux faits :
 *   1. un point AUTO est écrit pour l'origine ET pour l'arrivée, avant la
 *      première écriture du transfert ;
 *   2. après un déplacement vers un autre classeur, l'écriture suivante de
 *      l'élément prend son point sur le classeur d'ARRIVÉE (la résolution
 *      élément → chapitre mémorisée est oubliée).
 */

/** Dernier index vérifiant `pred` (pas de findLastIndex : cible ES2022). */
function dernierIndex<T>(liste: readonly T[], pred: (x: T) => boolean): number {
  for (let i = liste.length - 1; i >= 0; i--) if (pred(liste[i])) return i
  return -1
}

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { reinitialiserPointsAuto } =
  await import('#/lib/classeur/restauration.ts')
const { updateItem } = await import('#/lib/classeur/service.ts')
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

let sim: SimulateurSupabase

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-04T08:00:00.000Z'))
  reinitialiserPointsAuto()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sim = new SimulateurSupabase({
    classeur_classeurs: [classeur(2), classeur(5)],
    classeur_chapters: [
      {
        id: 20,
        uuid: 'ch-20',
        classeur_id: 2,
        label: 'Réception',
        icon: '',
        description: '',
        sort_order: 1,
        updated_at: T,
      },
      {
        id: 50,
        uuid: 'ch-50',
        classeur_id: 5,
        label: 'Arrivée',
        icon: '',
        description: '',
        sort_order: 1,
        updated_at: T,
      },
    ],
    classeur_documents: [
      {
        id: 100,
        uuid: 'u-100',
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
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const pointsAuto = (classeurId: number) =>
  sim
    .table('classeur_merge_history')
    .filter((p) => p.classeur_id === classeurId && p.kind === 'auto')

const demande = (mode: 'copier' | 'deplacer') => ({
  mode,
  elements: [{ kind: 'document' as const, id: 100 }],
  origine: 2,
  arrivee: 5,
  chapitreArrivee: 50,
  niveaux: { origine: 'ecriture' as const, arrivee: 'ecriture' as const },
})

describe('points de restauration réels du transfert', () => {
  it('un point auto par classeur, écrits AVANT la première écriture du transfert', async () => {
    await transfererItems(demande('copier'))
    expect(pointsAuto(2)).toHaveLength(1)
    expect(pointsAuto(5)).toHaveLength(1)
    const j = sim.journal
    const derniersPoints = dernierIndex(
      j,
      (x) => x.cible === 'classeur_merge_history' && x.operation === 'insert',
    )
    const premiereEcriture = j.findIndex(
      (x) => x.cible === 'classeur_documents' && x.operation === 'insert',
    )
    expect(derniersPoints).toBeGreaterThanOrEqual(0)
    expect(premiereEcriture).toBeGreaterThan(derniersPoints)
  })

  it('après un déplacement, l’écriture suivante prend son point sur l’ARRIVÉE', async () => {
    // Écriture AVANT : la garde mémorise document 100 → chapitre 20.
    await updateItem('document', 100, { content: 'Ouvrir la porte vite.' })
    expect(pointsAuto(2)).toHaveLength(1)
    await transfererItems(demande('deplacer'))
    expect(pointsAuto(5)).toHaveLength(1)
    // Fenêtre de 15 min écoulée : un nouveau point auto est dû.
    vi.setSystemTime(new Date('2026-10-04T08:20:00.000Z'))
    await updateItem('document', 100, { content: 'Fermer la porte.' })
    expect(pointsAuto(5)).toHaveLength(2)
    expect(pointsAuto(2)).toHaveLength(1)
  })
})
