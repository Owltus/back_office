import { describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'

/*
 * Écriture des données à ranger (étape 11) contre le SIMULATEUR PostgREST :
 * aucune base touchée. Un update refusé par la RLS y rend 0 ligne sans
 * erreur, comme la vraie base.
 */

const etat = vi.hoisted(() => ({
  sim: null as unknown as SimulateurSupabase,
  /** Faux client à part (pagination : le simulateur n'a pas `range`). */
  client: null as unknown,
}))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.client ?? etat.sim.client
  },
}))

const { fetchShiftsDepuis, rangerShifts } =
  await import('#/lib/planning/serviceRangement.ts')

function ligne(id: number, p: Record<string, unknown> = {}) {
  return {
    id,
    lundi: '2026-09-14',
    salarie_id: 1,
    poste_id: 10,
    jour: 0,
    horaire_id: null,
    debut: '07:00',
    fin: '15:00',
    pause: 30,
    epinglee: false,
    ...p,
  }
}

const RATTACHER = {
  type: 'code',
  horaireId: 1,
  debut: '07:00',
  fin: '15:00',
  pause: 30,
} as const

const etatTable = () => JSON.stringify(etat.sim.table('planning_affectations'))

describe('rangerShifts', () => {
  it('rattache les shifts, et rejouée ne change plus rien', async () => {
    etat.sim = new SimulateurSupabase({
      planning_affectations: [ligne(1), ligne(2, { jour: 1 }), ligne(3)],
    })
    expect(await rangerShifts([1, 2], RATTACHER)).toBe(2)
    const apres = etatTable()
    const t = etat.sim.table('planning_affectations')
    expect(t.map((l) => l.horaire_id)).toEqual([1, 1, null])
    // Rejouée : même état, aucune erreur.
    expect(await rangerShifts([1, 2], RATTACHER)).toBe(0)
    expect(etatTable()).toBe(apres)
  })

  it('laisse un shift retouché entre-temps', async () => {
    etat.sim = new SimulateurSupabase({
      planning_affectations: [ligne(1), ligne(2, { debut: '06:00' })],
    })
    expect(await rangerShifts([1, 2], RATTACHER)).toBe(1)
    expect(
      etat.sim.table('planning_affectations').map((l) => l.horaire_id),
    ).toEqual([1, null])
  })

  it('change le poste, seulement sur l’ancien poste et ce code', async () => {
    etat.sim = new SimulateurSupabase({
      planning_affectations: [
        ligne(1, { horaire_id: 5 }),
        ligne(2, { horaire_id: 2 }),
      ],
    })
    const c = {
      type: 'poste',
      posteId: 20,
      ancienPosteId: 10,
      horaireId: 5,
    } as const
    expect(await rangerShifts([1, 2], c)).toBe(1)
    expect(
      etat.sim.table('planning_affectations').map((l) => l.poste_id),
    ).toEqual([20, 10])
    expect(await rangerShifts([1], c)).toBe(0)
  })

  it('un refus de la RLS (0 ligne) est une erreur 42501', async () => {
    etat.sim = new SimulateurSupabase({ planning_affectations: [ligne(1)] })
    etat.sim.refuser('planning_affectations', 'update')
    await expect(rangerShifts([1], RATTACHER)).rejects.toMatchObject({
      code: '42501',
    })
    expect(etat.sim.table('planning_affectations')[0].horaire_id).toBeNull()
  })

  it('UNE requête d’écriture pour tout le groupe', async () => {
    etat.sim = new SimulateurSupabase({
      planning_affectations: [ligne(1), ligne(2), ligne(3)],
    })
    await rangerShifts([1, 2, 3], RATTACHER)
    expect(
      etat.sim.journal.filter((j) => j.operation === 'update'),
    ).toHaveLength(1)
  })
})

describe('fetchShiftsDepuis', () => {
  it('lit toutes les pages (plafond de 1 000), triées par id, depuis le lundi', async () => {
    const lignes = Array.from({ length: 2300 }, (_, i) =>
      ligne(i + 1, { lundi: i < 100 ? '2026-01-05' : '2026-09-14' }),
    )
    const appels: Array<{
      depuis: string
      tri: string
      de: number
      a: number
    }> = []
    etat.client = {
      from: () => ({
        select: () => ({
          gte: (_c: string, depuis: string) => ({
            order: (tri: string) => ({
              range: async (de: number, a: number) => {
                appels.push({ depuis, tri, de, a })
                const vues = lignes.filter((l) => l.lundi >= depuis)
                // PostgREST plafonne à 1 000 lignes quoi qu'on demande.
                return {
                  data: vues.slice(de, Math.min(a + 1, de + 1000)),
                  error: null,
                }
              },
            }),
          }),
        }),
      }),
    }
    try {
      const lus = await fetchShiftsDepuis('2026-04-27')
      expect(lus).toHaveLength(2200)
      expect(new Set(lus.map((l) => l.id)).size).toBe(2200)
      expect(appels.map((x) => [x.de, x.a])).toEqual([
        [0, 999],
        [1000, 1999],
        [2000, 2999],
      ])
      expect(
        appels.every((x) => x.tri === 'id' && x.depuis === '2026-04-27'),
      ).toBe(true)
    } finally {
      etat.client = null
    }
  })
})
