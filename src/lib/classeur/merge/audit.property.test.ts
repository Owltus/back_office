import { beforeAll, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

import {
  appliquerFusion,
  importerCommeNouveauClasseur,
} from '#/lib/classeur/merge/apply.ts'
import { restaurerInstantane } from '#/lib/classeur/merge/history.ts'
import {
  fichierPlusRecent,
  planifierFusion,
} from '#/lib/classeur/merge/merge.ts'
import type { EtatLocal, MergeResult } from '#/lib/classeur/merge/merge.ts'
import {
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterJson,
  ClasseurJson,
  ItemJson,
} from '#/lib/classeur/merge/schema.ts'
import { PERIODICITES } from '#/lib/classeur/merge/fixtures.ts'
import { slugify } from '#/lib/classeur/slug.ts'
import * as service from '#/lib/classeur/service.ts'
import type {
  ChapterInput,
  ClasseurInput,
  ItemInput,
  OptionsCreation,
} from '#/lib/classeur/service.ts'
import type {
  ChapterContent,
  DbChapter,
  DbClasseur,
  DbDocument,
  DbIntercalaire,
  DbMergeHistoryEntry,
  DbPeriodicite,
  DbSignatureSheet,
  DbTrackingSheet,
  ItemKind,
  PointKind,
} from '#/lib/classeur/types.ts'
import { ITEM_KINDS } from '#/lib/classeur/types.ts'

/*
 * AUDIT ADVERSE de la mise à jour d'un classeur par fichier JSON (import,
 * fusion, remplacement, restauration).
 *
 * Le service Supabase est remplacé par un SIMULATEUR EN MÉMOIRE fidèle aux
 * faits de la base (`supabase/classeur_2026-09-25.sql`) : identifiants
 * incrémentaux, suppression douce par `deleted_at`, `updated_at` estampillé
 * à CHAQUE écriture par le trigger `classeur_stamp` (insertion, mise à jour,
 * suppression douce, restauration), `uuid` et `sort_order` posés comme
 * demandé par la fusion. Les oracles de chaque propriété sont écrits à partir
 * des règles R1…R12 / E1…E5 de `merge.ts` et de `files.rs` (Registre), jamais
 * à partir d'une sortie du code.
 *
 * Les propriétés dont le générateur EXCLUT un défaut connu le disent en
 * commentaire ; le défaut est alors porté par un test déterministe
 * `défaut #n` qui reste ROUGE tant qu'il n'est pas corrigé. Les tests
 * `documenté` sont VERTS : ils figent un comportement conforme au Rust mais
 * discutable, pour que l'utilisateur tranche.
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
  updateClasseur: vi.fn(),
  fetchClasseur: vi.fn(),
  fetchChaptersAvecSupprimes: vi.fn(),
  fetchContentAvecSupprimes: vi.fn(),
  fetchPeriodicites: vi.fn(),
  insertMergeHistory: vi.fn(),
  fetchMergeHistory: vi.fn(),
  deleteMergeHistory: vi.fn(),
  fetchMergeEntry: vi.fn(),
}))

const mocks = vi.mocked(service)

const SEED = 20260925
const T0 = '2026-01-01T00:00:00+00:00'
const T_ANCIEN = '2025-12-31T00:00:00+00:00'
const T_RECENT = '2026-01-01T01:00:00+00:00'
const T_SUPPR = '2026-02-02T00:00:00+00:00'
/** L'horloge du simulateur part six mois APRÈS tous les horodatages générés. */
const HORLOGE_BASE_MS = Date.UTC(2026, 5, 1)

// ---------------------------------------------------------------------------
// Simulateur en mémoire
// ---------------------------------------------------------------------------

type LigneItem =
  DbDocument | DbTrackingSheet | DbSignatureSheet | DbIntercalaire
type ItemLocal = { kind: ItemKind; data: LigneItem }
type EntreeHistorique = DbMergeHistoryEntry & { snapshot: unknown }
interface Evenement {
  op: string
  id?: number
  chapterId?: number
}

/** Projection d'un élément visible, sans identifiants techniques ni dates. */
interface VueItem {
  kind: ItemKind
  uuid: string
  title: string
  sort_order: number
  description?: string
  content?: string
  nombre?: number
  periodicite_id?: number
}
interface VueChapitre {
  uuid: string
  label: string
  icon: string
  description: string
  sort_order: number
  items: VueItem[]
}

const parOrdre = <T extends { sort_order: number; id: number }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.id - b.id

function projeter(elt: ItemLocal): VueItem {
  const { data } = elt
  const v: VueItem = {
    kind: elt.kind,
    uuid: data.uuid,
    title: data.title,
    sort_order: data.sort_order,
  }
  if ('description' in data) v.description = data.description
  if ('content' in data) v.content = data.content
  if ('nombre' in data) v.nombre = data.nombre
  if ('periodicite_id' in data) v.periodicite_id = data.periodicite_id
  return v
}

class Simulateur {
  classeurs: DbClasseur[] = [
    {
      id: 1,
      uuid: 'cl-1',
      name: 'Registre de sécurité',
      icon: 'Shield',
      etablissement: 'OKKO Nantes',
      etablissement_complement: '',
      sort_order: 1,
      deleted_at: null,
      created_at: T0,
      updated_at: T0,
    },
  ]
  chapters: DbChapter[] = []
  content: ChapterContent = {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
  }
  periodicites: DbPeriodicite[]
  historique: EntreeHistorique[] = []
  journal: Evenement[] = []
  private compteur = 0
  private tic = 0

  constructor(periodicites: DbPeriodicite[] = PERIODICITES) {
    this.periodicites = periodicites
  }

  private prochainId(): number {
    this.compteur += 1
    return this.compteur
  }

  /** Horloge injectée : strictement croissante, une seconde par écriture. */
  private maintenant(): string {
    this.tic += 1
    return new Date(HORLOGE_BASE_MS + this.tic * 1000).toISOString()
  }

  private tableau(kind: ItemKind): LigneItem[] {
    switch (kind) {
      case 'document':
        return this.content.documents
      case 'tracking_sheet':
        return this.content.tracking_sheets
      case 'signature_sheet':
        return this.content.signature_sheets
      case 'intercalaire':
        return this.content.intercalaires
    }
  }

  private trouverChapitre(id: number): DbChapter {
    const c = this.chapters.find((x) => x.id === id)
    if (c === undefined) throw new Error(`Chapitre ${id} inexistant`)
    return c
  }

  private trouverItem(kind: ItemKind, id: number): LigneItem {
    const elt = this.tableau(kind).find((x) => x.id === id)
    if (elt === undefined) throw new Error(`${kind} ${id} inexistant`)
    return elt
  }

  private prochainOrdreItem(chapterId: number): number {
    return (
      Math.max(
        0,
        ...this.tousLesItems()
          .filter(
            (i) =>
              i.data.chapter_id === chapterId && i.data.deleted_at === null,
          )
          .map((i) => i.data.sort_order),
      ) + 1
    )
  }

  // --- chargement d'un état de départ -------------------------------------

  charger(chapitres: DescChapitre[]): void {
    for (const c of chapitres) {
      const id = this.prochainId()
      this.chapters.push({
        id,
        uuid: `ch-${id}`,
        classeur_id: 1,
        label: c.label,
        icon: c.icon,
        description: c.description,
        sort_order: c.sort_order,
        deleted_at: c.supprime ? T_SUPPR : null,
        created_at: T0,
        updated_at: T0,
      })
      for (const elt of c.items) {
        const iid = this.prochainId()
        const base = {
          id: iid,
          uuid: `it-${iid}`,
          chapter_id: id,
          title: elt.title,
          sort_order: elt.sort_order,
          deleted_at: elt.supprime ? T_SUPPR : null,
          created_at: T0,
          updated_at: elt.updated_at,
        }
        switch (elt.kind) {
          case 'document':
            this.content.documents.push({
              ...base,
              description: elt.description,
              content: elt.content,
            })
            break
          case 'tracking_sheet':
            this.content.tracking_sheets.push({
              ...base,
              periodicite_id: elt.periodicite_id,
            })
            break
          case 'signature_sheet':
            this.content.signature_sheets.push({
              ...base,
              description: elt.description,
              nombre: elt.nombre,
            })
            break
          case 'intercalaire':
            this.content.intercalaires.push({
              ...base,
              description: elt.description,
            })
            break
        }
      }
    }
  }

  // --- écritures (miroir de service.ts) -----------------------------------

  createClasseur(input: ClasseurInput): number {
    const id = this.prochainId()
    const now = this.maintenant()
    this.classeurs.push({
      id,
      uuid: `cl-${id}`,
      ...input,
      sort_order: this.classeurs.length + 1,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    })
    this.journal.push({ op: 'createClasseur', id })
    return id
  }

  updateClasseur(id: number, patch: Partial<ClasseurInput>): void {
    const c = this.classeurs.find((x) => x.id === id)
    if (c === undefined) throw new Error(`Classeur ${id} inexistant`)
    Object.assign(c, patch, { updated_at: this.maintenant() })
    this.journal.push({ op: 'updateClasseur', id })
  }

  createChapter(
    classeurId: number,
    input: ChapterInput,
    options: OptionsCreation = {},
  ): number {
    const id = this.prochainId()
    const now = this.maintenant()
    const sort_order =
      options.sort_order ??
      Math.max(
        0,
        ...this.chapters
          .filter((c) => c.classeur_id === classeurId && c.deleted_at === null)
          .map((c) => c.sort_order),
      ) + 1
    this.chapters.push({
      id,
      uuid: options.uuid ?? `gen-${id}`,
      classeur_id: classeurId,
      ...input,
      sort_order,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    })
    this.journal.push({ op: 'createChapter', id })
    return id
  }

  updateChapter(id: number, patch: Partial<ChapterInput>): void {
    Object.assign(this.trouverChapitre(id), patch, {
      updated_at: this.maintenant(),
    })
    this.journal.push({ op: 'updateChapter', id })
  }

  restaurerChapter(id: number, patch: Partial<ChapterInput> = {}): void {
    Object.assign(this.trouverChapitre(id), patch, {
      deleted_at: null,
      updated_at: this.maintenant(),
    })
    this.journal.push({ op: 'restaurerChapter', id })
  }

  softDeleteChapter(id: number): void {
    const now = this.maintenant()
    Object.assign(this.trouverChapitre(id), {
      deleted_at: now,
      updated_at: now,
    })
    this.journal.push({ op: 'softDeleteChapter', id })
  }

  createItem(
    chapterId: number,
    item: ItemInput,
    options: OptionsCreation = {},
  ): number {
    // Clé étrangère : un élément vise toujours un chapitre existant.
    this.trouverChapitre(chapterId)
    const id = this.prochainId()
    const now = this.maintenant()
    const base = {
      id,
      uuid: options.uuid ?? `gen-${id}`,
      chapter_id: chapterId,
      sort_order: options.sort_order ?? this.prochainOrdreItem(chapterId),
      deleted_at: null,
      created_at: now,
      updated_at: now,
    }
    switch (item.kind) {
      case 'document':
        this.content.documents.push({ ...base, ...item.input })
        break
      case 'tracking_sheet':
        this.content.tracking_sheets.push({ ...base, ...item.input })
        break
      case 'signature_sheet':
        this.content.signature_sheets.push({ ...base, ...item.input })
        break
      case 'intercalaire':
        this.content.intercalaires.push({ ...base, ...item.input })
        break
    }
    this.journal.push({ op: 'createItem', id, chapterId })
    return id
  }

  // Comme le trigger `classeur_stamp` : un `updated_at` fourni est respecté.
  updateItem(kind: ItemKind, id: number, patch: object): void {
    const item = this.trouverItem(kind, id)
    const avant = item.updated_at
    Object.assign(item, patch)
    if (item.updated_at === avant) item.updated_at = this.maintenant()
    this.journal.push({ op: 'updateItem', id })
  }

  restaurerItem(kind: ItemKind, id: number, patch: object = {}): void {
    const item = this.trouverItem(kind, id)
    const avant = item.updated_at
    Object.assign(item, patch, { deleted_at: null })
    if (item.updated_at === avant) item.updated_at = this.maintenant()
    this.journal.push({ op: 'restaurerItem', id })
  }

  softDeleteItem(kind: ItemKind, id: number): void {
    const now = this.maintenant()
    Object.assign(this.trouverItem(kind, id), {
      deleted_at: now,
      updated_at: now,
    })
    this.journal.push({ op: 'softDeleteItem', id })
  }

  // --- mutations « interface » (hors fusion), pour les scénarios ----------

  /** `reorderItems` de l'interface : `sort_order` = rang. */
  reordonner(refs: Array<{ kind: ItemKind; id: number }>): void {
    refs.forEach((r, i) => {
      Object.assign(this.trouverItem(r.kind, r.id), {
        sort_order: i + 1,
        updated_at: this.maintenant(),
      })
    })
  }

  /** `moveItems` de l'interface : change de chapitre, en fin de liste. */
  deplacer(kind: ItemKind, id: number, chapterId: number): void {
    Object.assign(this.trouverItem(kind, id), {
      chapter_id: chapterId,
      sort_order: this.prochainOrdreItem(chapterId),
      updated_at: this.maintenant(),
    })
  }

  // --- lectures (miroir de service.ts) -------------------------------------

  fetchClasseur(id: number): DbClasseur | null {
    const c = this.classeurs.find((x) => x.id === id && x.deleted_at === null)
    return c === undefined ? null : structuredClone(c)
  }

  fetchChaptersAvecSupprimes(classeurId: number): DbChapter[] {
    return structuredClone(
      this.chapters.filter((c) => c.classeur_id === classeurId).sort(parOrdre),
    )
  }

  fetchContentAvecSupprimes(ids: number[]): ChapterContent {
    const s = new Set(ids)
    const garder = <T extends LigneItem>(t: T[]) =>
      structuredClone(t.filter((x) => s.has(x.chapter_id)).sort(parOrdre))
    return {
      documents: garder(this.content.documents),
      tracking_sheets: garder(this.content.tracking_sheets),
      signature_sheets: garder(this.content.signature_sheets),
      intercalaires: garder(this.content.intercalaires),
    }
  }

  insertMergeHistory(entry: {
    classeur_id: number
    kind: PointKind
    label: string
    source_name: string
    inserted: number
    updated: number
    unchanged: number
    skipped: number
    snapshot: unknown
  }): number {
    const id = this.prochainId()
    this.historique.push({
      id,
      merged_at: this.maintenant(),
      classeur_id: entry.classeur_id,
      kind: entry.kind,
      label: entry.label,
      taille: null,
      source_name: entry.source_name,
      inserted: entry.inserted,
      updated: entry.updated,
      unchanged: entry.unchanged,
      skipped: entry.skipped,
      snapshot: structuredClone(entry.snapshot),
    })
    this.journal.push({ op: 'insertMergeHistory', id })
    return id
  }

  fetchMergeHistory(classeurId: number): DbMergeHistoryEntry[] {
    return this.historique
      .filter((e) => e.classeur_id === classeurId)
      .map((e) => ({
        id: e.id,
        classeur_id: e.classeur_id,
        merged_at: e.merged_at,
        kind: e.kind,
        label: e.label,
        taille: e.taille,
        source_name: e.source_name,
        inserted: e.inserted,
        updated: e.updated,
        unchanged: e.unchanged,
        skipped: e.skipped,
      }))
      .sort((a, b) => b.merged_at.localeCompare(a.merged_at))
  }

  fetchMergeEntry(id: number): EntreeHistorique | null {
    const e = this.historique.find((x) => x.id === id)
    return e === undefined ? null : structuredClone(e)
  }

  deleteMergeHistory(id: number): void {
    this.historique = this.historique.filter((e) => e.id !== id)
  }

  // --- oracles -------------------------------------------------------------

  tousLesItems(): ItemLocal[] {
    return [
      ...this.content.documents.map((data) => ({
        kind: 'document' as const,
        data,
      })),
      ...this.content.tracking_sheets.map((data) => ({
        kind: 'tracking_sheet' as const,
        data,
      })),
      ...this.content.signature_sheets.map((data) => ({
        kind: 'signature_sheet' as const,
        data,
      })),
      ...this.content.intercalaires.map((data) => ({
        kind: 'intercalaire' as const,
        data,
      })),
    ]
  }

  /** Ce que l'utilisateur VOIT : chapitres et éléments non supprimés, ordonnés. */
  vue(classeurId = 1): VueChapitre[] {
    const items = this.tousLesItems()
      .filter((i) => i.data.deleted_at === null)
      .sort((a, b) => parOrdre(a.data, b.data))
    return this.chapters
      .filter((c) => c.classeur_id === classeurId && c.deleted_at === null)
      .sort(parOrdre)
      .map((c) => ({
        uuid: c.uuid,
        label: c.label,
        icon: c.icon,
        description: c.description,
        sort_order: c.sort_order,
        items: items.filter((i) => i.data.chapter_id === c.id).map(projeter),
      }))
  }

  /** TOUTES les lignes (supprimées comprises), figées en JSON, par uuid. */
  lignes(): Map<string, string> {
    const m = new Map<string, string>()
    for (const c of this.chapters)
      m.set(`chapitre:${c.uuid}`, JSON.stringify(c))
    for (const elt of this.tousLesItems())
      m.set(`${elt.kind}:${elt.data.uuid}`, JSON.stringify(elt.data))
    return m
  }

  chapitreParUuid(uuid: string): DbChapter | undefined {
    return this.chapters.find((c) => c.uuid === uuid)
  }

  itemsParUuid(uuid: string): ItemLocal[] {
    return this.tousLesItems().filter((i) => i.data.uuid === uuid)
  }

  etatLocal(): EtatLocal {
    return {
      chapters: this.fetchChaptersAvecSupprimes(1),
      content: this.fetchContentAvecSupprimes(this.chapters.map((c) => c.id)),
      periodicites: this.periodicites,
    }
  }

  /**
   * Éléments non supprimés d'un chapitre SUPPRIMÉ : invisibles, absents de
   * tout export, et supprimés par le mode remplacement (R11, conforme au
   * Rust — voir le test « documenté » de P5). Clés au format de `lignes()`.
   */
  orphelins(): Set<string> {
    const supprimes = new Set(
      this.chapters.filter((c) => c.deleted_at !== null).map((c) => c.id),
    )
    return new Set(
      this.tousLesItems()
        .filter(
          (i) => i.data.deleted_at === null && supprimes.has(i.data.chapter_id),
        )
        .map((i) => `${i.kind}:${i.data.uuid}`),
    )
  }
}

let sim: Simulateur

beforeAll(() => {
  mocks.createChapter.mockImplementation(async (c, i, o) =>
    sim.createChapter(c, i, o),
  )
  mocks.updateChapter.mockImplementation(async (id, p) =>
    sim.updateChapter(id, p),
  )
  mocks.restaurerChapter.mockImplementation(async (id, p) =>
    sim.restaurerChapter(id, p),
  )
  mocks.softDeleteChapter.mockImplementation(async (id) =>
    sim.softDeleteChapter(id),
  )
  mocks.createItem.mockImplementation(async (c, i, o) =>
    sim.createItem(c, i, o),
  )
  mocks.updateItem.mockImplementation(async (k, id, p) =>
    sim.updateItem(k, id, p),
  )
  mocks.restaurerItem.mockImplementation(async (k, id, p) =>
    sim.restaurerItem(k, id, p),
  )
  mocks.softDeleteItem.mockImplementation(async (k, id) =>
    sim.softDeleteItem(k, id),
  )
  mocks.createClasseur.mockImplementation(async (i) => sim.createClasseur(i))
  mocks.updateClasseur.mockImplementation(async (id, p) =>
    sim.updateClasseur(id, p),
  )
  mocks.fetchClasseur.mockImplementation(async (id) => sim.fetchClasseur(id))
  mocks.fetchChaptersAvecSupprimes.mockImplementation(async (id) =>
    sim.fetchChaptersAvecSupprimes(id),
  )
  mocks.fetchContentAvecSupprimes.mockImplementation(async (ids) =>
    sim.fetchContentAvecSupprimes(ids),
  )
  mocks.fetchPeriodicites.mockImplementation(async () => sim.periodicites)
  mocks.insertMergeHistory.mockImplementation(async (e) =>
    sim.insertMergeHistory(e),
  )
  mocks.fetchMergeHistory.mockImplementation(async (id) =>
    sim.fetchMergeHistory(id),
  )
  mocks.deleteMergeHistory.mockImplementation(async (id) =>
    sim.deleteMergeHistory(id),
  )
  mocks.fetchMergeEntry.mockImplementation(async (id) =>
    sim.fetchMergeEntry(id),
  )
})

// ---------------------------------------------------------------------------
// Générateurs
// ---------------------------------------------------------------------------

interface DescItem {
  kind: ItemKind
  title: string
  description: string
  content: string
  nombre: number
  periodicite_id: number
  sort_order: number
  supprime: boolean
  updated_at: string
}
interface DescChapitre {
  label: string
  icon: string
  description: string
  sort_order: number
  supprime: boolean
  items: DescItem[]
}

const rareArb = fc.oneof(
  { weight: 4, arbitrary: fc.constant(false) },
  { weight: 1, arbitrary: fc.constant(true) },
)

/** Titres accentués, doublons fréquents, casse variable. */
const titrePleinArb = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.constantFrom(
      'Consignes',
      'Sécurité incendie',
      'Émargement',
      'a',
      'A',
      'Registre',
      'Extincteurs',
    ),
  },
  {
    weight: 1,
    arbitrary: fc
      .string({ minLength: 1, maxLength: 8 })
      .filter((s) => s.trim() !== ''),
  },
)
const titreArb = fc.oneof(
  { weight: 6, arbitrary: titrePleinArb },
  { weight: 1, arbitrary: fc.constantFrom('', '  ') },
)

/**
 * `strict` : titres jamais vides et `updated_at` = T0 (lisible), pour les
 * propriétés dont l'oracle compte les mises à jour. Sinon : titres vides,
 * horodatages vides ou variés.
 */
function descItemArb(strict: boolean): fc.Arbitrary<DescItem> {
  return fc.record({
    kind: fc.constantFrom(...ITEM_KINDS),
    title: strict ? titrePleinArb : titreArb,
    description: fc.constantFrom('', 'd', 'Desc é'),
    content: fc.constantFrom('', '# a', 'x\ny'),
    nombre: fc.integer({ min: 1, max: 60 }),
    periodicite_id: fc.constantFrom(41, 44, 49),
    sort_order: fc.integer({ min: 0, max: 6 }),
    supprime: rareArb,
    updated_at: strict
      ? fc.constant(T0)
      : fc.constantFrom(T0, '2026-01-02T00:00:00+00:00', ''),
  })
}

function descChapitreArb(strict: boolean): fc.Arbitrary<DescChapitre> {
  return fc.record({
    label: fc.constantFrom(
      'Sécurité',
      'SECURITE',
      'Sanitaire',
      'Sécurité incendie',
      '',
      'Chap',
    ),
    icon: fc.constantFrom('FileText', 'Flame', ''),
    description: fc.constantFrom('', 'desc'),
    sort_order: fc.integer({ min: 0, max: 6 }),
    supprime: rareArb,
    items: fc.array(descItemArb(strict), { maxLength: 5 }),
  })
}

const etatArb = (strict: boolean) =>
  fc.array(descChapitreArb(strict), { maxLength: 4 })

/** Nouvel élément à ajouter par le fichier (titre unique posé par `deriver`). */
interface NouvelItem {
  kind: ItemKind
  sort_order: number
  description: string
  content: string
  nombre: number
  periodicite_id: number
}
const nouvelItemArb: fc.Arbitrary<NouvelItem> = fc.record({
  kind: fc.constantFrom(...ITEM_KINDS),
  sort_order: fc.integer({ min: 0, max: 9 }),
  description: fc.constantFrom('', 'n'),
  content: fc.constantFrom('', '# n'),
  nombre: fc.integer({ min: 1, max: 60 }),
  periodicite_id: fc.constantFrom(41, 44, 49),
})

/** Choix de dérivation d'un fichier à partir d'un export (indices modulo). */
interface Choix {
  retirerChapitres: number[]
  retirerItems: Array<[number, number]>
  modifierChapitres: Array<[number, number]>
  modifierItems: Array<[number, number, number]>
  horodatage: 'recent' | 'ancien' | 'absent'
  ajouterChapitres: NouvelItem[][]
  ajouterItems: Array<[number, NouvelItem]>
}
const CHOIX_VIDE: Choix = {
  retirerChapitres: [],
  retirerItems: [],
  modifierChapitres: [],
  modifierItems: [],
  horodatage: 'recent',
  ajouterChapitres: [],
  ajouterItems: [],
}
const idx = fc.nat({ max: 9 })
const retraitsArb = fc.record({
  retirerChapitres: fc.array(idx, { maxLength: 2 }),
  retirerItems: fc.array(fc.tuple(idx, idx), { maxLength: 4 }),
})
const modifsArb = fc.record({
  modifierChapitres: fc.array(fc.tuple(idx, fc.nat({ max: 2 })), {
    maxLength: 2,
  }),
  modifierItems: fc.array(fc.tuple(idx, idx, fc.nat({ max: 3 })), {
    maxLength: 4,
  }),
  horodatage: fc.constantFrom<Choix['horodatage']>(
    'recent',
    'ancien',
    'absent',
  ),
})
const ajoutsArb = fc.record({
  ajouterChapitres: fc.array(fc.array(nouvelItemArb, { maxLength: 3 }), {
    maxLength: 2,
  }),
  ajouterItems: fc.array(fc.tuple(idx, nouvelItemArb), { maxLength: 4 }),
})
const choixArb: fc.Arbitrary<Choix> = fc
  .tuple(retraitsArb, modifsArb, ajoutsArb)
  .map(([r, m, a]) => ({ ...r, ...m, ...a }))

// ---------------------------------------------------------------------------
// Dérivation d'un fichier depuis un export
// ---------------------------------------------------------------------------

interface Derive {
  fichier: ClasseurJson
  chapitresRetires: string[]
  /** Éléments retirés un à un ET éléments des chapitres retirés. */
  itemsRetires: string[]
  chapitresModifies: Map<string, ChapterInput>
  itemsModifies: Map<string, ItemJson>
  chapitresAjoutes: ChapterJson[]
  itemsAjoutes: Array<{ chapitreUuid: string; item: ItemJson }>
}

const CHAMPS_PAR_NATURE: Record<ItemKind, string[]> = {
  document: ['title', 'description', 'content'],
  tracking_sheet: ['title', 'periodicite_id'],
  signature_sheet: ['title', 'description', 'nombre'],
  intercalaire: ['title', 'description'],
}

/** Change UN champ de la nature, vers une valeur garantie différente et non vide. */
function modifierItemJson(elt: ItemJson, champ: number): void {
  const liste = CHAMPS_PAR_NATURE[elt.kind as ItemKind]
  switch (liste[champ % liste.length]) {
    case 'title':
      elt.title = `${elt.title} bis`
      break
    case 'description':
      elt.description = `${elt.description ?? ''}+`
      break
    case 'content':
      elt.content = `${elt.content ?? ''}+`
      break
    case 'nombre':
      elt.nombre = ((elt.nombre ?? 14) % 60) + 1
      break
    default: {
      const ids = PERIODICITES.map((p) => p.id)
      const i = ids.indexOf(elt.periodicite_id ?? -1)
      elt.periodicite_id = ids[(i + 1) % ids.length]
    }
  }
}

function itemJsonDepuis(ni: NouvelItem, uuid: string, title: string): ItemJson {
  const elt: ItemJson = {
    kind: ni.kind,
    uuid,
    title,
    sort_order: ni.sort_order,
  }
  switch (ni.kind) {
    case 'document':
      elt.description = ni.description
      elt.content = ni.content
      break
    case 'tracking_sheet':
      elt.periodicite_id = ni.periodicite_id
      break
    case 'signature_sheet':
      elt.description = ni.description
      elt.nombre = ni.nombre
      break
    case 'intercalaire':
      elt.description = ni.description
      break
  }
  return elt
}

/** Champs de ligne attendus après application d'un `ItemJson`. */
function attenduDepuis(elt: ItemJson): Record<string, unknown> {
  const a: Record<string, unknown> = { title: elt.title }
  switch (elt.kind) {
    case 'document':
      a.description = elt.description ?? ''
      a.content = elt.content ?? ''
      break
    case 'tracking_sheet':
      a.periodicite_id = elt.periodicite_id
      break
    case 'signature_sheet':
      a.description = elt.description ?? ''
      a.nombre = elt.nombre ?? 14
      break
    default:
      a.description = elt.description ?? ''
  }
  return a
}

function deriver(exporte: ClasseurJson, choix: Choix): Derive {
  const f: ClasseurJson = structuredClone(exporte)
  const chapitresRetires: string[] = []
  const itemsRetires: string[] = []
  const n = f.chapters.length

  if (n > 0) {
    for (const [ci, ii] of choix.retirerItems) {
      const ch = f.chapters[ci % n]
      if (ch.items.length === 0) continue
      const [elt] = ch.items.splice(ii % ch.items.length, 1)
      if (elt.uuid !== undefined) itemsRetires.push(elt.uuid)
    }
    const aRetirer = new Set(choix.retirerChapitres.map((i) => i % n))
    f.chapters = f.chapters.filter((ch, i) => {
      if (!aRetirer.has(i)) return true
      chapitresRetires.push(ch.uuid ?? '')
      for (const elt of ch.items)
        if (elt.uuid !== undefined) itemsRetires.push(elt.uuid)
      return false
    })
  }

  // Originaux, pour écarter les modifications qui s'annulent (trois cycles de
  // périodicité, deux bascules d'icône…) : l'oracle ne compte que les
  // éléments dont la valeur finale DIFFÈRE.
  const chapitresOrigine = new Map(
    exporte.chapters.map((c) => [c.uuid ?? '', c]),
  )
  const itemsOrigine = new Map(
    exporte.chapters.flatMap((c) =>
      c.items.map((i) => [i.uuid ?? '', i] as const),
    ),
  )

  const m = f.chapters.length
  const chapitresModifies = new Map<string, ChapterInput>()
  const itemsModifies = new Map<string, ItemJson>()
  if (m > 0) {
    for (const [ci, champ] of choix.modifierChapitres) {
      const ch = f.chapters[ci % m]
      if (champ === 0) ch.label = `${ch.label} (modifié)`
      else if (champ === 1) ch.icon = ch.icon === 'Wrench' ? 'Flame' : 'Wrench'
      else ch.description = `${ch.description}+`
      chapitresModifies.set(ch.uuid ?? '', {
        label: ch.label,
        icon: ch.icon,
        description: ch.description,
      })
    }
    for (const [uuid, champs] of chapitresModifies) {
      const o = chapitresOrigine.get(uuid)
      if (
        o !== undefined &&
        o.label === champs.label &&
        o.icon === champs.icon &&
        o.description === champs.description
      )
        chapitresModifies.delete(uuid)
    }
    for (const [ci, ii, champ] of choix.modifierItems) {
      const ch = f.chapters[ci % m]
      if (ch.items.length === 0) continue
      const item = ch.items[ii % ch.items.length]
      // Un élément sans titre est ignoré par la fusion (R4) : hors oracle.
      if (item.title.trim() === '' || item.uuid === undefined) continue
      modifierItemJson(item, champ)
      itemsModifies.set(item.uuid, item)
    }
    for (const [uuid, item] of itemsModifies) {
      const o = itemsOrigine.get(uuid)
      if (
        o !== undefined &&
        JSON.stringify(attenduDepuis(o)) === JSON.stringify(attenduDepuis(item))
      ) {
        itemsModifies.delete(uuid)
        continue
      }
      if (choix.horodatage === 'recent') item.updated_at = T_RECENT
      else if (choix.horodatage === 'ancien') item.updated_at = T_ANCIEN
      else delete item.updated_at
    }
  }

  let k = 0
  const chapitresAjoutes: ChapterJson[] = []
  for (const items of choix.ajouterChapitres) {
    k += 1
    const numero = k
    const ch: ChapterJson = {
      uid: `nouveau-chapitre-${numero}`,
      uuid: `new-ch-${numero}`,
      label: `Nouveau chapitre ${numero}`,
      icon: 'Plus',
      description: '',
      sort_order: 50 + numero,
      items: items.map((ni) => {
        k += 1
        return itemJsonDepuis(ni, `new-it-${k}`, `Nouveau ${k}`)
      }),
    }
    f.chapters.push(ch)
    chapitresAjoutes.push(ch)
  }
  const itemsAjoutes: Derive['itemsAjoutes'] = []
  if (m > 0) {
    for (const [ci, ni] of choix.ajouterItems) {
      k += 1
      const ch = f.chapters[ci % m]
      const elt = itemJsonDepuis(ni, `new-it-${k}`, `Nouveau ${k}`)
      ch.items.push(elt)
      itemsAjoutes.push({ chapitreUuid: ch.uuid ?? '', item: elt })
    }
  }

  return {
    fichier: f,
    chapitresRetires,
    itemsRetires,
    chapitresModifies,
    itemsModifies,
    chapitresAjoutes,
    itemsAjoutes,
  }
}

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

function demarrer(
  desc: DescChapitre[],
  periodicites?: DbPeriodicite[],
): Simulateur {
  const s = new Simulateur(periodicites)
  s.charger(desc)
  sim = s
  return s
}

function exporter(s: Simulateur): ClasseurJson {
  return construireExport(s.classeurs[0], s.chapters, s.content, s.periodicites)
}

/** Passe par le texte JSON, comme un vrai fichier. */
function relire(fichier: ClasseurJson): ClasseurJson {
  return parseImportJson(JSON.stringify(fichier))
}

async function fusionner(
  fichier: ClasseurJson,
  replace: boolean,
  sourceName = 'fichier.json',
): Promise<MergeResult> {
  return appliquerFusion(1, relire(fichier), { replace, sourceName })
}

/** Fichier v1 : sans uuid ni updated_at ni _metadata. */
function enV1(fichier: ClasseurJson): ClasseurJson {
  const f = structuredClone(fichier)
  f.format_version = 1
  delete f._metadata
  for (const ch of f.chapters) {
    delete ch.uuid
    for (const elt of ch.items) {
      delete elt.uuid
      delete elt.updated_at
    }
  }
  return f
}

const compteurs = (r: Partial<MergeResult>): MergeResult => ({
  inserted: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  deleted: 0,
  ...r,
})

/** Vue sans les `uuid` (pour comparer des états dont les identifiants diffèrent). */
const sansUuid = (v: VueChapitre[]) =>
  v.map(({ uuid: _u, items, ...c }) => ({
    ...c,
    items: items.map(({ uuid: _i, ...elt }) => elt),
  }))

const ECRITURES = new Set([
  'createChapter',
  'createItem',
  'updateChapter',
  'updateItem',
  'restaurerChapter',
  'restaurerItem',
  'softDeleteChapter',
  'softDeleteItem',
  'updateClasseur',
])

/** Petit état déterministe partagé par les scénarios : 2 chapitres, 1 document. */
function etatSimple(): DescChapitre[] {
  return [
    {
      label: 'Sécurité',
      icon: 'Flame',
      description: '',
      sort_order: 1,
      supprime: false,
      items: [
        {
          kind: 'document',
          title: 'Consignes',
          description: '',
          content: 'v1',
          nombre: 14,
          periodicite_id: 41,
          sort_order: 1,
          supprime: false,
          updated_at: T0,
        },
      ],
    },
    {
      label: 'Sanitaire',
      icon: 'FileText',
      description: '',
      sort_order: 2,
      supprime: false,
      items: [],
    },
  ]
}

// ---------------------------------------------------------------------------
// 1. Aller-retour
// ---------------------------------------------------------------------------

describe('P1 — aller-retour : export → parse → fusion = tout inchangé', () => {
  it('fast-check : 0 insert / 0 update / 0 delete / 0 skip, unchanged = visibles (E8 : un titre vide porteur d’uuid s’apparie)', () => {
    fc.assert(
      fc.property(etatArb(false), (desc) => {
        const s = demarrer(desc)
        const local = s.etatLocal()
        const relu = relire(exporter(s))
        const plan = planifierFusion(local, relu, { replace: false })
        const vue = s.vue()
        const items = vue.flatMap((c) => c.items)
        expect(plan.resultat).toEqual(
          compteurs({ unchanged: vue.length + items.length }),
        )
        expect(plan.actions).toEqual([])
        expect(plan.warnings).toEqual([])
      }),
      { numRuns: 600, seed: SEED },
    )
  })

  it('défaut #6 — un élément au titre vide est SUPPRIMÉ par le remplacement de son propre export (R4 + R11)', () => {
    // Export puis réimport en mode remplacement : le fichier est l'état
    // exact, rien ne devrait bouger. L'élément sans titre est `skip` (R4)
    // donc non apparié, donc orphelin (R11) : supprimé. Conforme au Rust.
    const desc = etatSimple()
    desc[0].items.push({ ...desc[0].items[0], title: '', sort_order: 2 })
    const s = demarrer(desc)
    const plan = planifierFusion(s.etatLocal(), relire(exporter(s)), {
      replace: true,
    })
    expect(plan.resultat.deleted).toBe(0)
    expect(plan.actions).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. Idempotence
// ---------------------------------------------------------------------------

describe('P2 — idempotence : appliquer deux fois le même fichier', () => {
  it('fast-check (v2, dérivé d’un export par retraits/modifs/ajouts) : seconde passe sans écriture, état identique', async () => {
    await fc.assert(
      fc.asyncProperty(
        etatArb(false),
        choixArb,
        fc.boolean(),
        async (desc, choix, replace) => {
          const s = demarrer(desc)
          const { fichier } = deriver(exporter(s), choix)
          const r1 = await fusionner(fichier, replace)
          const apres1 = s.lignes()
          const vue1 = s.vue()
          const r2 = await fusionner(fichier, replace)
          expect(s.lignes()).toEqual(apres1)
          expect(s.vue()).toEqual(vue1)
          expect(r2.inserted).toBe(0)
          expect(r2.updated).toBe(0)
          expect(r2.deleted).toBe(0)
          // Les `skip` sont stables d'une passe à l'autre : en fusion, un
          // élément supprimé apparié reste ignoré (R6) ; les titres vides
          // sans uuid ne sont jamais insérés (E8).
          expect(r2.skipped).toBe(r1.skipped)
        },
      ),
      { numRuns: 400, seed: SEED },
    )
  })

  it('fast-check (v1 sans uuid, titres et slugs UNIQUES — le défaut #5 est exclu du générateur)', async () => {
    const uniques = etatArb(true).filter((desc) => {
      const slugs = desc.map((c) => slugify(c.label))
      if (new Set(slugs).size !== slugs.length) return false
      return desc.every((c) => {
        const cles = c.items.map((i) => `${i.kind}|${i.title}`)
        return new Set(cles).size === cles.length
      })
    })
    await fc.assert(
      fc.asyncProperty(uniques, fc.boolean(), async (desc, replace) => {
        const s = demarrer(desc)
        const fichier = enV1(exporter(s))
        await fusionner(fichier, replace)
        const apres1 = s.lignes()
        const r2 = await fusionner(fichier, replace)
        expect(s.lignes()).toEqual(apres1)
        expect(r2.inserted + r2.updated + r2.deleted).toBe(0)
      }),
      { numRuns: 300, seed: SEED },
    )
  })

  it('défaut #5a — fichier v1, deux éléments de même titre : la seconde fusion ÉCRASE le contenu du premier', async () => {
    // Local vide ; le fichier v1 porte deux documents « Consignes » (x, y).
    // Passe 1 : les deux sont insérés (aucun local à apparier). Passe 2 : le
    // repli (chapitre, nature, titre) apparie LES DEUX au premier local, et
    // le second réécrit son contenu : x est perdu. Idem `do_merge` (Rust).
    const s = demarrer([{ ...etatSimple()[0], items: [] }])
    const fichier = enV1(exporter(s))
    const doc = (content: string): ItemJson => ({
      kind: 'document',
      title: 'Consignes',
      description: '',
      content,
      sort_order: 1,
    })
    fichier.chapters[0].items = [doc('x'), doc('y')]
    await fusionner(fichier, false)
    const contenus = () =>
      s
        .vue()[0]
        .items.map((i) => i.content)
        .sort()
    expect(contenus()).toEqual(['x', 'y'])
    await fusionner(fichier, false)
    expect(contenus()).toEqual(['x', 'y'])
  })

  it('défaut #5b — fichier v1, deux chapitres de même slug : la seconde fusion DUPLIQUE les éléments du second dans le premier', async () => {
    const s = demarrer([])
    const chap = (title: string): ChapterJson => ({
      uid: 'a',
      label: 'A',
      icon: 'FileText',
      description: '',
      sort_order: 1,
      items: [
        {
          kind: 'document',
          title,
          description: '',
          content: '',
          sort_order: 1,
        },
      ],
    })
    const fichier: ClasseurJson = {
      format_version: 1,
      classeur: {
        name: 'x',
        icon: 'Shield',
        etablissement: '',
        etablissement_complement: '',
      },
      chapters: [chap('p'), chap('q')],
    }
    await fusionner(fichier, false)
    const vue1 = s.vue()
    expect(vue1.map((c) => c.items.map((i) => i.title))).toEqual([['p'], ['q']])
    const r2 = await fusionner(fichier, false)
    expect(r2.inserted).toBe(0)
    expect(s.vue().map((c) => c.items.map((i) => i.title))).toEqual([
      ['p'],
      ['q'],
    ])
  })
})

// ---------------------------------------------------------------------------
// 3. Ajout
// ---------------------------------------------------------------------------

describe('P3 — ajout : chapitres et éléments nouveaux', () => {
  it('fast-check : chaque ajout présent une fois, uuid et sort_order du fichier, chapitre neuf en FIN (R3), rien d’autre ne bouge', async () => {
    await fc.assert(
      fc.asyncProperty(etatArb(true), ajoutsArb, async (desc, ajouts) => {
        const s = demarrer(desc)
        const d = deriver(exporter(s), { ...CHOIX_VIDE, ...ajouts })
        const avant = s.lignes()
        const maxAvant = Math.max(0, ...s.vue().map((c) => c.sort_order))
        const r = await fusionner(d.fichier, false)

        const nbItemsNeufs =
          d.itemsAjoutes.length +
          d.chapitresAjoutes.reduce((acc, c) => acc + c.items.length, 0)
        expect(r).toEqual(
          compteurs({
            inserted: d.chapitresAjoutes.length + nbItemsNeufs,
            unchanged: r.unchanged,
          }),
        )

        d.chapitresAjoutes.forEach((chJson, rang) => {
          const lignes = s.chapters.filter((c) => c.uuid === chJson.uuid)
          expect(lignes).toHaveLength(1)
          const ch = lignes[0]
          expect(ch).toMatchObject({
            label: chJson.label,
            icon: chJson.icon,
            description: chJson.description,
            deleted_at: null,
            sort_order: maxAvant + rang + 1,
          })
          for (const itJson of chJson.items) {
            const rows = s.itemsParUuid(itJson.uuid ?? '')
            expect(rows).toHaveLength(1)
            expect(rows[0].kind).toBe(itJson.kind)
            expect(rows[0].data).toMatchObject({
              chapter_id: ch.id,
              sort_order: itJson.sort_order,
              deleted_at: null,
              ...attenduDepuis(itJson),
            })
          }
        })
        for (const { chapitreUuid, item } of d.itemsAjoutes) {
          const ch = s.chapitreParUuid(chapitreUuid)
          expect(ch).toBeDefined()
          const rows = s.itemsParUuid(item.uuid ?? '')
          expect(rows).toHaveLength(1)
          expect(rows[0].data).toMatchObject({
            chapter_id: ch?.id,
            sort_order: item.sort_order,
            deleted_at: null,
            ...attenduDepuis(item),
          })
        }
        // Aucune ligne préexistante n'a bougé (updated_at compris).
        for (const [cle, json] of avant) expect(s.lignes().get(cle)).toBe(json)
        expect(s.lignes().size).toBe(
          avant.size + d.chapitresAjoutes.length + nbItemsNeufs,
        )
      }),
      { numRuns: 400, seed: SEED },
    )
  })

  it('documenté — un élément NEUF (uuid inconnu) portant le titre d’un élément local du même chapitre n’est pas ajouté : il est fusionné dedans (R5, repli titre, comme le Rust) et l’élément local ADOPTE l’uuid du fichier (E6)', async () => {
    const s = demarrer(etatSimple())
    const f = exporter(s)
    f.chapters[0].items.push({
      kind: 'document',
      uuid: 'autre-base-uuid',
      title: 'Consignes',
      description: '',
      content: 'contenu venu d’ailleurs',
      updated_at: T_RECENT,
      sort_order: 2,
    })
    const r = await fusionner(f, false)
    // Attendu par un utilisateur : 2 documents « Consignes ». Observé : 1,
    // dont le contenu local « v1 » est ÉCRASÉ. Depuis E6, l'uuid du fichier
    // est adopté : les fusions suivantes s'apparient par uuid, sans repli.
    expect(r.inserted).toBe(0)
    expect(r.updated).toBe(1)
    const docs = s.vue()[0].items
    expect(docs).toHaveLength(1)
    expect(docs[0].content).toBe('contenu venu d’ailleurs')
    expect(s.itemsParUuid('autre-base-uuid')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 4. Modification
// ---------------------------------------------------------------------------

describe('P4 — modification : dernier écrit gagne (R7), remplacement (R8)', () => {
  it('fast-check : K champs modifiés → exactement K updates si plus récent/absent, 0 si plus ancien ; en remplacement toujours K', async () => {
    await fc.assert(
      fc.asyncProperty(
        etatArb(true),
        modifsArb,
        fc.boolean(),
        async (desc, modifs, replace) => {
          const s = demarrer(desc)
          const d = deriver(exporter(s), { ...CHOIX_VIDE, ...modifs })
          const avant = s.lignes()
          const orphelins = s.orphelins()
          const r = await fusionner(d.fichier, replace)
          const itemsAppliques = replace || modifs.horodatage !== 'ancien'
          const K = itemsAppliques ? d.itemsModifies.size : 0
          expect(r.updated).toBe(K + d.chapitresModifies.size)
          expect(r.inserted).toBe(0)
          // Seuls les orphelins invisibles tombent, et seulement en remplacement.
          expect(r.deleted).toBe(replace ? orphelins.size : 0)
          expect(r.skipped).toBe(0)

          const touches = new Set<string>(replace ? orphelins : [])
          for (const [uuid, champs] of d.chapitresModifies) {
            expect(s.chapitreParUuid(uuid)).toMatchObject(champs)
            touches.add(`chapitre:${uuid}`)
          }
          for (const [uuid, itJson] of d.itemsModifies) {
            const rows = s.itemsParUuid(uuid)
            expect(rows).toHaveLength(1)
            const cle = `${rows[0].kind}:${uuid}`
            if (itemsAppliques) {
              expect(rows[0].data).toMatchObject(attenduDepuis(itJson))
              touches.add(cle)
            } else {
              // R7 : fichier plus ancien → valeurs locales INTACTES.
              expect(s.lignes().get(cle)).toBe(avant.get(cle))
            }
          }
          for (const [cle, json] of avant) {
            if (!touches.has(cle)) expect(s.lignes().get(cle)).toBe(json)
          }
        },
      ),
      { numRuns: 400, seed: SEED },
    )
  })

  it('défaut #1 — après une première fusion, une version PLUS RÉCENTE du même élément est refusée (estampillage « now » de la base, R7)', async () => {
    // Base X exporte à 10 h (v1) puis à 11 h (v2). Base Y fusionne les deux
    // fichiers dans l'ordre. La fusion de 10 h estampille l'élément à « now »
    // (juin), si bien que le fichier de 11 h est jugé plus ancien : la
    // modification de 11 h est perdue en silence. Le Rust faisait de même
    // (`updated_at = datetime('now')`) ; le schéma promet pourtant « la
    // version la plus récente gagne ».
    const s = demarrer(etatSimple())
    const f = exporter(s)
    const doc = f.chapters[0].items[0]
    doc.content = 'v1 (10 h)'
    doc.updated_at = '2026-01-01T10:00:00+00:00'
    await fusionner(f, false)
    doc.content = 'v2 (11 h)'
    doc.updated_at = '2026-01-01T11:00:00+00:00'
    const r = await fusionner(f, false)
    expect(r.updated).toBe(1)
    expect(s.vue()[0].items[0].content).toBe('v2 (11 h)')
  })
})

// ---------------------------------------------------------------------------
// 5. Retrait
// ---------------------------------------------------------------------------

describe('P5 — retrait : mode remplacement (R11), jamais en fusion', () => {
  it('fast-check : exactement les lignes visibles absentes du fichier passent en suppression douce, éléments AVANT chapitres', async () => {
    await fc.assert(
      fc.asyncProperty(etatArb(true), retraitsArb, async (desc, retraits) => {
        const s = demarrer(desc)
        const d = deriver(exporter(s), { ...CHOIX_VIDE, ...retraits })
        const uuidsCh = new Set(d.fichier.chapters.map((c) => c.uuid))
        const uuidsIt = new Set(
          d.fichier.chapters.flatMap((c) => c.items.map((i) => i.uuid)),
        )
        // Oracle R11, formulé sur les LIGNES : toute ligne non supprimée dont
        // l'uuid n'est pas dans le fichier (y compris un élément d'un chapitre
        // déjà supprimé) est supprimée.
        const chAttendus = s.chapters
          .filter((c) => c.deleted_at === null && !uuidsCh.has(c.uuid))
          .map((c) => `chapitre:${c.uuid}`)
        const itAttendus = s
          .tousLesItems()
          .filter(
            (i) => i.data.deleted_at === null && !uuidsIt.has(i.data.uuid),
          )
          .map((i) => `${i.kind}:${i.data.uuid}`)
        const avant = s.lignes()

        const r = await fusionner(d.fichier, true)
        expect(r.deleted).toBe(chAttendus.length + itAttendus.length)
        expect(r.inserted + r.updated + r.skipped).toBe(0)
        const apres = s.lignes()
        const supprimes = new Set([...chAttendus, ...itAttendus])
        for (const [cle, json] of avant) {
          const ligne = JSON.parse(apres.get(cle) ?? '{}') as {
            deleted_at: unknown
          }
          if (supprimes.has(cle)) expect(ligne.deleted_at).not.toBeNull()
          else expect(apres.get(cle)).toBe(json)
        }
        expect(apres.size).toBe(avant.size)
        // Retirer un chapitre entraîne ses éléments, chacun compté.
        for (const u of d.itemsRetires)
          expect(itAttendus).toContain(`${s.itemsParUuid(u)[0].kind}:${u}`)
        // Ordre : tous les éléments supprimés avant le premier chapitre.
        const ops = s.journal.map((e) => e.op)
        const dernierItem = ops.lastIndexOf('softDeleteItem')
        const premierCh = ops.indexOf('softDeleteChapter')
        if (dernierItem >= 0 && premierCh >= 0)
          expect(dernierItem).toBeLessThan(premierCh)
      }),
      { numRuns: 400, seed: SEED },
    )
  })

  it('fast-check : en fusion, 0 suppression et aucune écriture', async () => {
    await fc.assert(
      fc.asyncProperty(etatArb(true), retraitsArb, async (desc, retraits) => {
        const s = demarrer(desc)
        const d = deriver(exporter(s), { ...CHOIX_VIDE, ...retraits })
        const avant = s.lignes()
        const r = await fusionner(d.fichier, false)
        expect(r.deleted).toBe(0)
        expect(s.lignes()).toEqual(avant)
        expect(s.journal.filter((e) => ECRITURES.has(e.op))).toEqual([])
      }),
      { numRuns: 300, seed: SEED },
    )
  })

  it('documenté — le compteur `deleted` inclut les éléments INVISIBLES (chapitre déjà supprimé), comme le Rust', async () => {
    const desc = etatSimple()
    desc[1].supprime = true
    desc[1].items.push({ ...desc[0].items[0], title: 'Orphelin invisible' })
    const s = demarrer(desc)
    const r = await fusionner(exporter(s), true)
    // L'utilisateur ne voit rien disparaître, mais lit « 1 suppression ».
    expect(r.deleted).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 6. Suppression puis réimport
// ---------------------------------------------------------------------------

describe('P6 — suppression douce locale puis fichier portant l’uuid', () => {
  it('fast-check : chapitre → restauré (E1) dans les deux modes ; élément → skip en fusion, restauré en remplacement (R6) ; jamais de nouvelle ligne', async () => {
    await fc.assert(
      fc.asyncProperty(etatArb(true), fc.boolean(), async (desc, replace) => {
        // Même description sans aucune suppression : mêmes ids, mêmes uuids.
        const plein = demarrer(
          desc.map((c) => ({
            ...c,
            supprime: false,
            items: c.items.map((i) => ({ ...i, supprime: false })),
          })),
        )
        const fichier = exporter(plein)
        const s = demarrer(desc)
        const chapitresSuppr = new Set(
          s.chapters.filter((c) => c.deleted_at !== null).map((c) => c.id),
        )
        const chSuppr = chapitresSuppr.size
        const itSuppr = s
          .tousLesItems()
          .filter((i) => i.data.deleted_at !== null).length
        // E1 + E6 : les éléments d'un chapitre lui-même restauré reviennent
        // avec lui, même en fusion (sinon le chapitre réapparaissait vide).
        const itAvecChapitre = s
          .tousLesItems()
          .filter(
            (i) =>
              i.data.deleted_at !== null &&
              chapitresSuppr.has(i.data.chapter_id),
          ).length
        const avant = s.lignes()

        const r = await fusionner(fichier, replace)
        expect(s.lignes().size).toBe(avant.size)
        expect(r.deleted).toBe(0)
        expect(r.updated).toBe(0)
        for (const c of s.chapters) expect(c.deleted_at).toBeNull()
        if (replace) {
          expect(r.inserted).toBe(chSuppr + itSuppr)
          expect(r.skipped).toBe(0)
          for (const i of s.tousLesItems()) expect(i.data.deleted_at).toBeNull()
        } else {
          expect(r.inserted).toBe(chSuppr + itAvecChapitre)
          expect(r.skipped).toBe(itSuppr - itAvecChapitre)
          expect(
            s.tousLesItems().filter((i) => i.data.deleted_at !== null),
          ).toHaveLength(itSuppr - itAvecChapitre)
        }
      }),
      { numRuns: 300, seed: SEED },
    )
  })

  it('documenté — sans uuid (v1) : un chapitre ou un élément supprimé puis réimporté donne une NOUVELLE ligne (l’ancienne reste supprimée, une seule visible), comme le Rust', async () => {
    const desc = etatSimple()
    desc[0].items[0].supprime = true
    desc[1].supprime = true
    const s = demarrer(desc)
    const plein = new Simulateur()
    plein.charger(etatSimple())
    const fichier = enV1(exporter(plein))
    sim = s
    const r = await fusionner(fichier, false)
    expect(r.inserted).toBe(2)
    expect(s.chapters).toHaveLength(3)
    expect(s.tousLesItems()).toHaveLength(2)
    expect(s.vue().map((c) => c.label)).toEqual(['Sécurité', 'Sanitaire'])
    expect(s.vue()[0].items.map((i) => i.title)).toEqual(['Consignes'])
  })

  it('E1/E6 en fusion : un chapitre restauré revient AVEC ses éléments supprimés (le Rust le rendait vide)', async () => {
    const desc = etatSimple()
    desc[0].supprime = true
    desc[0].items[0].supprime = true
    const s = demarrer(desc)
    const plein = new Simulateur()
    plein.charger(etatSimple())
    const fichier = exporter(plein)
    sim = s
    const r = await fusionner(fichier, false)
    expect(r).toEqual(compteurs({ inserted: 2, unchanged: 1 }))
    expect(s.vue()[0].label).toBe('Sécurité')
    expect(s.vue()[0].items.map((i) => i.title)).toEqual(['Consignes'])
  })
})

// ---------------------------------------------------------------------------
// 7. Déplacement
// ---------------------------------------------------------------------------

describe('P7 — déplacement : même uuid, autre chapitre dans le fichier (R5)', () => {
  it('fast-check : ni perte ni doublon ; l’élément SUIT le chapitre du fichier (E6, le Rust le laissait sur place)', async () => {
    const avecDeuxChapitres = etatArb(true).filter(
      (desc) =>
        desc.filter((c) => !c.supprime).length >= 2 &&
        desc.some((c) => !c.supprime && c.items.some((i) => !i.supprime)),
    )
    await fc.assert(
      fc.asyncProperty(
        avecDeuxChapitres,
        idx,
        idx,
        fc.boolean(),
        async (desc, ci, cible, replace) => {
          const s = demarrer(desc)
          const f = exporter(s)
          const sources = f.chapters.filter((c) => c.items.length > 0)
          const src = sources[ci % sources.length]
          const autres = f.chapters.filter((c) => c !== src)
          const dst = autres[cible % autres.length]
          const [elt] = src.items.splice(0, 1)
          dst.items.push(elt)
          const avant = s.lignes()
          const orphelins = s.orphelins()
          const deplace = s.itemsParUuid(elt.uuid ?? '')[0]
          const cleDeplace = `${deplace.kind}:${deplace.data.uuid}`
          const chapitreLocal = deplace.data.chapter_id
          const chapitreCible = s.chapters.find((c) => c.uuid === dst.uuid)?.id
          // Le déplacement est UNE mise à jour de l'élément : il ne s'applique
          // que si le fichier gagne (remplacement, ou plus récent — R7/R8).
          const gagne =
            replace ||
            fichierPlusRecent(elt.updated_at, deplace.data.updated_at)

          const r = await fusionner(f, replace)
          expect(r.inserted).toBe(0)
          expect(r.deleted).toBe(replace ? orphelins.size : 0)
          expect(r.updated).toBe(gagne ? 1 : 0)
          for (const [cle, json] of avant) {
            if (gagne && cle === cleDeplace) continue
            if (!(replace && orphelins.has(cle)))
              expect(s.lignes().get(cle)).toBe(json)
          }
          const rows = s.itemsParUuid(elt.uuid ?? '')
          expect(rows).toHaveLength(1)
          expect(rows[0].data.chapter_id).toBe(
            gagne ? chapitreCible : chapitreLocal,
          )
          expect(
            s
              .vue()
              .flatMap((c) => c.items)
              .filter((i) => i.uuid === elt.uuid),
          ).toHaveLength(1)
        },
      ),
      { numRuns: 300, seed: SEED },
    )
  })

  it('défaut #4 — remplacement : élément déplacé dans le fichier ET chapitre d’origine absent → l’élément devient INVISIBLE alors que le fichier le contient', async () => {
    // « Le fichier fait foi » (R8/R11) : après remplacement, tout élément du
    // fichier devrait être visible. Ici il reste dans le chapitre d'origine,
    // que le remplacement supprime. Conforme au Rust (`move_detection`).
    const s = demarrer(etatSimple())
    const f = exporter(s)
    const [doc] = f.chapters[0].items.splice(0, 1)
    f.chapters[1].items.push(doc)
    f.chapters.splice(0, 1)
    const r = await fusionner(f, true)
    expect(r.deleted).toBe(1)
    const visibles = s.vue().flatMap((c) => c.items.map((i) => i.uuid))
    expect(visibles).toContain(doc.uuid)
  })
})

// ---------------------------------------------------------------------------
// 8. Restauration
// ---------------------------------------------------------------------------

describe('P8 — restauration d’un instantané', () => {
  it('fast-check : A → fusion B → restaurer A = A (vue identique, à updated_at près), ajouts de B en suppression douce', async () => {
    await fc.assert(
      fc.asyncProperty(
        etatArb(true),
        choixArb,
        fc.boolean(),
        async (desc, choix, replace) => {
          const s = demarrer(desc)
          const vueA = s.vue()
          const { fichier } = deriver(exporter(s), choix)
          await fusionner(fichier, replace, 'B.json')
          if (s.historique.length === 0) return // aucune action : rien à restaurer
          const entree = s.historique[0]
          expect(entree.source_name).toBe('B.json')

          const nAvant = s.historique.length
          const res = await restaurerInstantane(entree.id)
          expect(s.vue()).toEqual(vueA)
          for (const c of s.chapters)
            if (c.uuid.startsWith('new-')) expect(c.deleted_at).not.toBeNull()
          for (const i of s.tousLesItems())
            if (i.data.uuid.startsWith('new-'))
              expect(i.data.deleted_at).not.toBeNull()
          if (res === null) {
            // État déjà égal à l'instantané (B n'a touché que des orphelins
            // invisibles) : rien n'est écrit.
            expect(s.historique).toHaveLength(nAvant)
          } else {
            // L'instantané de sécurité précède les écritures de la restauration.
            const securite = s.historique.at(-1)
            expect(securite?.kind).toBe('securite')
            expect(securite?.label).toBe('Sauvegarde avant restauration')
            expect(securite?.source_name).toBe('')
          }
        },
      ),
      { numRuns: 300, seed: SEED },
    )
  })

  it('défaut #2 — élément modifié PUIS supprimé (deux fusions) : la restauration le remet visible avec le contenu MODIFIÉ, pas celui de l’instantané', async () => {
    // R6 restaure « sans mise à jour de son contenu ». Le Rust
    // (`restore_snapshot_data`) réinsérait chaque élément AVEC le contenu de
    // l'instantané : la restauration rendait A. Ici elle rend un état qui
    // n'a jamais existé.
    const s = demarrer(etatSimple())
    const b1 = exporter(s)
    b1.chapters[0].items[0].content = 'v2'
    await fusionner(b1, true, 'B1')
    const entreeA = s.historique[0]
    const b2 = exporter(s)
    b2.chapters[0].items = []
    await fusionner(b2, true, 'B2')
    expect(s.vue()[0].items).toEqual([])

    await restaurerInstantane(entreeA.id)
    expect(s.vue()[0].items).toHaveLength(1)
    expect(s.vue()[0].items[0].content).toBe('v1')
  })

  it('défaut #3 — la restauration ne rétablit ni le sort_order ni le chapitre d’un élément déplacé/réordonné depuis l’interface', async () => {
    // Le Rust réinsérait chapitres et éléments avec le `sort_order` et le
    // chapitre de l'instantané. Ici `champsDifferent` (R9) ignore
    // `sort_order`, et R5 ne déplace jamais : l'ordre et l'emplacement
    // courants survivent à la restauration.
    const desc = etatSimple()
    desc[0].items.push({ ...desc[0].items[0], title: 'Second', sort_order: 2 })
    const s = demarrer(desc)
    const vueA = s.vue()
    // Une fusion quelconque pour disposer d'un instantané de A.
    const b = exporter(s)
    b.chapters[1].description = 'B'
    await fusionner(b, false, 'B')
    const entreeA = s.historique[0]
    // Mutations depuis l'interface : réordonner, puis déplacer « Second ».
    const [d1, d2] = s.content.documents
    s.reordonner([
      { kind: 'document', id: d2.id },
      { kind: 'document', id: d1.id },
    ])
    s.deplacer('document', d2.id, s.chapters[1].id)

    await restaurerInstantane(entreeA.id)
    expect(s.vue()).toEqual(vueA)
  })

  it('restaurer deux fois : la seconde ne fait rien et n’écrit AUCUN instantané (updated_at ignoré par instantaneEgal)', async () => {
    const s = demarrer(etatSimple())
    const b = exporter(s)
    b.chapters[0].items[0].content = 'v2'
    await fusionner(b, true, 'B')
    const entreeA = s.historique[0]
    await restaurerInstantane(entreeA.id)
    const n = s.historique.length
    const r = await restaurerInstantane(entreeA.id)
    expect(r).toBeNull()
    expect(s.historique).toHaveLength(n)
  })
})

// ---------------------------------------------------------------------------
// 9. Ordre des écritures
// ---------------------------------------------------------------------------

describe('P9 — ordre des écritures', () => {
  it('fast-check : instantané avant toute écriture ; chapitre créé avant ses éléments ; suppressions éléments puis chapitres', async () => {
    await fc.assert(
      fc.asyncProperty(
        etatArb(false),
        choixArb,
        fc.boolean(),
        async (desc, choix, replace) => {
          const s = demarrer(desc)
          const { fichier } = deriver(exporter(s), choix)
          await fusionner(fichier, replace)
          const j = s.journal
          const iSnap = j.findIndex((e) => e.op === 'insertMergeHistory')
          const iPremiere = j.findIndex((e) => ECRITURES.has(e.op))
          if (iPremiere >= 0) {
            expect(iSnap).toBeGreaterThanOrEqual(0)
            expect(iSnap).toBeLessThan(iPremiere)
          } else {
            expect(iSnap).toBe(-1)
          }
          const crees = new Map<number, number>()
          j.forEach((e, i) => {
            if (e.op === 'createChapter' && e.id !== undefined)
              crees.set(e.id, i)
          })
          j.forEach((e, i) => {
            if (e.op !== 'createItem' || e.chapterId === undefined) return
            const c = crees.get(e.chapterId)
            if (c !== undefined) expect(c).toBeLessThan(i)
            expect(s.chapters.some((ch) => ch.id === e.chapterId)).toBe(true)
          })
          const ops = j.map((e) => e.op)
          const dernierItem = ops.lastIndexOf('softDeleteItem')
          const premierCh = ops.indexOf('softDeleteChapter')
          if (dernierItem >= 0 && premierCh >= 0)
            expect(dernierItem).toBeLessThan(premierCh)
        },
      ),
      { numRuns: 400, seed: SEED },
    )
  })
})

// ---------------------------------------------------------------------------
// 10. Périodicités (E3)
// ---------------------------------------------------------------------------

describe('P10 — périodicités appariées par libellé (E3)', () => {
  const casse = fc.constantFrom<(s: string) => string>(
    (x) => x,
    (x) => x.toUpperCase(),
    (x) => x.toLowerCase(),
  )

  it('fast-check : ids du fichier décalés, libellés recasés → id local retrouvé, aucun avertissement', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        casse,
        fc.constantFrom(41, 44, 49),
        fc.boolean(),
        (decalage, recaser, idLocal, existant) => {
          const s = demarrer(
            existant
              ? [
                  {
                    ...etatSimple()[0],
                    items: [
                      {
                        ...etatSimple()[0].items[0],
                        kind: 'tracking_sheet',
                        periodicite_id: 41,
                      },
                    ],
                  },
                ]
              : [{ ...etatSimple()[0], items: [] }],
          )
          const f = exporter(s)
          f._metadata = {
            description: '',
            generated_at: '',
            note: '',
            schema: null,
            periodicites: PERIODICITES.map((p) => ({
              id: p.id + decalage,
              label: recaser(p.label),
              nombre: p.nombre,
            })),
          }
          const item: ItemJson = existant
            ? { ...f.chapters[0].items[0], periodicite_id: idLocal + decalage }
            : {
                kind: 'tracking_sheet',
                title: 'Neuf',
                periodicite_id: idLocal + decalage,
                sort_order: 1,
              }
          f.chapters[0].items = [item]
          const plan = planifierFusion(s.etatLocal(), relire(f), {
            replace: true,
          })
          expect(plan.warnings).toEqual([])
          const champs = plan.actions.flatMap((a) =>
            a.type === 'creerItem' || a.type === 'modifierItem'
              ? [a.item.input]
              : [],
          )
          if (existant && idLocal === 41) expect(plan.actions).toEqual([])
          else
            expect(champs).toEqual([
              { title: item.title, periodicite_id: idLocal },
            ])
        },
      ),
      { numRuns: 300, seed: SEED },
    )
  })

  it('libellé inconnu : avertissement ; création → « Non défini », sinon la PREMIÈRE par sort_order ; mise à jour → périodicité locale conservée', () => {
    const meta = {
      description: '',
      generated_at: '',
      note: '',
      schema: null,
      periodicites: [{ id: 7, label: 'Hebdomadaire', nombre: 12 }],
    }
    const fichier = (items: ItemJson[]): ClasseurJson => ({
      format_version: 2,
      _metadata: meta,
      classeur: {
        name: 'x',
        icon: 'Shield',
        etablissement: '',
        etablissement_complement: '',
      },
      chapters: [
        {
          uid: 'securite',
          uuid: 'ch-1',
          label: 'Sécurité',
          icon: 'Flame',
          description: '',
          sort_order: 1,
          items,
        },
      ],
    })
    const neuf: ItemJson = {
      kind: 'tracking_sheet',
      title: 'Neuf',
      periodicite_id: 7,
      sort_order: 1,
    }

    const s1 = demarrer([{ ...etatSimple()[0], items: [] }])
    const p1 = planifierFusion(s1.etatLocal(), fichier([neuf]), {
      replace: false,
    })
    expect(p1.actions).toEqual([
      expect.objectContaining({
        item: {
          kind: 'tracking_sheet',
          input: { title: 'Neuf', periodicite_id: 49 },
        },
      }),
    ])
    expect(p1.warnings).toEqual([
      "Feuille de suivi 'Neuf' : périodicité 'Hebdomadaire' inconnue dans cette base, périodicité par défaut appliquée",
    ])

    const sansNonDefini = demarrer(
      [{ ...etatSimple()[0], items: [] }],
      [
        { id: 44, label: 'Annuel', nombre: 8, sort_order: 4 },
        { id: 41, label: 'Mensuel', nombre: 8, sort_order: 1 },
      ],
    )
    const p2 = planifierFusion(sansNonDefini.etatLocal(), fichier([neuf]), {
      replace: false,
    })
    expect(p2.actions[0]).toMatchObject({
      item: { input: { periodicite_id: 41 } },
    })

    const s3 = demarrer([
      {
        ...etatSimple()[0],
        items: [
          {
            ...etatSimple()[0].items[0],
            kind: 'tracking_sheet',
            periodicite_id: 44,
          },
        ],
      },
    ])
    const p3 = planifierFusion(
      s3.etatLocal(),
      fichier([{ ...neuf, uuid: 'it-2', title: 'Consignes' }]),
      { replace: true },
    )
    expect(p3.actions).toEqual([])
    expect(p3.warnings[0]).toContain('périodicité locale conservée')
  })

  it('documenté — `_metadata.periodicites` présent mais INCOMPLET : l’id du fichier est pris tel quel s’il existe localement, même sous un autre libellé', () => {
    const s = demarrer([{ ...etatSimple()[0], items: [] }])
    const f = exporter(s)
    f._metadata = {
      description: '',
      generated_at: '',
      note: '',
      schema: null,
      periodicites: [{ id: 1, label: 'Mensuel', nombre: 8 }],
    }
    // Chez l'émetteur, 44 = « Hebdomadaire » (absent des métadonnées) ;
    // ici 44 = « Annuel » : la feuille reçoit « Annuel » sans avertissement.
    f.chapters[0].items = [
      {
        kind: 'tracking_sheet',
        title: 'Neuf',
        periodicite_id: 44,
        sort_order: 1,
      },
    ]
    const plan = planifierFusion(s.etatLocal(), relire(f), { replace: false })
    expect(plan.warnings).toEqual([])
    expect(plan.actions[0]).toMatchObject({
      item: { input: { periodicite_id: 44 } },
    })
  })
})

// ---------------------------------------------------------------------------
// Import comme nouveau classeur
// ---------------------------------------------------------------------------

describe('importerCommeNouveauClasseur', () => {
  it('fast-check : le classeur créé montre exactement les chapitres et éléments du fichier (titres vides compris s’ils ont un uuid, E8), dans l’ordre du fichier', async () => {
    await fc.assert(
      fc.asyncProperty(etatArb(false), async (desc) => {
        const source = demarrer(desc)
        const fichier = exporter(source)
        const attendu = sansUuid(source.vue())
        const s = demarrer([])
        const id = await importerCommeNouveauClasseur(relire(fichier))
        const obtenu = sansUuid(s.vue(id)).map((c, i) => ({
          ...c,
          // R3 : rang 1..n au lieu du sort_order du fichier (le Rust copiait
          // le sort_order). Même ordre relatif car l'export est trié.
          sort_order: attendu[i]?.sort_order ?? c.sort_order,
        }))
        expect(obtenu).toEqual(attendu)
        expect(s.historique).toEqual([])
      }),
      { numRuns: 200, seed: SEED },
    )
  })
})
