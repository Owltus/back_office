import { describe, expect, it, vi } from 'vitest'

import { SimulateurSupabase } from '#/lib/classeur/test/simulateurSupabase.ts'

/*
 * Enregistrements en plusieurs écritures (relecture du 2026-11-06, 9d) :
 * un échec au milieu ne laisse pas l'établissement sans rôle, et le message
 * dit qu'une partie a pu être enregistrée. Contre le simulateur PostgREST.
 */

const etat = vi.hoisted(() => ({
  sim: null as unknown as SimulateurSupabase,
}))

vi.mock('#/lib/supabase.ts', () => ({
  get supabase() {
    return etat.sim.client
  },
}))

const { enregistrerMotif } = await import('#/lib/planning/service.ts')

const motif = (id: number, role: string | null) => ({
  id,
  code: `M${id}`,
  nom: `Motif ${id}`,
  nature: 'absence',
  decompte: true,
  role,
})

describe('9d. enregistrements en plusieurs écritures', () => {
  it('le rôle d’un motif revient à l’ancien si la seconde écriture échoue', async () => {
    etat.sim = new SimulateurSupabase({
      planning_motifs: [motif(1, 'ferie_rattrape'), motif(2, null)],
    })
    etat.sim.panneAuAppel(2)
    const { id: _id, ...valeurs } = motif(2, 'ferie_rattrape')
    await expect(enregistrerMotif(valeurs as never, 2)).rejects.toBeTruthy()
    const roles = etat.sim
      .table('planning_motifs')
      .map((m) => `${m.id}:${m.role}`)
    expect(roles).toEqual(['1:ferie_rattrape', '2:null'])
  })
})
