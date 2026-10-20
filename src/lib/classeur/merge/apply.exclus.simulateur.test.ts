import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERIODICITES } from '#/lib/classeur/merge/fixtures.ts'
import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { DbChapter, DbClasseur, DbDocument } from '#/lib/classeur/types.ts'

/*
 * Import JSON d'un chapitre AVEC un document refusé, de bout en bout à
 * travers le VRAI service (`service.ts`) branché sur le simulateur en
 * mémoire (étape 0) — la base de production n'est jamais touchée.
 *
 * Oracles posés à la main :
 *   - ordre : point de restauration (insert de `classeur_merge_history`)
 *     → écritures de contenu → élagage (lecture de l'historique) ;
 *   - le document refusé n'a NI `updated_at` NI contenu NI version changés ;
 *   - tout refuser : aucune écriture, aucun point ;
 *   - un refus RLS du point arrête tout avant la première écriture.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { appliquerImport } = await import('#/lib/classeur/merge/apply.ts')
const { construireExportChapitre } =
  await import('#/lib/classeur/merge/portee.ts')
const { parseImportJson } = await import('#/lib/classeur/merge/schema.ts')

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
const CHAPITRE: DbChapter = {
  id: 10,
  uuid: 'ch-10',
  classeur_id: 1,
  label: 'Accueil',
  icon: 'FileText',
  description: '',
  sort_order: 1,
  deleted_at: null,
  created_at: T,
  updated_at: T,
}
const doc = (id: number, title: string, content: string): DbDocument => ({
  id,
  uuid: `doc-${String(id)}`,
  chapter_id: 10,
  title,
  description: '',
  content,
  sort_order: id,
  deleted_at: null,
  created_at: T,
  updated_at: T,
  version_majeure: 1,
  version_mineure: 0,
})
const D1 = doc(1, 'Check-in', 'Accueillir le client au comptoir')
const D2 = doc(2, 'Check-out', 'Rendre la clé au comptoir')

function nouveau(): SimulateurSupabase {
  return new SimulateurSupabase({
    classeur_classeurs: [CLASSEUR as unknown as Ligne],
    classeur_chapters: [CHAPITRE as unknown as Ligne],
    classeur_documents: [D1, D2] as unknown as Ligne[],
    classeur_tracking_sheets: [],
    classeur_signature_sheets: [],
    classeur_intercalaires: [],
    classeur_periodicites: PERIODICITES as unknown as Ligne[],
    classeur_merge_history: [],
  })
}

/** Le JSON du chapitre, les deux documents retravaillés par un « LLM ». */
function fichierLlm() {
  const f = parseImportJson(
    JSON.stringify(
      construireExportChapitre(
        CLASSEUR,
        CHAPITRE,
        {
          documents: [D1, D2],
          tracking_sheets: [],
          signature_sheets: [],
          intercalaires: [],
        },
        PERIODICITES,
      ),
    ),
  )
  f.chapters[0].items[0].content =
    "Accueillir le client au comptoir. Vérifier sa pièce d'identité et sa réservation."
  f.chapters[0].items[1].content = 'Rendre la clé à la réception'
  return f
}

const CIBLE = { type: 'chapitre' as const, chapitreId: 10 }
const ecritures = (s: SimulateurSupabase) =>
  s.journal.filter((j) => j.operation !== 'select')
const ligneDoc = (s: SimulateurSupabase, id: number) =>
  s.table('classeur_documents').find((d) => d.id === id) as Ligne

let sim: SimulateurSupabase
beforeEach(() => {
  sim = nouveau()
  etat.sim = sim
})

describe('appliquerImport + refus, contre le simulateur', () => {
  it('point → écritures → élagage ; le document refusé reste intact', async () => {
    const r = await appliquerImport(1, fichierLlm(), CIBLE, {
      sourceName: 'Import JSON du chapitre « Accueil »',
      exclus: new Set(['document:2']),
    })

    expect(r).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 2, // le chapitre (inchangé) + le document refusé
      skipped: 0,
      deleted: 0,
      ignores: 1,
    })
    // Ordre : le point d'abord, puis la seule écriture du document 1.
    expect(ecritures(sim)).toEqual([
      { cible: 'classeur_merge_history', operation: 'insert' },
      { cible: 'classeur_documents', operation: 'update' },
    ])
    const iPoint = sim.journal.findIndex(
      (j) => j.cible === 'classeur_merge_history' && j.operation === 'insert',
    )
    const iEcriture = sim.journal.findIndex(
      (j) => j.cible === 'classeur_documents' && j.operation === 'update',
    )
    const iElagage = sim.journal
      .map((j) => `${j.cible}:${j.operation}`)
      .lastIndexOf('classeur_merge_history:select')
    expect(iPoint).toBeLessThan(iEcriture)
    expect(iEcriture).toBeLessThan(iElagage)

    // Le point porte les compteurs du plan FILTRÉ.
    const [point] = sim.table('classeur_merge_history')
    expect(point).toMatchObject({
      kind: 'fusion',
      inserted: 0,
      updated: 1,
      unchanged: 2,
      skipped: 0,
    })

    // Le document refusé : rien n'a bougé.
    expect(ligneDoc(sim, 2)).toMatchObject({
      content: 'Rendre la clé au comptoir',
      updated_at: T,
      version_majeure: 1,
      version_mineure: 0,
    })
    // Le document retenu : écrit, versionné.
    const d1 = ligneDoc(sim, 1)
    expect(d1.content).toBe(
      "Accueillir le client au comptoir. Vérifier sa pièce d'identité et sa réservation.",
    )
    expect(d1.updated_at).not.toBe(T)
    expect(`${String(d1.version_majeure)}.${String(d1.version_mineure)}`).toBe(
      '1.1',
    )
  })

  it('tout refuser : aucune écriture, aucun point de restauration', async () => {
    const r = await appliquerImport(1, fichierLlm(), CIBLE, {
      sourceName: 's',
      exclus: new Set(['document:1', 'document:2']),
    })
    expect(r.ignores).toBe(2)
    expect(r.updated).toBe(0)
    expect(ecritures(sim)).toEqual([])
    expect(sim.table('classeur_merge_history')).toEqual([])
    expect(ligneDoc(sim, 1).updated_at).toBe(T)
    expect(ligneDoc(sim, 2).updated_at).toBe(T)
  })

  it('sans refus : les deux documents sont écrits (comportement d’avant)', async () => {
    const r = await appliquerImport(1, fichierLlm(), CIBLE, {
      sourceName: 's',
    })
    expect(r).toMatchObject({ updated: 2, unchanged: 1, ignores: 0 }) // le chapitre
    expect(ecritures(sim).map((j) => j.cible)).toEqual([
      'classeur_merge_history',
      'classeur_documents',
      'classeur_documents',
    ])
  })

  it('refus RLS du point de restauration : erreur, aucune écriture de contenu', async () => {
    sim.refuser('classeur_merge_history', 'insert')
    await expect(
      appliquerImport(1, fichierLlm(), CIBLE, {
        sourceName: 's',
        exclus: new Set(['document:2']),
      }),
    ).rejects.toMatchObject({ code: '42501' })
    expect(ligneDoc(sim, 1).updated_at).toBe(T)
    expect(ligneDoc(sim, 2).updated_at).toBe(T)
  })

  /*
   * DÉFAUT corrigé à l'étape 7b (était un `it.fails`) : un refus RLS sur
   * l'`update` d'un document rend 0 ligne SANS erreur, et
   * `ecrireDocumentVersionne` finissait par une écriture non relue —
   * l'import se disait réussi alors que rien n'était écrit.
   */
  it('refus RLS d’une écriture de document : l’erreur devrait remonter', async () => {
    sim.refuser('classeur_documents', 'update')
    await expect(
      appliquerImport(1, fichierLlm(), CIBLE, {
        sourceName: 's',
        exclus: new Set(['document:2']),
      }),
    ).rejects.toBeTruthy()
  })
})
