import { beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

import { PERIODICITES } from '#/lib/classeur/merge/fixtures.ts'
import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'
import type { Ligne } from '#/lib/classeur/test/simulateurSupabase.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { ITEM_KINDS } from '#/lib/classeur/types.ts'

/*
 * Validation avant écriture (étape 6 du plan
 * `classeur-echange-ia-2026-10-19`), de bout en bout : le VRAI service sur le
 * simulateur, qui reçoit les contraintes de la base comme politiques
 * `check` (une écriture refusée = 42501, l'import s'arrête au milieu) :
 *   - `nombre` entier de 1 à 60 (CHECK) ;
 *   - `uuid` absent ou au format UUID (22P02) ;
 *   - `periodicite_id` présent dans le référentiel (clé étrangère).
 * Fuzzing (2000 fichiers « rendus par une IA » abîmés au hasard) : aucun,
 * après validation, ne produit une écriture refusée, par l'import du
 * classeur (mode IA) comme par celui d'un chapitre ; un refus de la portée
 * (autre chapitre) arrive AVANT toute écriture.
 */

const etat = vi.hoisted(() => ({ sim: null as unknown as SimulateurSupabase }))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { appliquerFusionPortee, appliquerImportIa, previsualiserImportIa } =
  await import('#/lib/classeur/merge/apply.ts')
const { construireExport } = await import('#/lib/classeur/merge/schema.ts')

const T = '2026-09-01T10:00:00.000Z'
const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const U = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const CLASSEUR: DbClasseur = {
  id: 1,
  uuid: U(9999),
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

const TABLES: Record<ItemKind, string> = {
  document: 'classeur_documents',
  tracking_sheet: 'classeur_tracking_sheets',
  signature_sheet: 'classeur_signature_sheets',
  intercalaire: 'classeur_intercalaires',
}

const uuidOk = (l: Ligne) =>
  l.uuid === undefined || l.uuid === null || RE_UUID.test(String(l.uuid))
const nombreOk = (l: Ligne) =>
  Number.isInteger(l.nombre) &&
  (l.nombre as number) >= 1 &&
  (l.nombre as number) <= 60
const perioOk = (l: Ligne) =>
  PERIODICITES.some((p) => p.id === l.periodicite_id)

/** Les contraintes de la base, en politiques du simulateur. */
function contraindre(sim: SimulateurSupabase): void {
  for (const op of ['insert', 'update'] as const) {
    sim.politique('classeur_chapters', op, { check: uuidOk })
    sim.politique('classeur_documents', op, { check: uuidOk })
    sim.politique('classeur_intercalaires', op, { check: uuidOk })
    sim.politique('classeur_signature_sheets', op, {
      check: (l) => uuidOk(l) && nombreOk(l),
    })
    sim.politique('classeur_tracking_sheets', op, {
      check: (l) => uuidOk(l) && perioOk(l),
    })
  }
}

interface ItemLocal {
  kind: ItemKind
  titre: string
}

function construireLocal(items: ItemLocal[][]): {
  chapters: DbChapter[]
  content: ChapterContent
} {
  const chapters = items.map((_, i): DbChapter => ({
    id: 10 * (i + 1),
    uuid: U(10 * (i + 1)),
    classeur_id: 1,
    label: `Chapitre ${String(i + 1)}`,
    icon: 'FileText',
    description: '',
    sort_order: i + 1,
    deleted_at: null,
    created_at: T,
    updated_at: T,
  }))
  const content: ChapterContent = {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
  }
  let id = 0
  items.forEach((liste, i) =>
    liste.forEach((it, j) => {
      id += 1
      const base = {
        id,
        uuid: U(id),
        chapter_id: 10 * (i + 1),
        title: it.titre,
        sort_order: j + 1,
        deleted_at: null,
        created_at: T,
        updated_at: T,
      }
      if (it.kind === 'document')
        content.documents.push({
          ...base,
          description: '',
          content: 'x',
          version_majeure: 1,
          version_mineure: 0,
        })
      else if (it.kind === 'tracking_sheet')
        content.tracking_sheets.push({ ...base, periodicite_id: 41 })
      else if (it.kind === 'signature_sheet')
        content.signature_sheets.push({ ...base, description: '', nombre: 14 })
      else content.intercalaires.push({ ...base, description: '' })
    }),
  )
  return { chapters, content }
}

function nouveauSim(local: {
  chapters: DbChapter[]
  content: ChapterContent
}): SimulateurSupabase {
  const sim = new SimulateurSupabase({
    classeur_classeurs: [CLASSEUR as unknown as Ligne],
    classeur_chapters: local.chapters as unknown as Ligne[],
    classeur_documents: local.content.documents as unknown as Ligne[],
    classeur_tracking_sheets: local.content
      .tracking_sheets as unknown as Ligne[],
    classeur_signature_sheets: local.content
      .signature_sheets as unknown as Ligne[],
    classeur_intercalaires: local.content.intercalaires as unknown as Ligne[],
    classeur_periodicites: PERIODICITES as unknown as Ligne[],
    classeur_merge_history: [],
  })
  contraindre(sim)
  return sim
}

/** Ce qu'une IA peut abîmer dans un élément. */
const abimArb = fc.record({
  nombre: fc.oneof(
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.double({ noNaN: false }),
    fc.constantFrom(0, 1, 60, 61, 100),
  ),
  uuid: fc.oneof(
    fc.constant<string | undefined>(undefined),
    fc.uuid(),
    fc.constantFrom('doc-1', 'abc', '', `${U(1)}x`, U(1), U(2)),
    fc.string({ maxLength: 40 }),
  ),
  periodicite: fc.oneof(
    fc.constant<number | null | undefined>(undefined),
    fc.constant(null),
    fc.constantFrom(41, 44, 49, 999, 0, -1),
    fc.integer(),
  ),
  titre: fc.constantFrom('Ok', '', '   ', 'Autre', 'Ok'),
  libelle: fc.option(fc.constantFrom('Mensuel', 'Annuel', 'Trimestriel'), {
    nil: undefined,
  }),
  ordre: fc.oneof(fc.integer({ min: 0, max: 9 }), fc.constantFrom(1e10, -1e12)),
  geste: fc.nat({ max: 3 }),
})

const casArb = fc.record({
  local: fc.array(
    fc.array(
      fc.record({
        kind: fc.constantFrom(...ITEM_KINDS),
        titre: fc.constantFrom('Ok', 'Autre', 'Consignes'),
      }),
      { maxLength: 3 },
    ),
    { minLength: 1, maxLength: 2 },
  ),
  abimes: fc.array(abimArb, { minLength: 8, maxLength: 8 }),
  nouveaux: fc.array(fc.tuple(fc.constantFrom(...ITEM_KINDS), abimArb), {
    maxLength: 3,
  }),
  uuidChapitre: fc.oneof(
    fc.constant<string | undefined>(undefined),
    fc.constantFrom('chap-1', U(10), U(20)),
    fc.uuid(),
  ),
  metaRetouche: fc.boolean(),
  supprimerAbsents: fc.boolean(),
})

type Cas = typeof casArb extends fc.Arbitrary<infer C> ? C : never

/** L'export du local, abîmé comme une IA pourrait le faire. */
function fichierAbime(c: Cas, local: ReturnType<typeof construireLocal>) {
  const f = construireExport(
    CLASSEUR,
    local.chapters,
    local.content,
    PERIODICITES,
  ) as unknown as {
    _metadata: { periodicites: Array<{ id: number; label: string }> }
    chapters: Array<{ uuid?: string; items: Array<Record<string, unknown>> }>
  }
  let k = 0
  for (const ch of f.chapters) {
    for (const it of ch.items) {
      const a = c.abimes[k % c.abimes.length]
      k += 1
      if (a.geste === 0) continue
      if (a.geste === 1) {
        if (it.kind === 'signature_sheet') it.nombre = a.nombre
        if (it.kind === 'tracking_sheet') {
          it.periodicite_id = a.periodicite
          if (a.libelle !== undefined) it.periodicite = a.libelle
        }
        it.sort_order = a.ordre
      } else if (a.geste === 2) {
        it.uuid = a.uuid
        it.title = a.titre
      } else {
        it.title = a.titre
        if (it.kind === 'signature_sheet') it.nombre = a.nombre
      }
    }
  }
  c.nouveaux.forEach(([kind, a], i) => {
    const it: Record<string, unknown> = {
      kind,
      title: a.titre === 'Ok' ? `Nouveau ${String(i)}` : a.titre,
      sort_order: a.ordre,
    }
    if (a.uuid !== undefined) it.uuid = a.uuid
    if (kind === 'signature_sheet') {
      it.description = ''
      it.nombre = a.nombre
    } else if (kind === 'tracking_sheet') {
      if (a.periodicite !== undefined) it.periodicite_id = a.periodicite
    } else {
      it.description = ''
      if (kind === 'document') it.content = 'neuf'
    }
    f.chapters[0].items.push(it)
  })
  if (c.uuidChapitre !== undefined) f.chapters[0].uuid = c.uuidChapitre
  if (c.metaRetouche && f._metadata.periodicites.length > 1)
    f._metadata.periodicites[0] = {
      ...f._metadata.periodicites[0],
      label: 'Trimestriel',
    }
  return f as unknown as Parameters<typeof appliquerImportIa>[1]
}

const ecritures = (s: SimulateurSupabase) =>
  s.journal.filter((j) => j.operation !== 'select')

/** Après l'import : toutes les lignes respectent les contraintes. */
function contraintesTenues(sim: SimulateurSupabase): void {
  for (const l of sim.table('classeur_chapters')) expect(uuidOk(l)).toBe(true)
  for (const kind of ITEM_KINDS)
    for (const l of sim.table(TABLES[kind])) {
      if (!String(l.uuid).startsWith('00000000-0000-4000-8000-'))
        expect(uuidOk(l), String(l.uuid)).toBe(true)
      if (kind === 'signature_sheet') expect(nombreOk(l)).toBe(true)
      if (kind === 'tracking_sheet') expect(perioOk(l)).toBe(true)
    }
}

describe('validation + simulateur contraint : aucune écriture refusée', () => {
  it('import du classeur, mode IA (2000 fichiers)', async () => {
    // Couverture : le générateur doit produire des écritures de chaque sorte
    // et des fichiers que la validation corrige (sinon il ne prouve rien).
    const vus = { ecrit: 0, signature: 0, suivi: 0, creation: 0, corrige: 0 }
    await fc.assert(
      fc.asyncProperty(casArb, async (c) => {
        const local = construireLocal(c.local)
        const sim = nouveauSim(local)
        etat.sim = sim
        const f = fichierAbime(c, local)
        const a = await previsualiserImportIa(1, f, {
          supprimerAbsents: c.supprimerAbsents,
        })
        if (a.plan.warnings.length > 0) vus.corrige += 1
        sim.journal.length = 0
        await appliquerImportIa(1, f, {
          supprimerAbsents: c.supprimerAbsents,
          sourceName: 's',
        })
        const e = ecritures(sim)
        if (e.length > 0) vus.ecrit += 1
        if (e.some((j) => j.cible === 'classeur_signature_sheets'))
          vus.signature += 1
        if (e.some((j) => j.cible === 'classeur_tracking_sheets'))
          vus.suivi += 1
        if (
          e.some(
            (j) =>
              j.operation === 'insert' && j.cible !== 'classeur_merge_history',
          )
        )
          vus.creation += 1
        contraintesTenues(sim)
      }),
      { numRuns: 2000, seed: 20261020 },
    )
    expect(vus.ecrit).toBeGreaterThan(1000)
    expect(vus.signature).toBeGreaterThan(200)
    expect(vus.suivi).toBeGreaterThan(200)
    expect(vus.creation).toBeGreaterThan(200)
    expect(vus.corrige).toBeGreaterThan(500)
  })

  it('import d’un chapitre (2000 fichiers) : écriture tenue, ou refus avant tout', async () => {
    await fc.assert(
      fc.asyncProperty(casArb, async (c) => {
        const local = construireLocal(c.local)
        const sim = nouveauSim(local)
        etat.sim = sim
        const f = fichierAbime(c, local)
        const unSeul = { ...f, chapters: [f.chapters[0]] }
        try {
          await appliquerFusionPortee(
            1,
            unSeul,
            { type: 'chapitre', chapitreId: 10 },
            {
              supprimerAbsents: c.supprimerAbsents,
              sourceName: 's',
            },
          )
        } catch (err) {
          // Seul refus admis : la portée (autre chapitre), avant toute
          // écriture, jamais une erreur de la base.
          expect((err as { code?: string }).code).toBeUndefined()
          expect(String((err as Error).message)).toMatch(/autre chapitre/)
          expect(ecritures(sim)).toEqual([])
          return
        }
        contraintesTenues(sim)
      }),
      { numRuns: 2000, seed: 20261021 },
    )
  })

  it('témoin : SANS validation, le simulateur refuse bien ces fichiers', async () => {
    // Le simulateur contraint attrape ce que la validation corrige : sinon
    // le fuzzing ci-dessus ne prouverait rien.
    const { executerPlan } = await import('#/lib/classeur/merge/apply.ts')
    const local = construireLocal([[{ kind: 'signature_sheet', titre: 'Ok' }]])
    etat.sim = nouveauSim(local)
    await expect(
      executerPlan(1, [
        {
          type: 'creerItem',
          chapitre: { type: 'local', id: 10 },
          uuid: 'doc-1',
          sort_order: 1,
          item: {
            kind: 'document',
            input: { title: 'D', description: '', content: '' },
          },
        },
      ]),
    ).rejects.toMatchObject({ code: '42501' })
    etat.sim = nouveauSim(local)
    await expect(
      executerPlan(1, [
        {
          type: 'modifierItem',
          id: 1,
          item: {
            kind: 'signature_sheet',
            input: { title: 'Ok', description: '', nombre: 100 },
          },
        },
      ]),
    ).rejects.toMatchObject({ code: '42501' })
    etat.sim = nouveauSim(local)
    await expect(
      executerPlan(1, [
        {
          type: 'creerItem',
          chapitre: { type: 'local', id: 10 },
          uuid: null,
          sort_order: 1,
          item: {
            kind: 'tracking_sheet',
            input: { title: 'S', periodicite_id: 999 },
          },
        },
      ]),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

describe('le critère du plan : nombre 100, uuid « doc-1 », périodicité 999', () => {
  beforeEach(() => {
    etat.sim = nouveauSim(construireLocal([[]]))
  })

  it('aperçu avec trois avertissements, import complet sans erreur', async () => {
    const local = construireLocal([[]])
    const f = construireExport(
      CLASSEUR,
      local.chapters,
      local.content,
      PERIODICITES,
    )
    f.chapters[0].items.push(
      {
        kind: 'signature_sheet',
        title: 'Émargement',
        description: '',
        nombre: 100,
        sort_order: 1,
      },
      {
        kind: 'document',
        uuid: 'doc-1',
        title: 'Plan',
        description: '',
        content: 'Le plan.',
        sort_order: 2,
      },
      {
        kind: 'tracking_sheet',
        title: 'Relevé',
        periodicite_id: 999,
        sort_order: 3,
      },
    )
    const a = await previsualiserImportIa(1, f, { supprimerAbsents: false })
    expect(a.plan.warnings).toHaveLength(3)
    const r = await appliquerImportIa(1, f, {
      supprimerAbsents: false,
      sourceName: 's',
    })
    expect(r.inserted).toBe(3)
    const sim = etat.sim
    expect(sim.table('classeur_signature_sheets')[0].nombre).toBe(60)
    expect(sim.table('classeur_tracking_sheets')[0].periodicite_id).toBe(49)
    expect(sim.table('classeur_documents')[0].uuid).not.toBe('doc-1')
  })
})
