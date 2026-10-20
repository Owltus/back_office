import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
  intercalaire,
  signature,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import {
  destinationImport,
  fichierSansHorodatage,
  planifierImportIa,
  planifierVers,
} from '#/lib/classeur/merge/importIa.ts'
import type { ContexteImport } from '#/lib/classeur/merge/importIa.ts'
import {
  construireExportChapitre,
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type {
  ActionFusion,
  EtatLocal,
  RefChapitre,
} from '#/lib/classeur/merge/merge.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson, ItemJson } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterContent,
  DbChapter,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { ITEM_KINDS, flattenItems } from '#/lib/classeur/types.ts'

/*
 * Import d'un fichier rendu par une IA (étape 5 du plan
 * `classeur-echange-ia-2026-10-19`). Oracle INDÉPENDANT : un exécuteur naïf
 * applique le plan à un modèle en mémoire, puis on vérifie « le fichier fait
 * foi » sans relire les règles de la fusion :
 *   - chaque élément du fichier existe, non supprimé, dans le chapitre du
 *     fichier, avec EXACTEMENT les champs du fichier, quel que soit son
 *     `updated_at` (plus ancien, égal, plus récent, absent) ;
 *   - AUCUN élément ni chapitre absent du fichier n'est supprimé (décision
 *     utilisateur du 2026-10-20 : plus de case) ;
 *   - un élément ou un chapitre gardé dans le fichier et marqué
 *     `"supprimer": true` part à la corbeille (lui, ou son chapitre), et
 *     RIEN d'autre n'est supprimé ;
 *   - aucune action ne porte d'horodatage, et le plan ne dépend pas des
 *     horodatages du fichier.
 * Les fichiers imitent ce qu'une IA fait d'un export : textes, titres,
 * réglages changés, éléments retirés (ou marqués), déplacés, ajoutés SANS
 * uuid, chapitres renommés, retirés (ou marqués) ou ajoutés, et des éléments supprimés localement depuis
 * l'export (restaurés : le fichier fait foi).
 */

const NUM_RUNS = 1000
const SEED = 20261019

const DATES = [
  '2020-01-01T00:00:00+00:00',
  '2026-01-01T00:00:00+00:00',
  '2030-01-01T00:00:00+00:00',
]
const T_SUPPR = '2026-02-01T00:00:00+00:00'

interface DescItem {
  kind: ItemKind
  titre: string
  supprime: boolean
  date: number
}
interface DescChapitre {
  libelle: string
  supprime: boolean
  items: DescItem[]
}
/** Ce que « l'IA » fait d'un élément exporté. */
interface Derivation {
  /** 0 garder, 1 titre, 2 texte, 3 réglage, 4 retirer, 5 déplacer. */
  geste: number
  versChapitre: number
  date: number
  /** 0 garder la date, 1 la retirer, 2 plus ancienne, 3 plus récente. */
  dateGeste: number
  nombre: number
  periodicite: number
}
interface Desc {
  chapitres: DescChapitre[]
  derivations: Derivation[]
  /** 0 garder, 1 renommer, 2 retirer. */
  gestesChapitres: number[]
  nouveaux: Array<{ kind: ItemKind; chapitre: number }>
  chapitresNeufs: number
  /** Éléments supprimés localement mais encore dans le fichier. */
  perimes: boolean
  /**
   * Un élément ou un chapitre « retiré » : gardé et marqué `supprimer`
   * (vrai), ou ôté du fichier comme le faisait une IA tronquée (faux).
   */
  marquer: boolean
}

const itemArb = fc.record({
  kind: fc.constantFrom(...ITEM_KINDS),
  titre: fc.constantFrom('Consignes', 'Registre', 'a', 'Émargement'),
  supprime: fc.oneof(
    { weight: 4, arbitrary: fc.constant(false) },
    { weight: 1, arbitrary: fc.constant(true) },
  ),
  date: fc.nat({ max: 2 }),
})

const descArb: fc.Arbitrary<Desc> = fc.record({
  chapitres: fc.array(
    fc.record({
      libelle: fc.constantFrom('Sécurité', 'Sanitaire', 'Chap'),
      supprime: fc.oneof(
        { weight: 5, arbitrary: fc.constant(false) },
        { weight: 1, arbitrary: fc.constant(true) },
      ),
      items: fc.array(itemArb, { maxLength: 4 }),
    }),
    { minLength: 1, maxLength: 3 },
  ),
  derivations: fc.array(
    fc.record({
      geste: fc.nat({ max: 5 }),
      versChapitre: fc.nat({ max: 9 }),
      date: fc.nat({ max: 2 }),
      dateGeste: fc.nat({ max: 3 }),
      nombre: fc.integer({ min: 1, max: 60 }),
      periodicite: fc.nat({ max: PERIODICITES.length - 1 }),
    }),
    { minLength: 12, maxLength: 12 },
  ),
  gestesChapitres: fc.array(fc.nat({ max: 2 }), {
    minLength: 3,
    maxLength: 3,
  }),
  nouveaux: fc.array(
    fc.record({
      kind: fc.constantFrom(...ITEM_KINDS),
      chapitre: fc.nat({ max: 9 }),
    }),
    { maxLength: 3 },
  ),
  chapitresNeufs: fc.nat({ max: 2 }),
  perimes: fc.boolean(),
  marquer: fc.boolean(),
})

function construireLocal(d: Desc): EtatLocal {
  const chapters: DbChapter[] = d.chapitres.map((c, i) =>
    chapitre({
      id: 10 * (i + 1),
      label: c.libelle,
      sort_order: i + 1,
      deleted_at: c.supprime ? T_SUPPR : null,
    }),
  )
  const content: ChapterContent = {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
  }
  let id = 0
  d.chapitres.forEach((c, i) => {
    c.items.forEach((el, j) => {
      id += 1
      const base = {
        id,
        chapter_id: 10 * (i + 1),
        title: el.titre,
        sort_order: j + 1,
        updated_at: DATES[el.date],
        deleted_at: el.supprime ? T_SUPPR : null,
      }
      if (el.kind === 'document')
        content.documents.push(document({ ...base, content: `texte ${id}` }))
      else if (el.kind === 'tracking_sheet')
        content.tracking_sheets.push(suivi(base))
      else if (el.kind === 'signature_sheet')
        content.signature_sheets.push(signature(base))
      else content.intercalaires.push(intercalaire(base))
    })
  })
  return etat(chapters, content)
}

/** Le fichier « rendu par l'IA » : l'export, retravaillé selon `d`. */
function construireFichier(local: EtatLocal, d: Desc): ClasseurJson {
  const f = construireExport(
    classeur(),
    local.chapters,
    local.content,
    PERIODICITES,
  )
  // Éléments supprimés localement APRÈS l'export : encore dans le fichier.
  if (d.perimes) {
    for (const el of flattenItems(local.content)) {
      if (el.data.deleted_at === null) continue
      const ch = local.chapters.find((c) => c.id === el.data.chapter_id)
      const chJson = f.chapters.find((c) => c.uuid === ch?.uuid)
      if (chJson === undefined) continue
      const vivant = {
        ...el,
        data: { ...el.data, deleted_at: null },
      } as typeof el
      const e = construireExport(
        classeur(),
        [{ ...(ch as DbChapter), deleted_at: null }],
        contenuDe(vivant),
        PERIODICITES,
      )
      chJson.items.push(e.chapters[0].items[0])
    }
  }
  const n = f.chapters.length
  // Chapitres neufs (sans uuid, libellé neuf).
  for (let k = 0; k < d.chapitresNeufs; k++) {
    f.chapters.push({
      uid: `neuf-${String(k)}`,
      label: `Neuf ${String(k)}`,
      icon: 'FileText',
      description: '',
      sort_order: 100 + k,
      items: [],
    })
  }
  const total = f.chapters.length
  // Gestes sur les éléments exportés (dans l'ordre de lecture).
  let rang = 0
  const deplaces: Array<{ item: ItemJson; vers: number }> = []
  for (const c of f.chapters.slice(0, n)) {
    c.items = c.items.flatMap((item) => {
      const g = d.derivations[rang % d.derivations.length]
      rang += 1
      const el: ItemJson = { ...item }
      if (g.dateGeste === 1) delete el.updated_at
      else if (g.dateGeste === 2) el.updated_at = DATES[0]
      else if (g.dateGeste === 3) el.updated_at = DATES[2]
      switch (g.geste) {
        case 1:
          el.title = `${el.title} revu ${String(rang)}`
          break
        case 2:
          if (el.kind === 'document') el.content = `réécrit ${String(rang)}`
          else if (el.kind !== 'tracking_sheet')
            el.description = `décrit ${String(rang)}`
          break
        case 3:
          if (el.kind === 'signature_sheet') el.nombre = g.nombre
          if (el.kind === 'tracking_sheet')
            el.periodicite_id = PERIODICITES[g.periodicite].id
          break
        case 4:
          return d.marquer ? [{ ...el, supprimer: true as const }] : []
        case 5:
          deplaces.push({ item: el, vers: g.versChapitre % total })
          return []
      }
      return [el]
    })
  }
  for (const { item, vers } of deplaces) f.chapters[vers].items.push(item)
  // Éléments neufs : sans uuid, titre neuf (aucun repli par titre possible).
  d.nouveaux.forEach((nv, k) => {
    if (total === 0) return
    const el: ItemJson = {
      kind: nv.kind,
      title: `Nouveau ${String(k)}`,
      sort_order: 50 + k,
    }
    if (nv.kind === 'document') {
      el.description = ''
      el.content = `neuf ${String(k)}`
    } else if (nv.kind === 'tracking_sheet') el.periodicite_id = 44
    else if (nv.kind === 'signature_sheet') {
      el.description = ''
      el.nombre = 20
    } else el.description = ''
    f.chapters[nv.chapitre % total].items.push(el)
  })
  // Gestes sur les chapitres exportés, en dernier (un chapitre retiré emporte
  // ce qu'il contient, déplacés compris).
  const gardes = f.chapters.flatMap((c, i) => {
    if (i >= n) return [c]
    const g = d.gestesChapitres[i % d.gestesChapitres.length]
    if (g === 1) c.label = `${c.label} renommé`
    if (g !== 2) return [c]
    return d.marquer ? [{ ...c, supprimer: true as const }] : []
  })
  return { ...f, chapters: gardes }
}

function contenuDe(el: ReturnType<typeof flattenItems>[number]) {
  const c: ChapterContent = {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
  }
  if (el.kind === 'document') c.documents.push(el.data)
  else if (el.kind === 'tracking_sheet') c.tracking_sheets.push(el.data)
  else if (el.kind === 'signature_sheet') c.signature_sheets.push(el.data)
  else c.intercalaires.push(el.data)
  return c
}

// ---------------------------------------------------------------------------
// Exécuteur naïf (indépendant de `apply.ts`)
// ---------------------------------------------------------------------------

interface ItemModele {
  kind: ItemKind
  uuid: string | null
  chapter_id: number
  champs: Record<string, unknown>
  supprime: boolean
}
interface Modele {
  chapitres: Map<
    number,
    { label: string; uuid: string | null; supprime: boolean }
  >
  items: Map<string, ItemModele>
}

function modeleDe(local: EtatLocal): Modele {
  const chapitres = new Map(
    local.chapters.map((c) => [
      c.id,
      { label: c.label, uuid: c.uuid, supprime: c.deleted_at !== null },
    ]),
  )
  const items = new Map<string, ItemModele>()
  for (const el of flattenItems(local.content)) {
    const d = el.data as unknown as Record<string, unknown>
    items.set(`${el.kind}:${String(el.data.id)}`, {
      kind: el.kind,
      uuid: el.data.uuid,
      chapter_id: el.data.chapter_id,
      champs: champsUtiles(el.kind, d),
      supprime: el.data.deleted_at !== null,
    })
  }
  return { chapitres, items }
}

function champsUtiles(
  kind: ItemKind,
  d: Record<string, unknown>,
): Record<string, unknown> {
  switch (kind) {
    case 'document':
      return {
        title: d.title,
        description: d.description ?? '',
        content: d.content ?? '',
      }
    case 'tracking_sheet':
      return { title: d.title, periodicite_id: d.periodicite_id }
    case 'signature_sheet':
      return {
        title: d.title,
        description: d.description ?? '',
        nombre: d.nombre ?? 14,
      }
    case 'intercalaire':
      return { title: d.title, description: d.description ?? '' }
  }
}

function executer(modele: Modele, actions: ActionFusion[]): Modele {
  const nouveaux: number[] = []
  let prochain = 10_000
  const resoudre = (r: RefChapitre) =>
    r.type === 'local' ? r.id : nouveaux[r.index]
  for (const a of actions) {
    switch (a.type) {
      case 'creerChapitre':
        prochain += 1
        nouveaux[a.index] = prochain
        modele.chapitres.set(prochain, {
          label: a.label,
          uuid: a.uuid,
          supprime: false,
        })
        break
      case 'modifierChapitre':
      case 'restaurerChapitre': {
        const c = modele.chapitres.get(a.id)
        if (c === undefined) throw new Error('chapitre inconnu')
        c.label = a.label
        if (a.type === 'restaurerChapitre') c.supprime = false
        break
      }
      case 'supprimerChapitre': {
        const c = modele.chapitres.get(a.id)
        if (c === undefined) throw new Error('chapitre inconnu')
        c.supprime = true
        break
      }
      case 'creerItem':
        prochain += 1
        modele.items.set(`${a.item.kind}:${String(prochain)}`, {
          kind: a.item.kind,
          uuid: a.uuid,
          chapter_id: resoudre(a.chapitre),
          champs: champsUtiles(a.item.kind, a.item.input),
          supprime: false,
        })
        break
      case 'modifierItem':
      case 'restaurerItem': {
        const el = modele.items.get(`${a.item.kind}:${String(a.id)}`)
        if (el === undefined) throw new Error('élément inconnu')
        el.champs = champsUtiles(a.item.kind, a.item.input)
        if (a.chapitre !== undefined) el.chapter_id = resoudre(a.chapitre)
        if (a.type === 'restaurerItem') el.supprime = false
        break
      }
      case 'supprimerItem': {
        const el = modele.items.get(`${a.kind}:${String(a.id)}`)
        if (el === undefined) throw new Error('élément inconnu')
        el.supprime = true
        break
      }
    }
  }
  return modele
}

/** Ce que le fichier dit d'un élément (mêmes défauts que la fusion). */
function attendu(item: ItemJson): Record<string, unknown> {
  return champsUtiles(item.kind as ItemKind, {
    ...item,
    description: item.description ?? '',
  })
}

function verifier(local: EtatLocal, f: ClasseurJson): void {
  const plan = planifierImportIa(local, f)
  // Aucun horodatage ne part en base.
  for (const a of plan.actions) expect('updated_at' in a).toBe(false)

  const avant = modeleDe(local)
  const apres = executer(modeleDe(local), plan.actions)

  const chapitresMarques = new Set(
    f.chapters.flatMap((c) =>
      c.supprimer === true && c.uuid !== undefined ? [c.uuid] : [],
    ),
  )
  const itemsMarques = new Set(
    f.chapters.flatMap((c) =>
      c.items.flatMap((i) =>
        (i.supprimer === true || c.supprimer === true) && i.uuid !== undefined
          ? [i.uuid]
          : [],
      ),
    ),
  )
  // Chapitre final de chaque chapitre NON marqué du fichier.
  const chapitreFinal = f.chapters.map((c) => {
    if (c.supprimer === true) return null
    for (const [id, ch] of apres.chapitres) {
      if (ch.supprime) continue
      if (c.uuid !== undefined ? ch.uuid === c.uuid : ch.label === c.label)
        return id
    }
    throw new Error(`chapitre ${c.label} absent`)
  })
  // Le fichier fait foi : chaque élément non marqué, à sa place, avec ses
  // champs.
  f.chapters.forEach((c, i) => {
    if (c.supprimer === true) return
    for (const item of c.items) {
      if (item.supprimer === true) continue
      const trouve = [...apres.items.entries()].find(([, el]) =>
        item.uuid !== undefined
          ? el.uuid === item.uuid
          : !el.supprime &&
            el.kind === item.kind &&
            el.champs.title === item.title,
      )
      expect(trouve, item.title).toBeDefined()
      const [, el] = trouve as [string, ItemModele]
      expect(el.supprime, item.title).toBe(false)
      expect(el.chapter_id, item.title).toBe(chapitreFinal[i])
      expect(el.champs, item.title).toEqual(attendu(item))
    }
  })
  // AUCUN élément local absent du fichier (ou non marqué) n'est supprimé ;
  // un marqué part à la corbeille, lui ou son chapitre.
  for (const [cle, el] of avant.items) {
    const final = apres.items.get(cle) as ItemModele
    const marque = el.uuid !== null && itemsMarques.has(el.uuid)
    if (!marque) {
      if (!el.supprime) expect(final.supprime, cle).toBe(false)
    } else {
      const chapitre = apres.chapitres.get(final.chapter_id)
      expect(final.supprime || chapitre?.supprime === true, cle).toBe(true)
    }
  }
  for (const [id, c] of avant.chapitres) {
    const final = apres.chapitres.get(id)
    const marque = c.uuid !== null && chapitresMarques.has(c.uuid)
    if (!marque && !c.supprime) expect(final?.supprime, c.label).toBe(false)
    if (marque) expect(final?.supprime, c.label).toBe(true)
  }
  // Une suppression ne vise QUE ce qui est marqué.
  for (const a of plan.actions) {
    if (a.type === 'supprimerItem') {
      const el = avant.items.get(`${a.kind}:${String(a.id)}`)
      expect(el?.uuid != null && itemsMarques.has(el.uuid), String(a.id)).toBe(
        true,
      )
    }
    if (a.type === 'supprimerChapitre') {
      const c = avant.chapitres.get(a.id)
      expect(
        c?.uuid != null && chapitresMarques.has(c.uuid),
        String(a.id),
      ).toBe(true)
    }
  }
  const sansMarque = chapitresMarques.size === 0 && itemsMarques.size === 0
  if (sansMarque) {
    expect(plan.actions.some((a) => a.type === 'supprimerItem')).toBe(false)
    expect(plan.actions.some((a) => a.type === 'supprimerChapitre')).toBe(false)
    expect(plan.resultat.deleted).toBe(0)
    expect(plan.apercu.some((l) => l.action === 'delete')).toBe(false)
  }
}

describe('planifierImportIa — propriétés (le fichier fait foi)', () => {
  it(`oracle naïf, ${String(NUM_RUNS)} fichiers`, () => {
    fc.assert(
      fc.property(descArb, (d) => {
        const local = construireLocal(d)
        verifier(local, construireFichier(local, d))
      }),
      { numRuns: NUM_RUNS, seed: SEED },
    )
  })

  it('le plan ne dépend pas des horodatages du fichier', () => {
    fc.assert(
      fc.property(
        descArb,
        fc.array(fc.option(fc.nat({ max: 2 }), { nil: null }), {
          minLength: 30,
          maxLength: 30,
        }),
        (d, dates) => {
          const local = construireLocal(d)
          const f = construireFichier(local, d)
          const autre = structuredClone(f)
          let k = 0
          for (const c of autre.chapters)
            for (const el of c.items) {
              const n = dates[k % dates.length]
              k += 1
              if (n === null) delete el.updated_at
              else el.updated_at = DATES[n]
            }
          expect(planifierImportIa(local, autre)).toEqual(
            planifierImportIa(local, f),
          )
        },
      ),
      { numRuns: NUM_RUNS, seed: SEED + 1 },
    )
  })

  it('sans marque : le remplacement sans horodatage, moins TOUTES ses suppressions', () => {
    fc.assert(
      fc.property(descArb, (d) => {
        const local = construireLocal(d)
        const f = construireFichier(local, { ...d, marquer: false })
        const remplacement = planifierFusion(local, fichierSansHorodatage(f), {
          replace: true,
        })
        const supprimer = (a: ActionFusion) =>
          a.type === 'supprimerItem' || a.type === 'supprimerChapitre'
        const n = remplacement.actions.filter(supprimer).length
        expect(planifierImportIa(local, f)).toEqual({
          actions: remplacement.actions.filter((a) => !supprimer(a)),
          warnings: remplacement.warnings,
          resultat: {
            ...remplacement.resultat,
            deleted: remplacement.resultat.deleted - n,
            unchanged: remplacement.resultat.unchanged + n,
          },
          apercu: remplacement.apercu.filter((l) => l.action !== 'delete'),
        })
      }),
      { numRuns: NUM_RUNS, seed: SEED + 2 },
    )
  })
})

describe('planifierImportIa — cas posés à la main', () => {
  const A = chapitre({ id: 10, label: 'Accueil' })
  const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
  const d1 = document({
    id: 1,
    chapter_id: 10,
    title: 'Check-in',
    content: 'avant',
    updated_at: DATES[1],
  })
  const d2 = document({ id: 2, chapter_id: 20, title: 'Extincteur' })
  const local = etat([A, B], { documents: [d1, d2] })
  const exp = () => construireExport(classeur(), [A, B], local.content, [])

  it('une modification datée d’AVANT le local s’applique quand même', () => {
    const f = exp()
    f.chapters[0].items[0].content = 'après'
    f.chapters[0].items[0].updated_at = DATES[0]
    const plan = planifierImportIa(local, f)
    expect(plan.actions).toEqual([
      {
        type: 'modifierItem',
        id: 1,
        item: {
          kind: 'document',
          input: { title: 'Check-in', description: '', content: 'après' },
        },
      },
    ])
    // Témoin : la fusion de Registre l'ignore (R7).
    expect(planifierFusion(local, f, { replace: false }).actions).toEqual([])
  })

  it('un chapitre retiré : rien supprimé, compté inchangé ; marqué : à la corbeille', () => {
    const f = exp()
    f.chapters.splice(1, 1)
    const sans = planifierImportIa(local, f)
    expect(sans.actions).toEqual([])
    expect(sans.resultat).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 4,
      skipped: 0,
      deleted: 0,
    })
    // Marqué : seul le chapitre part, son document le suit (aucune action
    // à part, comme la suppression d'un chapitre à l'écran).
    const marque = exp()
    marque.chapters[1].supprimer = true
    const avec = planifierImportIa(local, marque)
    expect(avec.actions).toEqual([{ type: 'supprimerChapitre', id: 20 }])
    expect(avec.resultat.deleted).toBe(1)
    expect(avec.apercu).toEqual([
      expect.objectContaining({ action: 'delete', kind: 'chapter' }),
    ])
  })

  it('un document supprimé depuis l’export est restauré (le fichier fait foi)', () => {
    const f = exp()
    const supprime = etat([A, B], {
      documents: [{ ...d1, deleted_at: T_SUPPR }, d2],
    })
    const plan = planifierImportIa(supprime, f)
    expect(plan.actions.map((a) => a.type)).toEqual(['restaurerItem'])
  })
})

describe('`"supprimer": true` sur un élément', () => {
  const A = chapitre({ id: 10, label: 'Accueil' })
  const d1 = document({ id: 1, chapter_id: 10, title: 'Check-in' })
  const d2 = document({ id: 2, chapter_id: 10, title: 'Check-out' })
  const local = etat([A], { documents: [d1, d2] })
  const exp = () => construireExport(classeur(), [A], local.content, [])

  it('un élément marqué : mis à la corbeille (douce), le reste intact', () => {
    const f = exp()
    f.chapters[0].items[1].supprimer = true
    const plan = planifierImportIa(local, f)
    expect(plan.actions).toEqual([
      { type: 'supprimerItem', kind: 'document', id: 2 },
    ])
    expect(plan.resultat).toMatchObject({ deleted: 1, unchanged: 2 })
  })

  it('marqué mais modifié : supprimé, la modification est ignorée', () => {
    const f = exp()
    f.chapters[0].items[1].supprimer = true
    f.chapters[0].items[1].content = 'réécrit'
    expect(planifierImportIa(local, f).actions).toEqual([
      { type: 'supprimerItem', kind: 'document', id: 2 },
    ])
  })

  it('un marqué inconnu ici, ou déjà à la corbeille : aucune action', () => {
    const f = exp()
    f.chapters[0].items.push({
      kind: 'document',
      title: 'Inventé',
      sort_order: 9,
      supprimer: true,
    })
    expect(planifierImportIa(local, f).actions).toEqual([])
    const corbeille = etat([A], {
      documents: [d1, { ...d2, deleted_at: T_SUPPR }],
    })
    const g = construireExport(classeur(), [A], local.content, [])
    g.chapters[0].items[1].supprimer = true
    expect(planifierImportIa(corbeille, g).actions).toEqual([])
  })
})

describe('destinationImport : la portée déduite du fichier', () => {
  const A = chapitre({ id: 10, label: 'Accueil' })
  const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
  const d1 = document({ id: 1, chapter_id: 10, title: 'Check-in' })
  const local = etat([A, B], { documents: [d1] })
  const cl = classeur()
  const base = () => construireExport(cl, [A], etat([A]).content, [])

  it('le même classeur : rien à dire ; sans portée : le classeur', () => {
    expect(destinationImport(local, base(), cl, { type: 'classeur' })).toEqual({
      cible: { type: 'classeur' },
      note: null,
      avertissements: [],
    })
    const f = construireExport(cl, [A, B], local.content, [])
    if (f._metadata) delete f._metadata.portee
    expect(destinationImport(local, f, cl, { type: 'classeur' }).cible).toEqual(
      { type: 'classeur' },
    )
  })

  it('un autre classeur : un avertissement, nommé si possible (D10)', () => {
    const f = base()
    f._metadata!.portee = {
      type: 'classeur',
      classeur_uuid: 'autre',
      classeur_name: 'Carnet sanitaire',
    }
    expect(
      destinationImport(local, f, cl, { type: 'classeur' }).avertissements,
    ).toEqual([
      "Ce fichier vient du classeur Carnet sanitaire, pas de celui-ci. Relisez l'aperçu avant d'importer.",
    ])
    f._metadata!.portee = {
      type: 'classeur',
      classeur_uuid: 'autre',
      classeur_name: ' ',
    }
    expect(
      destinationImport(local, f, cl, { type: 'classeur' }).avertissements,
    ).toEqual([
      "Ce fichier vient d'un autre classeur. Relisez l'aperçu avant d'importer.",
    ])
  })

  it('un chapitre ou un document de CE classeur : routé vers lui, dit', () => {
    const f = base()
    f._metadata!.portee = {
      type: 'chapitre',
      chapitre_uuid: A.uuid,
      chapitre_label: 'Accueil',
    }
    expect(destinationImport(local, f, cl, { type: 'classeur' })).toEqual({
      cible: { type: 'chapitre', chapitreId: 10 },
      note: 'Ce fichier concerne le chapitre Accueil. Le reste du classeur ne change pas.',
      avertissements: [],
    })
    // Depuis la page de ce chapitre : rien à dire.
    expect(
      destinationImport(local, f, cl, { type: 'chapitre', chapitreId: 10 })
        .note,
    ).toBeNull()
    const doc = construireExport(cl, [A], local.content, [])
    doc._metadata!.portee = {
      type: 'document',
      document_uuid: d1.uuid,
      document_title: 'Check-in',
      chapitre_label: 'Accueil',
    }
    expect(
      destinationImport(local, doc, cl, { type: 'chapitre', chapitreId: 20 }),
    ).toMatchObject({
      cible: { type: 'document', documentId: 1 },
      note: 'Ce fichier concerne le document Check-in. Le reste du classeur ne change pas.',
    })
  })

  it('un chapitre introuvable ici : le classeur, avec un avertissement', () => {
    const f = base()
    f.chapters[0].uuid = 'inconnu'
    f._metadata!.portee = {
      type: 'chapitre',
      chapitre_uuid: 'inconnu',
      chapitre_label: 'Ailleurs',
    }
    expect(
      destinationImport(local, f, cl, { type: 'chapitre', chapitreId: 10 }),
    ).toEqual({
      cible: { type: 'classeur' },
      note: 'Ce fichier concerne le chapitre Accueil.',
      avertissements: [
        "Le chapitre Ailleurs n'est pas dans ce classeur. Relisez l'aperçu avant d'importer.",
      ],
    })
  })
})

describe('routage de la portée — propriété', () => {
  // Un fichier de CHAPITRE importé depuis l'accueil du classeur, depuis la
  // page d'un autre chapitre ou depuis la sienne : toujours le MÊME plan,
  // celui de `planifierFusionPortee` sur ce chapitre (rien hors du chapitre).
  it(`fichier de chapitre : même plan d'où qu'on l'importe, ${String(NUM_RUNS)} fichiers`, () => {
    fc.assert(
      fc.property(descArb, fc.nat({ max: 2 }), (d, rangCible) => {
        const local = construireLocal(d)
        const visibles = local.chapters.filter((c) => c.deleted_at === null)
        fc.pre(visibles.length > 0)
        const cible = visibles[rangCible % visibles.length]
        const complet = construireFichier(local, d)
        const chJson = complet.chapters.find((c) => c.uuid === cible.uuid)
        fc.pre(chJson !== undefined && chJson.supprimer !== true)
        const exporte = construireExportChapitre(
          classeur(),
          cible,
          local.content,
          PERIODICITES,
        )
        const f: ClasseurJson = {
          ...exporte,
          chapters: [{ ...exporte.chapters[0], items: chJson.items }],
        }
        const planAttendu = planifierFusionPortee(local, f, {
          type: 'chapitre',
          chapitreId: cible.id,
        })
        const contextes: ContexteImport[] = [
          { type: 'classeur' },
          { type: 'chapitre', chapitreId: cible.id },
          ...visibles
            .filter((c) => c.id !== cible.id)
            .map((c) => ({ type: 'chapitre' as const, chapitreId: c.id })),
        ]
        for (const contexte of contextes) {
          const dest = destinationImport(local, f, classeur(), contexte)
          expect(dest.cible).toEqual({
            type: 'chapitre',
            chapitreId: cible.id,
          })
          expect(planifierVers(local, f, dest.cible)).toEqual(planAttendu)
          // Rien hors du chapitre n'est supprimé ni déplacé.
          for (const a of planAttendu.actions) {
            if (a.type === 'supprimerChapitre') expect(a.id).toBe(cible.id)
            if (a.type === 'modifierChapitre') expect(a.id).toBe(cible.id)
          }
        }
      }),
      { numRuns: NUM_RUNS, seed: SEED + 3 },
    )
  })
})
