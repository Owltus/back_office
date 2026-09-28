import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Écritures du planning parking contre un client Supabase SIMULÉ (la base
 * n'est jamais touchée). Comme PostgREST, le simulateur ne rend les lignes
 * touchées QUE si la requête les demande (`.select`) : un refus RLS se lit
 * alors 0 ligne, sans erreur.
 */

const sim = vi.hoisted(() => ({ lignes: 0, appels: [] as string[] }))

vi.mock('#/lib/supabase.ts', () => {
  const from = () => {
    let select: string | null = null
    const q = {
      update: () => q,
      delete: () => q,
      eq: () => q,
      select(cols: string) {
        select = cols
        sim.appels.push(cols)
        return q
      },
      then(resolve: (r: { data: unknown; error: null }) => void) {
        const data =
          select === null
            ? null
            : Array.from({ length: sim.lignes }, (_, i) => ({ id: `r${i}` }))
        resolve({ data, error: null })
      },
    }
    return q
  }
  return { supabase: { from } }
})

const { deleteReservation, updateReservation } =
  await import('#/lib/parking/service.ts')

beforeEach(() => {
  sim.lignes = 1
  sim.appels = []
})

describe('updateReservation', () => {
  it('une ligne modifiée : succès', async () => {
    await expect(
      updateReservation('r1', { nights: 3 }),
    ).resolves.toBeUndefined()
    expect(sim.appels).toEqual(['id'])
  })

  it('0 ligne (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    await expect(updateReservation('r1', { nights: 3 })).rejects.toThrow(
      /Rien n'a été enregistré/,
    )
  })
})

describe('deleteReservation', () => {
  it('une ligne supprimée : succès', async () => {
    await expect(deleteReservation('r1')).resolves.toBeUndefined()
    expect(sim.appels).toEqual(['id'])
  })

  it('0 ligne (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    await expect(deleteReservation('r1')).rejects.toThrow(
      /Rien n'a été supprimé/,
    )
  })
})
