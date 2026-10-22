import { describe, expect, it } from 'vitest'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import {
  clesChangeesDepuisExport,
  planifierImportIa,
} from '#/lib/classeur/merge/importIa.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Éléments changés dans l'application APRÈS l'export dont vient le fichier
 * (trouvé au navigateur le 2026-10-22 : un fichier de quiz pris avant
 * l'amélioration de deux documents les ramenait à leur ancien texte). Seule
 * une MODIFICATION d'un élément dont la base est plus récente que l'export
 * est signalée ; le reste du fichier fait foi.
 */

const A = chapitre({ id: 10, label: 'Accueil' })
const EXPORT = '2026-10-22T20:05:42.585489+00:00'
const d1 = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'ancien',
  updated_at: EXPORT,
})
const d2 = document({
  id: 2,
  chapter_id: 10,
  title: 'Check-out',
  content: 'ancien',
  sort_order: 2,
  updated_at: EXPORT,
})
const s1 = suivi({ id: 3, chapter_id: 10, title: 'Alarme', sort_order: 3 })

/** L'export, puis ce que le LLM en fait. */
function fichier(modifier: (f: ClasseurJson) => void): ClasseurJson {
  const f = construireExport(
    classeur(),
    [A],
    etat([A], { documents: [d1, d2], tracking_sheets: [s1] }).content,
    PERIODICITES,
  )
  modifier(f)
  return f
}

function cles(locaux: { d1?: string; d2?: string }, f: ClasseurJson): string[] {
  const local = etat([A], {
    documents: [
      { ...d1, ...(locaux.d1 ? { updated_at: locaux.d1 } : {}) },
      { ...d2, ...(locaux.d2 ? { updated_at: locaux.d2 } : {}) },
    ],
    tracking_sheets: [s1],
  })
  return clesChangeesDepuisExport(local, f, planifierImportIa(local, f))
}

const reecrit = (f: ClasseurJson) => {
  f.chapters[0].items[0].content = 'réécrit par le LLM'
  f.chapters[0].items[1].content = 'réécrit aussi'
}

describe('clesChangeesDepuisExport', () => {
  it('rien n’a bougé dans l’application : rien n’est signalé', () => {
    expect(cles({}, fichier(reecrit))).toEqual([])
  })

  it('un document amélioré après l’export est signalé, pas l’autre', () => {
    expect(
      cles({ d1: '2026-10-22T20:16:39.369404+00:00' }, fichier(reecrit)),
    ).toEqual(['document:1'])
  })

  it('les microsecondes de la base ne font pas un faux changement', () => {
    // Même milliseconde, microsecondes différentes : rien.
    expect(
      cles({ d1: '2026-10-22T20:05:42.585999+00:00' }, fichier(reecrit)),
    ).toEqual([])
    // Une milliseconde plus tard : changé.
    expect(
      cles({ d1: '2026-10-22T20:05:42.586+00:00' }, fichier(reecrit)),
    ).toEqual(['document:1'])
  })

  it('un fichier sans horodatage (le LLM l’a retiré) : rien n’est signalé', () => {
    const f = fichier((x) => {
      reecrit(x)
      for (const it of x.chapters[0].items) delete it.updated_at
    })
    expect(cles({ d1: '2026-10-23T00:00:00+00:00' }, f)).toEqual([])
  })

  it('un ajout ou une suppression demandée n’est jamais signalé', () => {
    const f = fichier((x) => {
      x.chapters[0].items[1].supprimer = true
      x.chapters[0].items.push({
        kind: 'document',
        title: 'Quiz',
        description: '',
        content: 'Q1',
        sort_order: 9,
      })
    })
    expect(
      cles(
        { d1: '2026-10-23T00:00:00+00:00', d2: '2026-10-23T00:00:00+00:00' },
        f,
      ),
    ).toEqual([])
  })
})
