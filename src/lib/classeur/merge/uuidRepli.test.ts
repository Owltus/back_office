import { describe, expect, it } from 'vitest'

import {
  avertissementsExecution,
  estDoublonUuid,
  executerPlan,
} from '#/lib/classeur/merge/apply.ts'
import type { Ecrivain, SuiviExecution } from '#/lib/classeur/merge/apply.ts'
import type { ActionFusion } from '#/lib/classeur/merge/merge.ts'

/*
 * Création dont l'uuid est déjà pris AILLEURS (décision du 2026-10-04) :
 * réessayée UNE fois sans uuid, sur la seule contrainte d'unicité de l'uuid.
 */

const DOUBLON_UUID = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "classeur_documents_uuid_key"',
  details: 'Key (uuid)=(u-1) already exists.',
  hint: null,
}
const AUTRE_CONTRAINTE = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "autre_key"',
  details: 'Key (chemin)=(x) already exists.',
  hint: null,
}

type Appel = { quoi: string; options: unknown }

/** Écrivain qui refuse les `uuid` de `pris` avec `erreur`. */
function ecrivain(
  pris: Set<string>,
  erreur: unknown = DOUBLON_UUID,
): { e: Ecrivain; appels: Appel[] } {
  const appels: Appel[] = []
  let id = 100
  const creer = (quoi: string, options?: { uuid?: string }) => {
    appels.push({ quoi, options })
    if (options?.uuid !== undefined && pris.has(options.uuid))
      return Promise.reject(erreur)
    id += 1
    return Promise.resolve(id)
  }
  const rien = () => Promise.resolve()
  return {
    appels,
    e: {
      createChapter: (_c, input, options) =>
        creer(`ch:${input.label}`, options),
      createItem: (chapterId, item, options) =>
        creer(`it:${String(chapterId)}:${item.input.title}`, options),
      updateChapter: rien,
      restaurerChapter: rien,
      softDeleteChapter: rien,
      updateItem: rien,
      restaurerItem: rien,
      softDeleteItem: rien,
    },
  }
}

const doc = (title: string) =>
  ({
    kind: 'document',
    input: { title, description: '', content: '' },
  }) as const

const PLAN: ActionFusion[] = [
  {
    type: 'creerChapitre',
    index: 0,
    uuid: 'u-ch',
    label: 'Réception',
    icon: '',
    description: '',
    sort_order: 3,
  },
  {
    type: 'creerItem',
    chapitre: { type: 'nouveau', index: 0 },
    uuid: 'u-1',
    sort_order: 1,
    item: doc('Procédure'),
  },
  {
    type: 'creerItem',
    chapitre: { type: 'nouveau', index: 0 },
    uuid: 'u-2',
    sort_order: 2,
    item: doc('Libre'),
  },
]

describe('executerPlan — repli sans uuid sur doublon d’uuid', () => {
  it('chapitre et élément pris ailleurs : réessayés sans uuid, l’élément vise le chapitre RECRÉÉ', async () => {
    const { e, appels } = ecrivain(new Set(['u-ch', 'u-1']))
    const suivi: SuiviExecution = { renumerotes: 0 }
    const ids = await executerPlan(5, PLAN, e, suivi)
    expect(ids).toEqual([101])
    expect(appels).toEqual([
      { quoi: 'ch:Réception', options: { sort_order: 3, uuid: 'u-ch' } },
      { quoi: 'ch:Réception', options: { sort_order: 3 } },
      { quoi: 'it:101:Procédure', options: { sort_order: 1, uuid: 'u-1' } },
      { quoi: 'it:101:Procédure', options: { sort_order: 1 } },
      { quoi: 'it:101:Libre', options: { sort_order: 2, uuid: 'u-2' } },
    ])
    expect(suivi.renumerotes).toBe(2)
    expect(avertissementsExecution(suivi)).toEqual([
      '2 éléments ont reçu un nouvel identifiant : ils existaient ailleurs.',
    ])
  })

  it('rien de pris : aucun second appel, aucun avertissement', async () => {
    const { e, appels } = ecrivain(new Set())
    const suivi: SuiviExecution = { renumerotes: 0 }
    await executerPlan(5, PLAN, e, suivi)
    expect(appels).toHaveLength(3)
    expect(avertissementsExecution(suivi)).toEqual([])
  })

  it('une AUTRE contrainte d’unicité n’est jamais réessayée', async () => {
    const { e, appels } = ecrivain(new Set(['u-ch']), AUTRE_CONTRAINTE)
    await expect(executerPlan(5, PLAN, e)).rejects.toBe(AUTRE_CONTRAINTE)
    expect(appels).toHaveLength(1)
  })

  it('un refus de droits (42501) n’est jamais réessayé', async () => {
    const refus = { code: '42501', message: 'rls', details: null, hint: null }
    const { e, appels } = ecrivain(new Set(['u-ch']), refus)
    await expect(executerPlan(5, PLAN, e)).rejects.toBe(refus)
    expect(appels).toHaveLength(1)
  })

  it('le second essai échoue aussi : l’erreur remonte, un seul réessai', async () => {
    const appels: unknown[] = []
    const e = ecrivain(new Set()).e
    e.createChapter = (_c, _i, options) => {
      appels.push(options)
      return Promise.reject(DOUBLON_UUID)
    }
    await expect(executerPlan(5, PLAN, e)).rejects.toBe(DOUBLON_UUID)
    expect(appels).toHaveLength(2)
  })

  it('une création SANS uuid refusée en 23505 n’est pas réessayée', async () => {
    const appels: unknown[] = []
    const e = ecrivain(new Set()).e
    e.createChapter = (_c, _i, options) => {
      appels.push(options)
      return Promise.reject({ code: '23505', message: '', details: null })
    }
    await expect(
      executerPlan(5, [{ ...PLAN[0], uuid: null } as ActionFusion], e),
    ).rejects.toMatchObject({ code: '23505' })
    expect(appels).toHaveLength(1)
  })
})

describe('estDoublonUuid', () => {
  it.each([
    [DOUBLON_UUID, true],
    [{ code: '23505', message: 'x "t_uuid_key"' }, true],
    [{ code: '23505', details: 'Key (uuid)=(a) already exists.' }, true],
    [{ code: '23505' }, true],
    [{ code: '23505', message: '', details: null }, true],
    [AUTRE_CONTRAINTE, false],
    [{ code: '42501', message: 'uuid' }, false],
    [new Error('uuid'), false],
    [null, false],
  ])('%j → %s', (err, attendu) => {
    expect(estDoublonUuid(err)).toBe(attendu)
  })

  it('un seul élément : phrase au singulier', () => {
    expect(avertissementsExecution({ renumerotes: 1 })).toEqual([
      '1 élément a reçu un nouvel identifiant : il existait ailleurs.',
    ])
  })
})
