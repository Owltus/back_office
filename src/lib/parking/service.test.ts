import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Écritures du planning parking contre un client Supabase SIMULÉ (la base
 * n'est jamais touchée). Comme PostgREST, le simulateur ne rend les lignes
 * touchées QUE si la requête les demande (`.select`) : un refus RLS se lit
 * alors 0 ligne, sans erreur.
 */

const sim = vi.hoisted(() => ({
  lignes: 0,
  appels: [] as string[],
  /** Relecture après une suppression à 0 ligne : la ligne existe-t-elle encore ? */
  presente: true,
  relectureErreur: null as { message: string } | null,
}))

vi.mock('#/lib/supabase.ts', () => {
  const from = () => {
    let select: string | null = null
    let unique = false
    const q = {
      maybeSingle() {
        unique = true
        return q
      },
      update: () => q,
      delete: () => q,
      eq: () => q,
      select(cols: string) {
        select = cols
        sim.appels.push(cols)
        return q
      },
      then(resolve: (r: { data: unknown; error: unknown }) => void) {
        if (unique) {
          resolve({
            data: sim.presente ? { id: 'x' } : null,
            error: sim.relectureErreur,
          })
          return
        }
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
  sim.presente = true
  sim.relectureErreur = null
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

  it('0 ligne et ligne encore là (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    sim.presente = true
    await expect(deleteReservation('r1')).rejects.toThrow(
      /Rien n'a été supprimé/,
    )
  })

  it('0 ligne et ligne absente (déjà supprimée ailleurs) : succès', async () => {
    sim.lignes = 0
    sim.presente = false
    await expect(deleteReservation('r1')).resolves.toBeUndefined()
  })

  it('0 ligne et relecture en échec : erreur (le board restaure)', async () => {
    sim.lignes = 0
    sim.relectureErreur = { message: 'réseau' }
    await expect(deleteReservation('r1')).rejects.toEqual({ message: 'réseau' })
  })
})
