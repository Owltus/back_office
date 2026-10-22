import { describe, expect, it } from 'vitest'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierImportIa } from '#/lib/classeur/merge/importIa.ts'
import { lignesImport } from '#/lib/classeur/merge/portee.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'

/*
 * Aperçu d'un import, ligne d'un CHAPITRE (trouvé au navigateur le
 * 2026-10-22) : un chapitre neuf (un LLM qui en ajoute un, ou mêle deux
 * classeurs) et un chapitre que le fichier ramène de la corbeille (export
 * pris avant sa suppression) se lisaient tous deux « Modifié, Libellé ou
 * description ». Chacun dit désormais ce qui lui arrive.
 */

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })
const M = chapitre({ id: 20, label: 'Ménage', sort_order: 2 })
const d1 = document({ id: 1, chapter_id: 10, title: 'Check-in', content: 'x' })
const d2 = document({ id: 2, chapter_id: 20, title: 'Recouche', content: 'y' })

describe('lignesImport — ce qui arrive à un chapitre', () => {
  // Export pris AVANT la suppression du chapitre Ménage.
  const fichier = construireExport(
    classeur(),
    [A, M],
    etat([A, M], { documents: [d1, d2] }).content,
    PERIODICITES,
  )
  fichier.chapters.push({
    uid: 'annexes',
    label: 'Annexes',
    icon: 'FileText',
    description: '',
    sort_order: 3,
    items: [],
  })
  fichier.chapters[0].description = 'Arrivées et départs'
  const supprime = '2026-10-22T20:00:00+00:00'
  const local = etat([A, { ...M, deleted_at: supprime }], {
    documents: [d1, { ...d2, deleted_at: supprime }],
  })
  const lignes = lignesImport(local, planifierImportIa(local, fichier))
  const de = (titre: string) => lignes.find((l) => l.titre === titre)

  it('un chapitre neuf est une création', () => {
    expect(de('Annexes')?.actionChapitre).toBe('creation')
  })

  it('un chapitre ramené de la corbeille est une restauration', () => {
    expect(de('Ménage')?.actionChapitre).toBe('restauration')
  })

  it('un chapitre renommé ou redécrit reste une modification', () => {
    expect(de('Accueil')?.actionChapitre).toBe('modification')
  })
})
