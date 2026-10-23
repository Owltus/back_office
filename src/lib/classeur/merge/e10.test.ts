import { describe, expect, it } from 'vitest'

import {
  chJson,
  chapitre,
  document,
  etat,
  fichier,
  itJson,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type { ActionFusion } from '#/lib/classeur/merge/merge.ts'

/*
 * Relecture adverse du 2026-10-04 (E10) : deux chapitres du fichier
 * appariaient le même chapitre local.
 */

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })
const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
const docA = document({
  id: 1,
  chapter_id: 10,
  title: 'Check-in',
  content: 'a',
  sort_order: 1,
})
const docB = document({
  id: 2,
  chapter_id: 20,
  title: 'Incendie',
  content: 'Évacuer',
  sort_order: 1,
})
describe('E10 — un chapitre local n’est apparié qu’une fois', () => {
  const local = etat([A, B], { documents: [docA, docB] })

  function chapitresTouches(actions: ActionFusion[]): number[] {
    return actions.flatMap((a) =>
      a.type === 'modifierChapitre' || a.type === 'restaurerChapitre'
        ? [a.id]
        : [],
    )
  }

  it.each([false, true])(
    'deux chapitres du fichier au même uuid (replace=%s) : la copie est créée sans uuid',
    (replace) => {
      const f = fichier([
        chJson({ label: 'Accueil', uuid: 'ch-10', sort_order: 1 }),
        chJson({ label: 'Accueil bis', uuid: 'ch-10', sort_order: 3 }),
        chJson({ label: 'Sécurité', uuid: 'ch-20', sort_order: 2 }),
      ])
      const plan = planifierFusion(local, f, { replace })
      const creations = plan.actions.filter((a) => a.type === 'creerChapitre')
      expect(creations).toEqual([
        expect.objectContaining({ uuid: null, label: 'Accueil bis' }),
      ])
      expect(chapitresTouches(plan.actions)).toEqual([])
      expect(plan.resultat.inserted).toBe(1)
    },
  )

  it('même titre sans uuid après un appariement par uuid : la copie est créée', () => {
    const f = fichier([
      chJson({ label: 'Accueil', uuid: 'ch-10', sort_order: 1 }),
      chJson({ label: 'Accueil', description: 'copie', sort_order: 1 }),
      chJson({ label: 'Sécurité', uuid: 'ch-20', sort_order: 2 }),
    ])
    const plan = planifierFusion(local, f, { replace: false })
    expect(plan.actions.filter((a) => a.type === 'creerChapitre')).toEqual([
      expect.objectContaining({ uuid: null, description: 'copie' }),
    ])
    expect(chapitresTouches(plan.actions)).toEqual([])
  })

  it('deux chapitres au même uuid INCONNU : un seul garde l’uuid (unique en base)', () => {
    const f = fichier([
      chJson({ label: 'Neuf', uuid: 'ch-nouveau', sort_order: 1 }),
      chJson({ label: 'Neuf 2', uuid: 'ch-nouveau', sort_order: 2 }),
    ])
    const plan = planifierFusion(local, f, { replace: false })
    const uuids = plan.actions.flatMap((a) =>
      a.type === 'creerChapitre' ? [a.uuid] : [],
    )
    expect(uuids).toEqual(['ch-nouveau', null])
  })

  it('deux éléments au même uuid INCONNU : un seul garde l’uuid (unique en base)', () => {
    const f = fichier([
      chJson({
        label: 'Accueil',
        uuid: 'ch-10',
        items: [
          itJson({ kind: 'document', uuid: 'doc-x', title: 'Un' }),
          itJson({ kind: 'document', uuid: 'doc-x', title: 'Deux' }),
        ],
      }),
    ])
    const plan = planifierFusion(local, f, { replace: false })
    const uuids = plan.actions.flatMap((a) =>
      a.type === 'creerItem' ? [a.uuid] : [],
    )
    expect(uuids).toEqual(['doc-x', null])
  })
})
