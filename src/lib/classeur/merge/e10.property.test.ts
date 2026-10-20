import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

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
import { ancienPlanifierFusion } from '#/lib/classeur/merge/fusionAvantE10.oracle.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type { EtatLocal } from '#/lib/classeur/merge/merge.ts'
import {
  construireExportChapitre,
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import { ancienPlanifierFusionPortee } from '#/lib/classeur/merge/porteeAvantRefus.oracle.ts'
import {
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson, ItemJson } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterContent,
  DbChapter,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { ITEM_KINDS } from '#/lib/classeur/types.ts'

/*
 * E10 et garde de portée (relecture adverse du 2026-10-04) : pour tout
 * export NORMAL — uuids uniques, aucun uuid étranger à la portée —, le plan
 * est EXACTEMENT celui d'avant le correctif. Oracles : `merge.ts` copié au
 * commit 2b91650 (`fusionAvantE10.oracle.ts`) pour la fusion complète,
 * `porteeAvantRefus.oracle.ts` pour la portée chapitre.
 *
 * Les dérivations imitent ce qu'un humain ou un LLM fait d'un export :
 * textes et titres changés, éléments retirés, éléments ajoutés (avec un uuid
 * NEUF — et alors un titre neuf, voir `nouvelItem` — ou sans), uuids tous
 * retirés (fichier v1). Les titres et libellés
 * viennent de petits ensembles : doublons fréquents (files de E7).
 */

const SEED = 20261004
const NUM_RUNS = 500
const T_SUPPR = '2026-02-01T00:00:00+00:00'

const TITRES = ['Consignes', 'Registre', 'a', 'A', 'Émargement']
const LIBELLES = ['Sécurité', 'SECURITE', 'Sanitaire', 'Chap']

interface DescItem {
  kind: ItemKind
  titre: string
  texte: string
  ordre: number
  supprime: boolean
  /** 0 garder, 1 texte changé, 2 titre changé, 3 retiré du fichier. */
  sort: number
}
interface DescChapitre {
  libelle: string
  ordre: number
  supprime: boolean
  items: DescItem[]
}
interface DescNouveau {
  chapitre: number
  kind: ItemKind
  titre: string
  ordre: number
  avecUuid: boolean
}
interface Desc {
  chapitres: DescChapitre[]
  nouveaux: DescNouveau[]
  v1: boolean
  replace: boolean
  retirerChapitre: number | null
}

const descArb: fc.Arbitrary<Desc> = fc.record({
  chapitres: fc.array(
    fc.record({
      libelle: fc.constantFrom(...LIBELLES),
      ordre: fc.integer({ min: 0, max: 5 }),
      supprime: fc.oneof(
        { weight: 4, arbitrary: fc.constant(false) },
        { weight: 1, arbitrary: fc.constant(true) },
      ),
      items: fc.array(
        fc.record({
          kind: fc.constantFrom(...ITEM_KINDS),
          titre: fc.constantFrom(...TITRES),
          texte: fc.constantFrom('', 'x', 'a\nb'),
          ordre: fc.integer({ min: 0, max: 5 }),
          supprime: fc.oneof(
            { weight: 4, arbitrary: fc.constant(false) },
            { weight: 1, arbitrary: fc.constant(true) },
          ),
          sort: fc.nat({ max: 3 }),
        }),
        { maxLength: 5 },
      ),
    }),
    { minLength: 1, maxLength: 4 },
  ),
  nouveaux: fc.array(
    fc.record({
      chapitre: fc.nat({ max: 9 }),
      kind: fc.constantFrom(...ITEM_KINDS),
      titre: fc.constantFrom(...TITRES, 'Nouveau'),
      ordre: fc.integer({ min: 0, max: 5 }),
      avecUuid: fc.boolean(),
    }),
    { maxLength: 4 },
  ),
  v1: fc.boolean(),
  replace: fc.boolean(),
  retirerChapitre: fc.option(fc.nat({ max: 9 }), { nil: null }),
})

function construireLocal(d: Desc): EtatLocal {
  const chapters: DbChapter[] = d.chapitres.map((c, i) =>
    chapitre({
      id: 10 * (i + 1),
      label: c.libelle,
      sort_order: c.ordre,
      deleted_at: c.supprime ? T_SUPPR : null,
    }),
  )
  const content: ChapterContent = {
    documents: [],
    tracking_sheets: [],
    signature_sheets: [],
    intercalaires: [],
  }
  let id = 1
  d.chapitres.forEach((c, i) => {
    for (const it of c.items) {
      const base = {
        id: id++,
        chapter_id: 10 * (i + 1),
        title: it.titre,
        sort_order: it.ordre,
        deleted_at: it.supprime ? T_SUPPR : null,
      }
      if (it.kind === 'document')
        content.documents.push(document({ ...base, content: it.texte }))
      else if (it.kind === 'tracking_sheet')
        content.tracking_sheets.push(suivi(base))
      else if (it.kind === 'signature_sheet')
        content.signature_sheets.push(signature(base))
      else content.intercalaires.push(intercalaire(base))
    }
  })
  return etat(chapters, content)
}

/** Sort de chaque élément du fichier, retrouvé par son uuid d'export. */
function sortsParUuid(d: Desc, local: EtatLocal): Map<string, number> {
  const m = new Map<string, number>()
  const tous = [
    ...local.content.documents,
    ...local.content.tracking_sheets,
    ...local.content.signature_sheets,
    ...local.content.intercalaires,
  ]
  const descs = d.chapitres.flatMap((c) => c.items)
  for (const ligne of tous) m.set(ligne.uuid, descs[ligne.id - 1].sort)
  return m
}

function deriverItems(
  items: ItemJson[],
  sorts: Map<string, number>,
): ItemJson[] {
  const sortie: ItemJson[] = []
  for (const it of items) {
    const sort = it.uuid === undefined ? 0 : (sorts.get(it.uuid) ?? 0)
    if (sort === 3) continue
    if (sort === 1) sortie.push({ ...it, content: `${it.content ?? ''}+` })
    else if (sort === 2) sortie.push({ ...it, title: `${it.title} (révisé)` })
    else sortie.push(it)
  }
  return sortie
}

function nouvelItem(n: DescNouveau, rang: number): ItemJson {
  return {
    kind: n.kind,
    // Avec un uuid neuf : titre unique. Apparié par titre, l'ancien code lui
    // donnait cet uuid (E6), le nouveau non (E11) — écart VOULU, hors de
    // cette propriété, porté par `uuidUnique.simulateur.test.ts`.
    title: n.avecUuid ? `Nouveau ${String(rang)}` : n.titre,
    sort_order: n.ordre,
    ...(n.kind === 'document' ? { content: 'neuf' } : {}),
    ...(n.kind === 'tracking_sheet' ? { periodicite_id: 41 } : {}),
    ...(n.avecUuid ? { uuid: `neuf-${rang}` } : {}),
  }
}

function enV1(f: ClasseurJson): ClasseurJson {
  return {
    ...f,
    chapters: f.chapters.map(({ uuid: _c, ...ch }) => ({
      ...ch,
      items: ch.items.map(({ uuid: _i, ...it }) => it),
    })),
  }
}

function relire(f: ClasseurJson): ClasseurJson {
  return parseImportJson(JSON.stringify(f))
}

describe('E10 / portée — un export normal donne EXACTEMENT le plan d’avant', () => {
  it('fusion complète (fusion et remplacement, v2 et v1)', () => {
    fc.assert(
      fc.property(descArb, (d) => {
        const local = construireLocal(d)
        const sorts = sortsParUuid(d, local)
        const exporte = relire(
          construireExport(
            classeur(),
            local.chapters,
            local.content,
            PERIODICITES,
          ),
        )
        let chapters = exporte.chapters.map((ch) => ({
          ...ch,
          items: deriverItems(ch.items, sorts),
        }))
        if (d.retirerChapitre !== null && chapters.length > 0)
          chapters = chapters.filter(
            (_, i) => i !== d.retirerChapitre! % chapters.length,
          )
        d.nouveaux.forEach((n, rang) => {
          if (chapters.length === 0) return
          chapters[n.chapitre % chapters.length].items.push(nouvelItem(n, rang))
        })
        let f: ClasseurJson = { ...exporte, chapters }
        if (d.v1) f = enV1(f)
        f = relire(f)
        expect(planifierFusion(local, f, { replace: d.replace })).toEqual(
          ancienPlanifierFusion(local, f, { replace: d.replace }),
        )
      }),
      { numRuns: NUM_RUNS, seed: SEED },
    )
  })

  it('portée chapitre (export d’un chapitre retravaillé)', () => {
    fc.assert(
      fc.property(descArb, (d) => {
        const local = construireLocal(d)
        const visibles = local.chapters.filter((c) => c.deleted_at === null)
        fc.pre(visibles.length > 0)
        const cible = visibles[0]
        const sorts = sortsParUuid(d, local)
        const exporte = relire(
          construireExportChapitre(
            classeur(),
            cible,
            local.content,
            PERIODICITES,
          ),
        )
        const items = deriverItems(exporte.chapters[0].items, sorts)
        d.nouveaux.forEach((n, rang) => items.push(nouvelItem(n, rang)))
        const f = relire({
          ...exporte,
          chapters: [{ ...exporte.chapters[0], items }],
        })
        // Depuis le 2026-10-20, un absent n'est jamais supprimé : l'ancien
        // plan sans la case est la référence.
        const ciblePortee = { type: 'chapitre', chapitreId: cible.id } as const
        expect(planifierFusionPortee(local, f, ciblePortee)).toEqual(
          ancienPlanifierFusionPortee(local, f, ciblePortee, {
            supprimerAbsents: false,
          }),
        )
      }),
      { numRuns: NUM_RUNS, seed: SEED },
    )
  })
})
