import { describe, expect, it } from 'vitest'

import {
  chJson,
  chapitre,
  document,
  etat,
  fichier,
  itJson,
  suivi,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type { ActionFusion } from '#/lib/classeur/merge/merge.ts'
import { planifierFusionPortee } from '#/lib/classeur/merge/portee.ts'

/*
 * Relecture adverse du 2026-10-04, deux défauts :
 *  1. (portée) un élément du fichier portant l'uuid d'un élément d'un AUTRE
 *     chapitre l'appariait, le déplaçait dans le chapitre ouvert et
 *     l'écrasait — « rien hors de la portée n'est touché » était faux ;
 *  2. (E10) deux chapitres du fichier appariaient le même chapitre local.
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
const docBSupprime = document({
  id: 3,
  chapter_id: 20,
  title: 'Ancien',
  content: 'vieux',
  sort_order: 2,
  deleted_at: '2026-02-01T00:00:00+00:00',
})

/** Toute action qui toucherait l'élément local `id` (de n'importe quelle nature). */
function touche(actions: ActionFusion[], id: number): ActionFusion[] {
  return actions.filter(
    (a) =>
      (a.type === 'modifierItem' ||
        a.type === 'restaurerItem' ||
        a.type === 'supprimerItem') &&
      a.id === id,
  )
}

describe('portée CHAPITRE : un uuid d’un autre chapitre ne touche jamais cet élément', () => {
  const local = etat([A, B], { documents: [docA, docB, docBSupprime] })

  it.each([
    ['visible', 'doc-2', 2],
    ['supprimé', 'doc-3', 3],
  ])(
    'élément %s d’un autre chapitre : création sans uuid + avertissement',
    (_quoi, uuid, id) => {
      const f = fichier([
        chJson({
          label: 'Accueil',
          uuid: 'ch-10',
          items: [
            itJson({
              kind: 'document',
              uuid: 'doc-1',
              title: 'Check-in',
              content: 'a',
              sort_order: 1,
            }),
            itJson({
              kind: 'document',
              uuid,
              title: 'Copie',
              content: 'écrasé ?',
              sort_order: 2,
            }),
          ],
        }),
      ])
      for (const supprimerAbsents of [false, true]) {
        const plan = planifierFusionPortee(
          local,
          f,
          { type: 'chapitre', chapitreId: 10 },
          { supprimerAbsents },
        )
        expect(touche(plan.actions, id)).toEqual([])
        const creations = plan.actions.filter((a) => a.type === 'creerItem')
        expect(creations).toHaveLength(1)
        expect(creations[0]).toMatchObject({
          type: 'creerItem',
          uuid: null,
          chapitre: { type: 'local', id: 10 },
          sort_order: 2,
        })
        expect(plan.warnings).toContain(
          "Copie portait l'identifiant d'un élément d'un autre chapitre : créé comme nouvel élément",
        )
        expect(plan.resultat).toMatchObject({ inserted: 1, updated: 0 })
      }
    },
  )

  it('autre nature au même uuid : jamais touché non plus (pas de collision d’uuid)', () => {
    const ts = suivi({ id: 7, chapter_id: 20, title: 'Contrôle' })
    const l = etat([A, B], { documents: [docA], tracking_sheets: [ts] })
    const f = fichier([
      chJson({
        label: 'Accueil',
        uuid: 'ch-10',
        items: [
          itJson({
            kind: 'tracking_sheet',
            uuid: 'ts-7',
            title: 'Contrôle',
            periodicite_id: 44,
            sort_order: 3,
          }),
        ],
      }),
    ])
    const plan = planifierFusionPortee(
      l,
      f,
      { type: 'chapitre', chapitreId: 10 },
      { supprimerAbsents: false },
    )
    expect(touche(plan.actions, 7)).toEqual([])
    expect(plan.actions).toContainEqual(
      expect.objectContaining({ type: 'creerItem', uuid: null }),
    )
  })

  it('un uuid du chapitre ouvert reste apparié normalement (pas d’avertissement)', () => {
    const f = fichier([
      chJson({
        label: 'Accueil',
        uuid: 'ch-10',
        items: [
          itJson({
            kind: 'document',
            uuid: 'doc-1',
            title: 'Check-in',
            content: 'modifié',
            sort_order: 1,
          }),
        ],
      }),
    ])
    const plan = planifierFusionPortee(
      local,
      f,
      { type: 'chapitre', chapitreId: 10 },
      { supprimerAbsents: false },
    )
    expect(plan.actions).toEqual([
      expect.objectContaining({ type: 'modifierItem', id: 1 }),
    ])
    expect(plan.warnings).toEqual([])
  })
})

describe('portée DOCUMENT : seul le document ciblé peut être touché', () => {
  const local = etat([A, B], { documents: [docA, docB] })

  it('un fichier portant l’uuid du document d’un autre chapitre est refusé, rien n’est planifié', () => {
    const f = fichier([
      chJson({
        label: 'Accueil',
        uuid: 'ch-10',
        items: [
          itJson({
            kind: 'document',
            uuid: 'doc-2',
            title: 'Incendie',
            content: 'écrasé ?',
          }),
        ],
      }),
    ])
    expect(() =>
      planifierFusionPortee(
        local,
        f,
        { type: 'document', documentId: 1 },
        { supprimerAbsents: false },
      ),
    ).toThrow(/autre document/)
  })

  it('le bon uuid : seule une modification du document ciblé', () => {
    const f = fichier([
      chJson({
        label: 'Sécurité',
        uuid: 'ch-20',
        items: [
          itJson({
            kind: 'document',
            uuid: 'doc-1',
            title: 'Check-in',
            content: 'neuf',
          }),
        ],
      }),
    ])
    const plan = planifierFusionPortee(
      local,
      f,
      { type: 'document', documentId: 1 },
      { supprimerAbsents: true },
    )
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]).toMatchObject({
      type: 'modifierItem',
      id: 1,
    })
    expect(plan.actions[0]).not.toHaveProperty('chapitre')
  })
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
