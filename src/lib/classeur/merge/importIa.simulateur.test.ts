import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERIODICITES } from '#/lib/classeur/merge/fixtures.ts'
import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { DbChapter, DbClasseur, DbDocument } from '#/lib/classeur/types.ts'

/*
 * Import d'un classeur rendu par une IA (étape 5 du plan
 * `classeur-echange-ia-2026-10-19`), de bout en bout à travers le VRAI
 * service branché sur le simulateur en mémoire. Oracles posés à la main :
 *   - point de restauration AVANT toute écriture de contenu ;
 *   - une modification gardant l'horodatage de l'export s'applique, et la
 *     base date l'écriture (aucun `updated_at` du fichier n'est recopié) ;
 *   - un chapitre retiré du fichier n'est PAS supprimé sans la case ;
 *   - tout refuser, ou rien à changer : aucune écriture, aucun point ;
 *   - l'export d'un chapitre est refusé avant toute écriture.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { appliquerImportIa, previsualiserImportIa } =
  await import('#/lib/classeur/merge/apply.ts')
const { construireExportChapitre } =
  await import('#/lib/classeur/merge/portee.ts')
const { construireExport, parseImportJson } =
  await import('#/lib/classeur/merge/schema.ts')

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
const A = chapitre(10, 'Accueil', 1)
const B = chapitre(20, 'Sécurité', 2)
const doc = (
  id: number,
  chapter_id: number,
  title: string,
  content: string,
): DbDocument => ({
  id,
  uuid: `doc-${String(id)}`,
  chapter_id,
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
const D1 = doc(1, 10, 'Check-in', 'Accueillir le client au comptoir')
const D2 = doc(2, 20, 'Extincteur', 'Vérifier la pression chaque mois')

function nouveau(): SimulateurSupabase {
  return new SimulateurSupabase({
    classeur_classeurs: [CLASSEUR as unknown as Ligne],
    classeur_chapters: [A, B] as unknown as Ligne[],
    classeur_documents: [D1, D2] as unknown as Ligne[],
    classeur_tracking_sheets: [],
    classeur_signature_sheets: [],
    classeur_intercalaires: [],
    classeur_periodicites: PERIODICITES as unknown as Ligne[],
    classeur_merge_history: [],
  })
}

const CONTENU = {
  documents: [D1, D2],
  tracking_sheets: [],
  signature_sheets: [],
  intercalaires: [],
}

/** L'export, retravaillé par « l'IA » qui a GARDÉ les horodatages. */
function fichierIa() {
  const f = parseImportJson(
    JSON.stringify(construireExport(CLASSEUR, [A, B], CONTENU, PERIODICITES)),
  )
  f.chapters[0].items[0].content =
    "Accueillir le client au comptoir. Vérifier sa pièce d'identité."
  // Le chapitre Sécurité n'est plus dans la réponse (réponse tronquée).
  f.chapters.splice(1, 1)
  return f
}

const ecritures = (s: SimulateurSupabase) =>
  s.journal.filter((j) => j.operation !== 'select')
const ligne = (s: SimulateurSupabase, table: string, id: number) =>
  s.table(table).find((d) => d.id === id) as Ligne

let sim: SimulateurSupabase
beforeEach(() => {
  sim = nouveau()
  etat.sim = sim
})

describe('appliquerImportIa, contre le simulateur', () => {
  it('point → écriture ; horodatage de l’export ignoré ; rien supprimé', async () => {
    const r = await appliquerImportIa(1, fichierIa(), {
      supprimerAbsents: false,
      sourceName: 'Réponse collée d’une IA',
    })
    expect(r).toMatchObject({ inserted: 0, updated: 1, deleted: 0 })
    expect(ecritures(sim)).toEqual([
      { cible: 'classeur_merge_history', operation: 'insert' },
      { cible: 'classeur_documents', operation: 'update' },
    ])
    const d1 = ligne(sim, 'classeur_documents', 1)
    expect(d1.content).toBe(
      "Accueillir le client au comptoir. Vérifier sa pièce d'identité.",
    )
    // La base date l'import : pas la date de l'export.
    expect(d1.updated_at).not.toBe(T)
    // Le chapitre absent de la réponse et son document : intacts.
    expect(ligne(sim, 'classeur_chapters', 20).deleted_at).toBeNull()
    expect(ligne(sim, 'classeur_documents', 2).deleted_at).toBeNull()
    expect(sim.table('classeur_merge_history')[0]).toMatchObject({
      kind: 'fusion',
      label: 'Réponse collée d’une IA',
    })
  })

  it('case cochée : le chapitre absent part à la corbeille, APRÈS le point', async () => {
    const r = await appliquerImportIa(1, fichierIa(), {
      supprimerAbsents: true,
      sourceName: 's',
    })
    expect(r.deleted).toBe(2)
    expect(ecritures(sim).map((j) => j.cible)).toEqual([
      'classeur_merge_history',
      'classeur_documents',
      'classeur_documents',
      'classeur_chapters',
    ])
    expect(ligne(sim, 'classeur_chapters', 20).deleted_at).not.toBeNull()
    expect(ligne(sim, 'classeur_documents', 2).deleted_at).not.toBeNull()
  })

  it('tout refuser : aucune écriture, aucun point de restauration', async () => {
    const r = await appliquerImportIa(1, fichierIa(), {
      supprimerAbsents: false,
      sourceName: 's',
      exclus: new Set(['document:1']),
    })
    expect(r.ignores).toBe(1)
    expect(ecritures(sim)).toEqual([])
    expect(sim.table('classeur_merge_history')).toEqual([])
  })

  it('un fichier identique : aucune écriture, aucun point', async () => {
    const f = parseImportJson(
      JSON.stringify(construireExport(CLASSEUR, [A, B], CONTENU, PERIODICITES)),
    )
    const r = await appliquerImportIa(1, f, {
      supprimerAbsents: true,
      sourceName: 's',
    })
    expect(r).toMatchObject({ inserted: 0, updated: 0, deleted: 0 })
    expect(ecritures(sim)).toEqual([])
  })

  it('l’export d’un chapitre : refusé avant toute écriture', async () => {
    const f = parseImportJson(
      JSON.stringify(
        construireExportChapitre(CLASSEUR, A, CONTENU, PERIODICITES),
      ),
    )
    await expect(
      appliquerImportIa(1, f, { supprimerAbsents: true, sourceName: 's' }),
    ).rejects.toThrow(/export du chapitre Accueil/)
    await expect(
      previsualiserImportIa(1, f, { supprimerAbsents: false }),
    ).rejects.toThrow(/export du chapitre Accueil/)
    expect(ecritures(sim)).toEqual([])
  })

  it('aperçu : l’avertissement d’un autre classeur arrive dans le plan', async () => {
    const f = fichierIa()
    f._metadata!.portee = {
      type: 'classeur',
      classeur_uuid: 'autre',
      classeur_name: 'Carnet sanitaire',
    }
    const a = await previsualiserImportIa(1, f, { supprimerAbsents: false })
    expect(a.plan.warnings[0]).toMatch(/vient du classeur Carnet sanitaire/)
    expect(a.lignes).toHaveLength(1)
    expect(ecritures(sim)).toEqual([])
  })
})
