import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  debutJourParis,
  derniereVersionParDocument,
  elementsDesGroupes,
  jourParis,
  jourParisMoins,
  modifiesDepuis,
} from '#/lib/classeur/selectionImpression.ts'
import type {
  GroupeModifies,
  MotifModification,
  VersionModifiee,
} from '#/lib/classeur/selectionImpression.ts'
import { ITEM_KINDS, flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
  ChapterItem,
  DbChapter,
  ItemKind,
} from '#/lib/classeur/types.ts'

/*
 * Étape 5 — « Imprimer les modifications ». Oracle INDÉPENDANT : un filtrage
 * naïf, ligne à ligne, de chaque chapitre (trié à la main) et de chaque
 * version ; il ne partage avec le code que `flattenItems` (l'ordre de la
 * page d'un chapitre, qui est le contrat) et la notion de date stricte.
 */

const DEPUIS = '2026-09-27T22:00:00.000Z'
const T0 = Date.parse(DEPUIS)
const iso = (ms: number) => new Date(ms).toISOString()

function chapitre(id: number, sort_order = id, supprime = false): DbChapter {
  return {
    id,
    uuid: `c-${id}`,
    classeur_id: 24,
    label: `Chapitre ${id}`,
    icon: 'Folder',
    description: '',
    sort_order,
    deleted_at: supprime ? DEPUIS : null,
    created_at: DEPUIS,
    updated_at: DEPUIS,
  }
}

interface Ligne {
  kind: ItemKind
  id: number
  chapter_id: number
  sort_order: number
  supprime: boolean
  cree: number
  modifie: number
}

function item(l: Ligne): ChapterItem {
  const base = {
    id: l.id,
    uuid: `u-${l.kind}-${l.id}`,
    chapter_id: l.chapter_id,
    title: `${l.kind} ${l.id}`,
    description: '',
    sort_order: l.sort_order,
    deleted_at: l.supprime ? DEPUIS : null,
    created_at: iso(l.cree),
    updated_at: iso(l.modifie),
  }
  switch (l.kind) {
    case 'document':
      return { kind: l.kind, data: { ...base, content: '' } }
    case 'tracking_sheet':
      return { kind: l.kind, data: { ...base, periodicite_id: 1 } }
    case 'signature_sheet':
      return { kind: l.kind, data: { ...base, nombre: 5 } }
    case 'intercalaire':
      return { kind: l.kind, data: base }
  }
}

function contenuDe(items: ChapterItem[]): ChapterContent {
  const c: ChapterContent = {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
  }
  for (const el of items) {
    if (el.kind === 'document') c.documents.push(el.data)
    else if (el.kind === 'tracking_sheet') c.tracking_sheets.push(el.data)
    else if (el.kind === 'signature_sheet') c.signature_sheets.push(el.data)
    else c.intercalaires.push(el.data)
  }
  return c
}

function version(
  id: number,
  document_id: number,
  ms: number,
  origine: VersionModifiee['origine'] = 'enregistrement',
): VersionModifiee {
  return {
    id,
    document_id,
    origine,
    auteur: `Auteur ${id}`,
    created_at: iso(ms),
    version: `1.${id}`,
    raison: `raison ${id}`,
  }
}

/** Oracle naïf : ligne à ligne, sans Map ni dédoublonnage astucieux. */
function oracle(
  chapters: DbChapter[],
  content: ChapterContent,
  versions: VersionModifiee[],
  depuisMs: number,
): GroupeModifies[] {
  const chapitresTries = chapters
    .filter((c) => c.deleted_at === null)
    .slice()
    .sort((a, b) =>
      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.id - b.id,
    )
  const sortie: GroupeModifies[] = []
  const dejaVus: number[] = []
  for (const ch of chapitresTries) {
    if (dejaVus.includes(ch.id)) continue
    dejaVus.push(ch.id)
    const elements: GroupeModifies['elements'] = []
    for (const el of flattenItems(content)) {
      if (el.data.chapter_id !== ch.id || el.data.deleted_at !== null) continue
      let motif: MotifModification | null = null
      if (el.kind === 'document') {
        const siennes = versions.filter(
          (v) =>
            v.document_id === el.data.id &&
            v.origine !== 'etat_initial' &&
            Date.parse(v.created_at) > depuisMs,
        )
        if (siennes.length > 0) {
          let best = siennes[0]
          for (const v of siennes) {
            const tv = Date.parse(v.created_at)
            const tb = Date.parse(best.created_at)
            if (tv > tb || (tv === tb && v.id > best.id)) best = v
          }
          motif = {
            type: 'version',
            version: best.version ?? '',
            raison: best.raison ?? '',
            auteur: best.auteur,
            date: best.created_at,
          }
        }
      } else if (Date.parse(el.data.updated_at) > depuisMs) {
        motif = {
          type: 'feuille',
          nouvelle: Date.parse(el.data.created_at) > depuisMs,
          date: el.data.updated_at,
        }
      }
      if (motif !== null) elements.push({ item: el, motif })
    }
    if (elements.length > 0) sortie.push({ chapitre: ch, elements })
  }
  return sortie
}

// --- Générateurs -----------------------------------------------------------

/** Un instant proche de la date (± 3 ms) ou loin (± 10 jours). */
const arbInstant = fc.oneof(
  fc.integer({ min: -3, max: 3 }).map((d) => T0 + d),
  fc.integer({ min: -864_000_000, max: 864_000_000 }).map((d) => T0 + d),
)

const arbChapitres = fc
  .uniqueArray(
    fc.record({
      id: fc.integer({ min: 1, max: 5 }),
      sort_order: fc.integer({ min: 0, max: 4 }),
      supprime: fc.boolean(),
    }),
    { selector: (r) => r.id, maxLength: 5 },
  )
  .chain((cs) =>
    // Un chapitre parfois listé deux fois.
    fc.boolean().map((doublon) => {
      const liste = cs.map((c) => chapitre(c.id, c.sort_order, c.supprime))
      return doublon && liste.length > 0 ? [...liste, liste[0]] : liste
    }),
  )

const arbLignes = fc.uniqueArray(
  fc.record({
    kind: fc.constantFrom(...ITEM_KINDS),
    id: fc.integer({ min: 1, max: 15 }),
    // 6 : un chapitre qui n'existe pas (ou plus) dans la liste.
    chapter_id: fc.integer({ min: 1, max: 6 }),
    sort_order: fc.integer({ min: 0, max: 8 }),
    supprime: fc.boolean(),
    cree: arbInstant,
    modifie: arbInstant,
  }),
  { selector: (r) => `${r.kind}:${r.id}`, maxLength: 20 },
)

const arbVersions = fc.uniqueArray(
  fc.record({
    id: fc.integer({ min: 1, max: 200 }),
    document_id: fc.integer({ min: 1, max: 17 }),
    ms: arbInstant,
    origine: fc.constantFrom<VersionModifiee['origine']>(
      'creation',
      'enregistrement',
      'etat_initial',
    ),
  }),
  { selector: (r) => r.id, maxLength: 30 },
)

const arbCas = fc.record({
  chapters: arbChapitres,
  lignes: arbLignes,
  versions: arbVersions.map((vs) =>
    vs.map((v) => version(v.id, v.document_id, v.ms, v.origine)),
  ),
})

const PARAMS = { numRuns: 500, seed: 20261004 }

function calculer(c: {
  chapters: DbChapter[]
  lignes: Ligne[]
  versions: VersionModifiee[]
}) {
  const content = contenuDe(c.lignes.map(item))
  return {
    content,
    obtenu: modifiesDepuis({
      chapters: c.chapters,
      content,
      versions: c.versions,
      depuis: DEPUIS,
    }),
  }
}

const cles = (gs: GroupeModifies[]) =>
  elementsDesGroupes(gs).map((el) => `${el.kind}:${el.data.id}`)

// --- Propriétés ------------------------------------------------------------

describe('modifiesDepuis — propriétés (oracle naïf)', () => {
  it('égale le filtrage naïf ligne à ligne', () => {
    fc.assert(
      fc.property(arbCas, (c) => {
        const { content, obtenu } = calculer(c)
        expect(obtenu).toEqual(oracle(c.chapters, content, c.versions, T0))
      }),
      PARAMS,
    )
  })

  it('un document réordonné ou déplacé SANS version n’apparaît pas', () => {
    fc.assert(
      fc.property(arbCas, (c) => {
        // Tous les documents « touchés » après la date, aucune version.
        const lignes = c.lignes.map((l) =>
          l.kind === 'document' ? { ...l, modifie: T0 + 60_000 } : l,
        )
        const { obtenu } = calculer({ ...c, lignes, versions: [] })
        expect(cles(obtenu).some((k) => k.startsWith('document:'))).toBe(false)
      }),
      PARAMS,
    )
  })

  it('un document à N versions après la date apparaît UNE fois, avec la plus récente', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 10_000_000 }), {
          minLength: 1,
          maxLength: 8,
        }),
        (decalages) => {
          const versions = decalages.map((d, i) => version(i + 1, 7, T0 + d))
          const plusRecente = Math.max(...decalages)
          const obtenu = modifiesDepuis({
            chapters: [chapitre(1)],
            content: contenuDe([
              item({
                kind: 'document',
                id: 7,
                chapter_id: 1,
                sort_order: 0,
                supprime: false,
                cree: T0 - 1,
                modifie: T0 - 1,
              }),
            ]),
            versions,
            depuis: DEPUIS,
          })
          expect(cles(obtenu)).toEqual(['document:7'])
          const motif = obtenu[0].elements[0].motif
          expect(motif.type === 'version' && motif.date).toBe(
            iso(T0 + plusRecente),
          )
        },
      ),
      PARAMS,
    )
  })

  it('un document qui n’a que des états initiaux n’apparaît pas', () => {
    fc.assert(
      fc.property(arbCas, (c) => {
        const versions = c.versions.map((v) => ({
          ...v,
          origine: 'etat_initial' as const,
        }))
        const { obtenu } = calculer({ ...c, versions })
        expect(cles(obtenu).some((k) => k.startsWith('document:'))).toBe(false)
      }),
      PARAMS,
    )
  })

  it('un élément supprimé, ou d’un chapitre supprimé ou absent, n’apparaît pas', () => {
    fc.assert(
      fc.property(arbCas, (c) => {
        const { obtenu } = calculer(c)
        const vivants = new Set(
          c.chapters.filter((ch) => ch.deleted_at === null).map((ch) => ch.id),
        )
        for (const g of obtenu) {
          expect(vivants.has(g.chapitre.id)).toBe(true)
          for (const e of g.elements) {
            expect(e.item.data.deleted_at).toBeNull()
            expect(e.item.data.chapter_id).toBe(g.chapitre.id)
          }
        }
        // Aucun doublon, aucun groupe vide.
        const k = cles(obtenu)
        expect(new Set(k).size).toBe(k.length)
        expect(obtenu.every((g) => g.elements.length > 0)).toBe(true)
      }),
      PARAMS,
    )
  })
})

// --- Exemples écrits à la main ---------------------------------------------

describe('modifiesDepuis — bornes et cas écrits à la main', () => {
  const doc = (id: number, chapter_id = 1, sort_order = id) =>
    item({
      kind: 'document',
      id,
      chapter_id,
      sort_order,
      supprime: false,
      cree: T0 - 86_400_000,
      modifie: T0 - 86_400_000,
    })
  const feuille = (kind: ItemKind, id: number, cree: number, modifie: number) =>
    item({
      kind,
      id,
      chapter_id: 1,
      sort_order: id,
      supprime: false,
      cree,
      modifie,
    })
  const lancer = (items: ChapterItem[], versions: VersionModifiee[] = []) =>
    modifiesDepuis({
      chapters: [chapitre(1)],
      content: contenuDe(items),
      versions,
      depuis: DEPUIS,
    })

  it('version à date − 1 ms exclue, à date + 1 ms incluse, à la date exacte exclue', () => {
    expect(cles(lancer([doc(1)], [version(1, 1, T0 - 1)]))).toEqual([])
    expect(cles(lancer([doc(1)], [version(1, 1, T0)]))).toEqual([])
    expect(cles(lancer([doc(1)], [version(1, 1, T0 + 1)]))).toEqual([
      'document:1',
    ])
  })

  it('feuille : updated_at à date − 1 ms exclue, + 1 ms incluse', () => {
    expect(
      cles(lancer([feuille('signature_sheet', 2, T0 - 9, T0 - 1)])),
    ).toEqual([])
    expect(cles(lancer([feuille('signature_sheet', 2, T0 - 9, T0)]))).toEqual(
      [],
    )
    expect(
      cles(lancer([feuille('signature_sheet', 2, T0 - 9, T0 + 1)])),
    ).toEqual(['signature_sheet:2'])
  })

  it('une feuille dit si elle est nouvelle (créée après la date) ou seulement changée', () => {
    const [g] = lancer([
      feuille('tracking_sheet', 1, T0 + 1, T0 + 5),
      feuille('intercalaire', 2, T0, T0 + 5),
    ])
    expect(g.elements.map((e) => e.motif)).toEqual([
      { type: 'feuille', nouvelle: true, date: iso(T0 + 5) },
      { type: 'feuille', nouvelle: false, date: iso(T0 + 5) },
    ])
  })

  it('l’updated_at d’un document est ignoré : seule une version compte', () => {
    const touche = item({
      kind: 'document',
      id: 3,
      chapter_id: 1,
      sort_order: 0,
      supprime: false,
      cree: T0 + 10,
      modifie: T0 + 10,
    })
    expect(lancer([touche])).toEqual([])
  })

  it('motif d’une version : numéro, raison, auteur, date ; repli si non versionnée', () => {
    const v = version(4, 1, T0 + 2)
    expect(lancer([doc(1)], [v])[0].elements[0].motif).toEqual({
      type: 'version',
      version: '1.4',
      raison: 'raison 4',
      auteur: 'Auteur 4',
      date: v.created_at,
    })
    const ancienne = { ...v, version: undefined, raison: undefined }
    expect(lancer([doc(1)], [ancienne])[0].elements[0].motif).toMatchObject({
      version: '',
      raison: '',
    })
  })

  it('à date égale, la version à la plus grande id l’emporte (dans les deux ordres)', () => {
    const a = version(5, 1, T0 + 9)
    const b = version(8, 1, T0 + 9)
    expect(derniereVersionParDocument([a, b], T0).get(1)?.id).toBe(8)
    expect(derniereVersionParDocument([b, a], T0).get(1)?.id).toBe(8)
  })

  it('une version plus ancienne lue après la plus récente ne la remplace pas', () => {
    const recente = version(1, 1, T0 + 50)
    const ancienne = version(2, 1, T0 + 10)
    expect(derniereVersionParDocument([recente, ancienne], T0).get(1)?.id).toBe(
      1,
    )
    expect(derniereVersionParDocument([ancienne, recente], T0).get(1)?.id).toBe(
      1,
    )
  })

  it('ordre du classeur : chapitres par sort_order puis id, éléments par sort_order', () => {
    const obtenu = modifiesDepuis({
      chapters: [chapitre(2, 0), chapitre(1, 1), chapitre(3, 0)],
      content: contenuDe([
        doc(10, 1, 5),
        doc(11, 1, 2),
        doc(12, 2, 0),
        doc(13, 3, 0),
      ]),
      versions: [10, 11, 12, 13].map((d) => version(d, d, T0 + 1)),
      depuis: DEPUIS,
    })
    expect(obtenu.map((g) => g.chapitre.id)).toEqual([2, 3, 1])
    expect(cles(obtenu)).toEqual([
      'document:12',
      'document:13',
      'document:11',
      'document:10',
    ])
  })

  it('date illisible : rien (jamais tout)', () => {
    expect(
      modifiesDepuis({
        chapters: [chapitre(1)],
        content: contenuDe([doc(1)]),
        versions: [version(1, 1, T0 + 1)],
        depuis: 'pas une date',
      }),
    ).toEqual([])
  })

  it('élément ou chapitre supprimé exclus ; un chapitre listé deux fois = un groupe', () => {
    const supprime = item({
      kind: 'document',
      id: 1,
      chapter_id: 1,
      sort_order: 0,
      supprime: true,
      cree: T0 - 1,
      modifie: T0 - 1,
    })
    expect(lancer([supprime], [version(1, 1, T0 + 1)])).toEqual([])
    expect(
      modifiesDepuis({
        chapters: [chapitre(1, 0, true)],
        content: contenuDe([doc(1)]),
        versions: [version(1, 1, T0 + 1)],
        depuis: DEPUIS,
      }),
    ).toEqual([])
    const deux = modifiesDepuis({
      chapters: [chapitre(1), chapitre(1)],
      content: contenuDe([doc(1)]),
      versions: [version(1, 1, T0 + 1)],
      depuis: DEPUIS,
    })
    expect(deux).toHaveLength(1)
  })
})

describe('dates au fuseau de Paris', () => {
  it('minuit à Paris, été comme hiver, jours de changement d’heure compris', () => {
    expect(debutJourParis('2026-10-04')).toBe('2026-10-03T22:00:00.000Z')
    expect(debutJourParis('2026-01-15')).toBe('2026-01-14T23:00:00.000Z')
    expect(debutJourParis('2026-03-29')).toBe('2026-03-28T23:00:00.000Z')
    expect(debutJourParis('2026-03-30')).toBe('2026-03-29T22:00:00.000Z')
    expect(debutJourParis('2026-10-25')).toBe('2026-10-24T22:00:00.000Z')
    expect(debutJourParis('2026-10-26')).toBe('2026-10-25T23:00:00.000Z')
  })

  it('refuse un jour illisible ou inexistant', () => {
    for (const j of [
      '',
      '2026-02-30',
      '2026-13-01',
      '2026-2-3',
      '2026-00-10',
      'x2026-10-04',
      '2026-10-04x',
      '0050-01-01',
    ])
      expect(debutJourParis(j)).toBeNull()
    expect(debutJourParis('2024-02-29')).toBe('2024-02-28T23:00:00.000Z')
  })

  it('le jour de Paris d’un instant, de part et d’autre de minuit', () => {
    expect(jourParis(Date.parse('2026-10-03T21:59:59.999Z'))).toBe('2026-10-03')
    expect(jourParis(Date.parse('2026-10-03T22:00:00.000Z'))).toBe('2026-10-04')
    expect(jourParis(Date.parse('2026-01-14T23:00:00.000Z'))).toBe('2026-01-15')
  })

  it('J − n au fuseau de Paris, à travers les mois', () => {
    expect(jourParisMoins(Date.parse('2026-10-04T10:00:00Z'), 7)).toBe(
      '2026-09-27',
    )
    expect(jourParisMoins(Date.parse('2026-03-01T23:30:00Z'), 7)).toBe(
      '2026-02-23',
    )
    expect(jourParisMoins(Date.parse('2026-03-01T23:30:00Z'), 0)).toBe(
      '2026-03-02',
    )
  })

  it('propriété : minuit de Paris appartient au jour, la ms d’avant à la veille', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2000-01-01T12:00:00Z'),
          max: new Date('2099-12-31T12:00:00Z'),
          noInvalidDate: true,
        }),
        (d) => {
          const jour = d.toISOString().slice(0, 10)
          const debut = debutJourParis(jour)
          expect(debut).not.toBeNull()
          const ms = Date.parse(debut ?? '')
          expect(jourParis(ms)).toBe(jour)
          expect(jourParis(ms - 1)).toBe(jourParisMoins(ms, 1))
          expect(jourParisMoins(ms, 1)).not.toBe(jour)
        },
      ),
      PARAMS,
    )
  })
})
