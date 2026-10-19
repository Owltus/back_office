import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appliquerFusionPortee } from '#/lib/classeur/merge/apply.ts'
import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import type {
  ActionFusion,
  EtatLocal,
  PlanFusion,
} from '#/lib/classeur/merge/merge.ts'
import {
  alignerApercu,
  clesActions,
  construireExportChapitre,
  construireExportDocument,
  filtrerPlan,
  lignesImport,
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import type { CiblePortee, OptionsPortee } from '#/lib/classeur/merge/portee.ts'
import { ancienPlanifierFusionPortee } from '#/lib/classeur/merge/porteeAvantRefus.oracle.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import { planAvecValidation } from '#/lib/classeur/merge/validationImport.ts'
import type { ClasseurJson, ItemJson } from '#/lib/classeur/merge/schema.ts'
import * as service from '#/lib/classeur/service.ts'
import type { DbDocument, DbTrackingSheet } from '#/lib/classeur/types.ts'

/*
 * Refus d'un élément à l'import JSON (étape 1 du plan
 * `classeur-fonctions-2026-10-04`) — propriétés sur des plans GÉNÉRÉS.
 *
 * Oracles indépendants du code testé :
 *   - (b) l'ANCIENNE `planifierFusionPortee`, copiée avant la modification
 *     (`porteeAvantRefus.oracle.ts`) ;
 *   - (a) le plan filtré = le plan d'origine privé des actions dont la clé
 *     d'origine est refusée (filtre naïf écrit ici) ;
 *   - compteurs : chaque compteur recompté sur les actions restantes, et la
 *     somme des cinq conservée (un élément refusé ne disparaît pas des
 *     comptes : il passe en « inchangé » ou « ignoré ») ;
 *   - (c) tout refuser : le service simulé ne reçoit AUCUNE écriture ni
 *     point de restauration quand il ne reste pas d'action de chapitre ;
 *   - (d) deux calculs du même JSON donnent les mêmes clés, toutes uniques.
 */

vi.mock('#/lib/classeur/service.ts', () => ({
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  restaurerChapter: vi.fn(),
  softDeleteChapter: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  restaurerItem: vi.fn(),
  softDeleteItem: vi.fn(),
  createClasseur: vi.fn(),
  fetchClasseur: vi.fn(),
  fetchChaptersAvecSupprimes: vi.fn(),
  fetchContentAvecSupprimes: vi.fn(),
  fetchPeriodicites: vi.fn(),
  insertMergeHistory: vi.fn(),
  fetchMergeHistory: vi.fn(),
  deleteMergeHistory: vi.fn(),
}))

const mocks = vi.mocked(service)
const NUM_RUNS = 500

// ---------------------------------------------------------------------------
// Générateur : un chapitre local et le JSON retravaillé par un « LLM »
// ---------------------------------------------------------------------------

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })
const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
/** Un document d'un AUTRE chapitre : ne doit jamais apparaître dans un plan. */
const docB = document({
  id: 99,
  chapter_id: 20,
  title: 'Incendie',
  content: 'Évacuer',
})

const TITRES = ['Check-in', 'Check-out', 'Clés', 'Ménage', '']
const TEXTES = ['', 'Une ligne', 'a\nb\nc', 'a\nB\nc\nd', '# Titre\n\nTexte']

interface DescDoc {
  titre: string
  texte: string
  /** Sort du fichier : 0 garder, 1 texte changé, 2 titre changé, 3 retiré, 4 déplacé. */
  sort: number
  texteFichier: string
  titreFichier: string
  ordreFichier: number
}

const descDocArb: fc.Arbitrary<DescDoc> = fc.record({
  titre: fc.constantFrom(...TITRES.filter((t) => t !== '')),
  texte: fc.constantFrom(...TEXTES),
  sort: fc.nat({ max: 4 }),
  texteFichier: fc.constantFrom(...TEXTES),
  titreFichier: fc.constantFrom(...TITRES),
  ordreFichier: fc.integer({ min: 1, max: 6 }),
})

interface DescNouveau {
  titre: string
  texte: string
  ordre: number
  avecUuid: boolean
}

const nouveauArb: fc.Arbitrary<DescNouveau> = fc.record({
  titre: fc.constantFrom('Nouveau', 'Clés', 'Annexe'),
  texte: fc.constantFrom(...TEXTES),
  // Peu de positions possibles : des créations de même position ET de même
  // titre arrivent souvent (clés `#2`).
  ordre: fc.integer({ min: 1, max: 3 }),
  avecUuid: fc.boolean(),
})

interface Cas {
  local: EtatLocal
  fichier: ClasseurJson
  cible: CiblePortee
  options: OptionsPortee
}

const casArb: fc.Arbitrary<Cas> = fc
  .record({
    docs: fc.array(descDocArb, { maxLength: 5 }),
    supprimes: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
    nouveaux: fc.array(nouveauArb, { maxLength: 4 }),
    avecSuivi: fc.boolean(),
    suiviPeriodicite: fc.constantFrom(41, 44),
    libelle: fc.constantFrom('Accueil', 'Accueil (révisé)'),
    supprimerAbsents: fc.boolean(),
    modeDocument: fc.boolean(),
    melanger: fc.boolean(),
    ressusciter: fc.boolean(),
  })
  .map((g) => {
    const documents: DbDocument[] = g.docs.map((d, i) =>
      document({
        id: i + 1,
        chapter_id: 10,
        title: d.titre,
        content: d.texte,
        sort_order: i + 1,
        deleted_at: g.supprimes[i] ? '2026-02-01T00:00:00+00:00' : null,
        version_majeure: 1 + (i % 2),
        version_mineure: i,
      }),
    )
    const tracking: DbTrackingSheet[] = g.avecSuivi
      ? [suivi({ id: 50, chapter_id: 10, title: 'Contrôle', sort_order: 9 })]
      : []
    const local = etat([A, B], {
      documents: [...documents, docB],
      tracking_sheets: tracking,
    })
    const visibles = documents.filter((d) => d.deleted_at === null)

    if (g.modeDocument && visibles.length > 0) {
      const cibleDoc = visibles[0]
      const desc = g.docs[cibleDoc.id - 1]
      const exporte = relire(
        construireExportDocument(classeur(), A, cibleDoc, PERIODICITES),
      )
      const item = exporte.chapters[0].items[0]
      if (desc.sort === 1) item.content = desc.texteFichier
      if (desc.sort === 2 && desc.titreFichier !== '')
        item.title = desc.titreFichier
      return {
        local,
        fichier: exporte,
        cible: { type: 'document', documentId: cibleDoc.id },
        options: { supprimerAbsents: g.supprimerAbsents },
      }
    }

    const exporte = relire(
      construireExportChapitre(
        classeur(),
        A,
        { ...local.content, documents: visibles },
        PERIODICITES,
      ),
    )
    const ch = exporte.chapters[0]
    ch.label = g.libelle
    const items: ItemJson[] = []
    for (const elt of ch.items) {
      if (elt.kind === 'tracking_sheet') {
        items.push({
          ...elt,
          periodicite_id: g.suiviPeriodicite,
        })
        continue
      }
      const id = visibles.find((d) => d.uuid === elt.uuid)?.id ?? 0
      const desc = g.docs[id - 1]
      if (desc.sort === 3) continue
      const copie = { ...elt }
      if (desc.sort === 1) copie.content = desc.texteFichier
      if (desc.sort === 2) copie.title = desc.titreFichier
      if (desc.sort === 4) copie.sort_order = desc.ordreFichier
      items.push(copie)
    }
    // Un document supprimé localement, rendu par le LLM avec son uuid : restauré.
    if (g.ressusciter)
      for (const d of documents.filter((x) => x.deleted_at !== null))
        items.push({
          kind: 'document',
          uuid: d.uuid,
          title: d.title,
          description: '',
          content: 'Revenu',
          sort_order: d.sort_order,
        })
    g.nouveaux.forEach((n, i) => {
      items.push({
        kind: 'document',
        title: n.titre,
        description: '',
        content: n.texte,
        sort_order: n.ordre,
        ...(n.avecUuid ? { uuid: `llm-${String(i)}` } : {}),
      })
    })
    ch.items = g.melanger ? [...items].reverse() : items
    return {
      local,
      fichier: exporte,
      cible: { type: 'chapitre', chapitreId: 10 },
      options: { supprimerAbsents: g.supprimerAbsents },
    }
  })

/** Comme un fichier collé : sérialisé puis relu par le vrai parseur. */
function relire(f: ClasseurJson): ClasseurJson {
  return parseImportJson(JSON.stringify(f))
}

function planDe(c: Cas, exclus?: ReadonlySet<string>): PlanFusion {
  return planifierFusionPortee(c.local, c.fichier, c.cible, c.options, exclus)
}

/** Les clés du plan, et un sous-ensemble refusé (plus des clés inconnues). */
const casEtRefusArb = casArb.chain((c) => {
  const cles = clesActions(planDe(c).actions).filter(
    (k): k is string => k !== null,
  )
  return fc
    .tuple(
      fc.subarray(cles),
      fc.array(fc.constantFrom('document:12345', 'nouveau:document:7:X', 'x'), {
        maxLength: 2,
      }),
    )
    .map(([refus, bruit]) => ({
      cas: c,
      exclus: new Set([...refus, ...bruit]),
    }))
})

// ---------------------------------------------------------------------------
// Lois de comptage, écrites ici sans réutiliser le code testé
// ---------------------------------------------------------------------------

function compter(actions: readonly ActionFusion[]) {
  let inserted = 0
  let updated = 0
  let deleted = 0
  for (const a of actions) {
    if (
      a.type === 'creerItem' ||
      a.type === 'restaurerItem' ||
      a.type === 'creerChapitre' ||
      a.type === 'restaurerChapitre'
    )
      inserted += 1
    else if (a.type === 'modifierItem' || a.type === 'modifierChapitre')
      updated += 1
    else deleted += 1
  }
  return { inserted, updated, deleted }
}

const somme = (r: PlanFusion['resultat']) =>
  r.inserted + r.updated + r.unchanged + r.skipped + r.deleted

// ---------------------------------------------------------------------------

describe('refus à l’import — propriétés (plans générés)', () => {
  it('(b) sans refus, le plan est IDENTIQUE à celui d’avant la fonction', () => {
    fc.assert(
      fc.property(casArb, (c) => {
        let ancien: PlanFusion | Error
        try {
          ancien = ancienPlanifierFusionPortee(
            c.local,
            c.fichier,
            c.cible,
            c.options,
          )
        } catch (e) {
          ancien = e as Error
        }
        for (const exclus of [undefined, new Set<string>()]) {
          if (ancien instanceof Error) {
            expect(() => planDe(c, exclus)).toThrow(ancien.message)
          } else {
            expect(planDe(c, exclus)).toEqual(ancien)
          }
        }
      }),
      { numRuns: NUM_RUNS, seed: 20261004 },
    )
  })

  it('(a) le plan filtré = le plan privé des actions refusées, rien d’autre', () => {
    fc.assert(
      fc.property(casEtRefusArb, ({ cas, exclus }) => {
        const plan = planDe(cas)
        const cles = clesActions(plan.actions)
        const attendu = plan.actions.filter((_, i) => {
          const k = cles[i]
          return k === null || !exclus.has(k)
        })
        const { plan: filtre, ignores } = filtrerPlan(plan, exclus)
        expect(filtre.actions).toEqual(attendu)
        // Intersection vide : aucune action gardée ne portait une clé refusée.
        const gardees = new Set(filtre.actions)
        plan.actions.forEach((a, i) => {
          const k = cles[i]
          if (k !== null && exclus.has(k)) expect(gardees.has(a)).toBe(false)
        })
        expect(ignores).toBe(plan.actions.length - attendu.length)
        // Le même filtre par `planifierFusionPortee(…, exclus)`.
        expect(planDe(cas, exclus).actions).toEqual(attendu)
      }),
      { numRuns: NUM_RUNS, seed: 20261005 },
    )
  })

  it('compteurs recalculés : chaque compteur suit les actions, la somme est conservée', () => {
    fc.assert(
      fc.property(casEtRefusArb, ({ cas, exclus }) => {
        const plan = planDe(cas)
        const filtre = planDe(cas, exclus)
        if (cas.cible.type === 'chapitre') {
          // Le plan d'un chapitre compte ses actions une à une.
          const n = compter(filtre.actions)
          expect(filtre.resultat.inserted).toBe(n.inserted)
          expect(filtre.resultat.updated).toBe(n.updated)
          expect(filtre.resultat.deleted).toBe(n.deleted)
        } else {
          expect(filtre.resultat.updated).toBe(filtre.actions.length)
        }
        expect(somme(filtre.resultat)).toBe(somme(plan.resultat))
        // Un refus ne fait que DÉPLACER vers « inchangé » / « ignoré ».
        expect(filtre.resultat.unchanged).toBeGreaterThanOrEqual(
          plan.resultat.unchanged,
        )
        expect(filtre.resultat.skipped).toBeGreaterThanOrEqual(
          plan.resultat.skipped,
        )
        // L'aperçu perd exactement les lignes des actions retirées.
        const horsIgnores = (p: PlanFusion) =>
          p.apercu.filter((l) => l.action !== 'skip').length
        expect(horsIgnores(plan)).toBe(plan.actions.length)
        expect(horsIgnores(filtre)).toBe(filtre.actions.length)
        expect(filtre.apercu.filter((l) => l.action === 'skip')).toEqual(
          plan.apercu.filter((l) => l.action === 'skip'),
        )
      }),
      { numRuns: NUM_RUNS, seed: 20261006 },
    )
  })

  it('(d) clés stables : deux calculs du même JSON donnent les mêmes clés, uniques', () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const k1 = clesActions(planDe(c).actions)
        const k2 = clesActions(
          planDe({ ...c, fichier: relire(c.fichier) }).actions,
        )
        expect(k2).toEqual(k1)
        const cles = k1.filter((k) => k !== null)
        expect(new Set(cles).size).toBe(cles.length)
      }),
      { numRuns: NUM_RUNS, seed: 20261007 },
    )
  })

  it('jamais un élément hors portée : le document d’un autre chapitre n’a pas de ligne', () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const plan = planDe(c)
        const lignes = lignesImport(c.local, plan)
        expect(lignes).toHaveLength(plan.actions.length)
        expect(lignes.map((l) => l.cle)).toEqual(clesActions(plan.actions))
        expect(lignes.some((l) => l.cle === 'document:99')).toBe(false)
      }),
      { numRuns: NUM_RUNS, seed: 20261008 },
    )
  })

  it('alignerApercu : chaque action reçoit une ligne distinte, dans l’ordre', () => {
    fc.assert(
      fc.property(casArb, (c) => {
        const plan = planDe(c)
        const idx = alignerApercu(plan.actions, plan.apercu)
        expect(idx.every((i) => i >= 0)).toBe(true)
        for (let i = 1; i < idx.length; i++)
          expect(idx[i]).toBeGreaterThan(idx[i - 1])
      }),
      { numRuns: NUM_RUNS, seed: 20261009 },
    )
  })
})

// ---------------------------------------------------------------------------
// (c) Tout refuser : rien n'est écrit, pas même un point de restauration
// ---------------------------------------------------------------------------

describe('refus à l’import — (c) tout refusé', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchClasseur.mockResolvedValue(classeur())
    mocks.fetchPeriodicites.mockResolvedValue(PERIODICITES)
    mocks.insertMergeHistory.mockResolvedValue(1)
    mocks.fetchMergeHistory.mockResolvedValue([])
  })

  it('aucune écriture ni point quand il ne reste aucune action de chapitre', async () => {
    await fc.assert(
      fc.asyncProperty(casArb, async (c) => {
        vi.clearAllMocks()
        mocks.fetchClasseur.mockResolvedValue(classeur())
        mocks.fetchPeriodicites.mockResolvedValue(PERIODICITES)
        mocks.fetchChaptersAvecSupprimes.mockResolvedValue(c.local.chapters)
        mocks.fetchContentAvecSupprimes.mockResolvedValue(c.local.content)
        mocks.insertMergeHistory.mockResolvedValue(1)
        mocks.fetchMergeHistory.mockResolvedValue([])
        // Le plan de l'application, VALIDATION comprise (étape 6 du plan
        // `classeur-echange-ia-2026-10-19` : un élément au titre vidé est
        // ignoré avant le plan, ses actions n'existent plus).
        let plan: PlanFusion
        try {
          plan = planAvecValidation(c.local, c.fichier, (f) =>
            planifierFusionPortee(c.local, f, c.cible, c.options),
          )
        } catch {
          return
        }
        const toutes = new Set(
          clesActions(plan.actions).filter((k): k is string => k !== null),
        )
        const r = await appliquerFusionPortee(1, c.fichier, c.cible, {
          ...c.options,
          sourceName: 's',
          exclus: toutes,
        })
        const chapitres = plan.actions.filter(
          (a) => a.type === 'modifierChapitre',
        )
        expect(r.ignores).toBe(toutes.size)
        expect(mocks.updateItem).not.toHaveBeenCalled()
        expect(mocks.createItem).not.toHaveBeenCalled()
        expect(mocks.restaurerItem).not.toHaveBeenCalled()
        expect(mocks.softDeleteItem).not.toHaveBeenCalled()
        if (chapitres.length === 0) {
          expect(mocks.insertMergeHistory).not.toHaveBeenCalled()
          expect(mocks.fetchMergeHistory).not.toHaveBeenCalled()
          expect(mocks.updateChapter).not.toHaveBeenCalled()
        } else {
          // Le libellé du chapitre suit le fichier : point AVANT, une écriture.
          expect(mocks.insertMergeHistory).toHaveBeenCalledTimes(1)
          expect(mocks.updateChapter).toHaveBeenCalledTimes(chapitres.length)
        }
      }),
      { numRuns: NUM_RUNS, seed: 20261010 },
    )
  })
})

describe('refus à l’import — le générateur couvre les cas utiles', () => {
  it('modifications, créations en double (#2), suppressions, chapitre, document, erreurs', () => {
    const vus = {
      modif: 0,
      creation: 0,
      double: 0,
      suppression: 0,
      restauration: 0,
      chapitre: 0,
      document: 0,
      deplace: 0,
      erreur: 0,
    }
    fc.assert(
      fc.property(casArb, (c) => {
        let plan: PlanFusion
        try {
          plan = planDe(c)
        } catch {
          vus.erreur += 1
          return
        }
        const cles = clesActions(plan.actions)
        if (c.cible.type === 'document') vus.document += 1
        if (cles.some((k) => k?.includes('#') === true)) vus.double += 1
        for (const l of lignesImport(c.local, plan)) {
          if (l.genre === 'modification') vus.modif += 1
          if (l.genre === 'creation') vus.creation += 1
          if (l.genre === 'suppression') vus.suppression += 1
          if (l.genre === 'restauration') vus.restauration += 1
          if (l.genre === 'chapitre') vus.chapitre += 1
          if (l.changement === 'ordre') vus.deplace += 1
        }
      }),
      { numRuns: NUM_RUNS, seed: 20261011 },
    )
    expect(vus.modif).toBeGreaterThan(50)
    expect(vus.creation).toBeGreaterThan(50)
    expect(vus.double).toBeGreaterThan(5)
    expect(vus.suppression).toBeGreaterThan(20)
    expect(vus.chapitre).toBeGreaterThan(50)
    expect(vus.document).toBeGreaterThan(20)
    expect(vus.deplace).toBeGreaterThan(5)
    expect(vus.restauration).toBeGreaterThan(20)
  })
})
