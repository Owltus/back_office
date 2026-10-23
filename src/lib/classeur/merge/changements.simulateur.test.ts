import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERIODICITES } from '#/lib/classeur/merge/fixtures.ts'
import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { DbChapter, DbClasseur, DbDocument } from '#/lib/classeur/types.ts'
import type { FichierChangements } from '#/lib/classeur/merge/changements.ts'

/*
 * Import des changements d'un LLM (`changements.ts`), de bout en bout à
 * travers le VRAI service branché sur le simulateur en mémoire. Oracles
 * posés à la main :
 *   - point de restauration AVANT toute écriture de contenu ;
 *   - modifier, déplacer, supprimer, ajouter donnent en base exactement
 *     l'ordre et le contenu annoncés, et rien d'autre ne bouge ;
 *   - un déplacement refusé ne laisse aucune renumérotation ;
 *   - rien à faire, ou tout refusé : aucune écriture, aucun point.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { appliquerImport, previsualiserImport } =
  await import('#/lib/classeur/merge/apply.ts')
const CLASSEUR_CTX = { type: 'classeur' } as const

const T = '2026-09-01T10:00:00.000Z'

const CLASSEUR: DbClasseur = {
  id: 1,
  uuid: 'cl-1',
  name: 'Essai',
  icon: 'Shield',
  etablissement: 'OKKO Nantes',
  etablissement_complement: '',
  sort_order: 1,
  deleted_at: null,
  created_at: T,
  updated_at: T,
  created_by: null,
  acces_tous: 'lecture',
}
const chapitre = (
  id: number,
  label: string,
  sort_order: number,
): DbChapter => ({
  id,
  uuid: `ch-${String(id)}`,
  classeur_id: 1,
  label,
  icon: 'FileText',
  description: '',
  sort_order,
  deleted_at: null,
  created_at: T,
  updated_at: T,
})
const doc = (
  id: number,
  chapter_id: number,
  title: string,
  sort_order: number,
): DbDocument => ({
  id,
  uuid: `doc-${String(id)}`,
  chapter_id,
  title,
  description: '',
  content: `Texte de ${title}`,
  sort_order,
  deleted_at: null,
  created_at: T,
  updated_at: T,
  version_majeure: 1,
  version_mineure: 0,
})
const A = chapitre(10, 'Accueil', 1)
const B = chapitre(20, 'Sécurité', 2)
const DOCS = [
  doc(1, 10, 'Check-in', 1),
  doc(3, 10, 'Check-out', 2),
  doc(4, 10, 'Clés', 3),
  doc(2, 20, 'Extincteur', 1),
]

function reponse(
  changements: FichierChangements['changements'],
): FichierChangements {
  return {
    portee: { type: 'classeur', classeur_uuid: 'cl-1', classeur_name: 'Essai' },
    periodicites: [],
    avertissements: [],
    changements,
  }
}

/** Les quatre actions à la fois. */
const QUATRE = reponse([
  { action: 'modifier', uuid: 'doc-1', content: 'Accueillir avec le sourire' },
  { action: 'deplacer', uuid: 'doc-4', title: 'Clés', apres: null },
  { action: 'supprimer', uuid: 'doc-2', title: 'Extincteur' },
  { action: 'ajouter', kind: 'document', title: 'Badge', chapitre: 'ch-20' },
])

let sim: SimulateurSupabase
beforeEach(() => {
  sim = new SimulateurSupabase({
    classeur_classeurs: [CLASSEUR as unknown as Ligne],
    classeur_chapters: [A, B] as unknown as Ligne[],
    classeur_documents: DOCS.map((d) => ({ ...d })) as unknown as Ligne[],
    classeur_tracking_sheets: [],
    classeur_signature_sheets: [],
    classeur_intercalaires: [],
    classeur_periodicites: PERIODICITES as unknown as Ligne[],
    classeur_merge_history: [],
  })
  etat.sim = sim
})

const ecritures = () => sim.journal.filter((j) => j.operation !== 'select')
/** Titres visibles d'un chapitre, dans l'ordre de la base. */
const titres = (chapterId: number) =>
  sim
    .table('classeur_documents')
    .filter((d) => d.chapter_id === chapterId && d.deleted_at === null)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((d) => d.title)
const ligne = (id: number) =>
  sim.table('classeur_documents').find((d) => d.id === id) as Ligne

describe('appliquerImport (changements), contre le simulateur', () => {
  it('les quatre actions : point d’abord, puis exactement ce qui est annoncé', async () => {
    const r = await appliquerImport(1, QUATRE, CLASSEUR_CTX, {
      sourceName: 's',
    })
    expect(r).toMatchObject({ inserted: 1, updated: 2, deleted: 1, ignores: 0 })
    expect(ecritures()[0]).toEqual({
      cible: 'classeur_merge_history',
      operation: 'insert',
    })
    expect(titres(10)).toEqual(['Clés', 'Check-in', 'Check-out'])
    expect(titres(20)).toEqual(['Badge'])
    expect(ligne(1).content).toBe('Accueillir avec le sourire')
    // Corbeille DOUCE : la ligne existe encore, datée.
    expect(ligne(2).deleted_at).not.toBeNull()
    // Rien d'autre : Check-out garde son texte.
    expect(ligne(3).content).toBe('Texte de Check-out')
  })

  it('refuser le déplacement : l’ordre du chapitre ne bouge pas', async () => {
    const r = await appliquerImport(1, QUATRE, CLASSEUR_CTX, {
      sourceName: 's',
      exclus: new Set(['document:4']),
    })
    expect(r.ignores).toBe(1)
    expect(titres(10)).toEqual(['Check-in', 'Check-out', 'Clés'])
    expect(
      sim.table('classeur_documents').map((d) => [d.id, d.sort_order]),
    ).toEqual(
      expect.arrayContaining([
        [1, 1],
        [3, 2],
        [4, 3],
      ]),
    )
  })

  it('tout refusé, ou rien à faire : aucune écriture, aucun point', async () => {
    const a = await previsualiserImport(1, QUATRE, CLASSEUR_CTX)
    const cles = a.lignes.flatMap((l) => (l.cle === null ? [] : [l.cle]))
    expect(cles).toHaveLength(4)
    const r = await appliquerImport(1, QUATRE, CLASSEUR_CTX, {
      sourceName: 's',
      exclus: new Set(cles),
    })
    expect(r.ignores).toBe(4)
    expect(ecritures()).toEqual([])
    await appliquerImport(
      1,
      reponse([
        { action: 'modifier', uuid: 'doc-1', content: 'Texte de Check-in' },
      ]),
      CLASSEUR_CTX,
      { sourceName: 's' },
    )
    expect(ecritures()).toEqual([])
  })

  it('un changement sans action ne touche à rien', async () => {
    await appliquerImport(
      1,
      reponse([{ uuid: 'doc-1', content: 'Réécrit en silence' }]),
      CLASSEUR_CTX,
      { sourceName: 's' },
    )
    expect(ecritures()).toEqual([])
    expect(ligne(1).content).toBe('Texte de Check-in')
  })
})
