import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Bascule de la literie contre un client Supabase SIMULÉ (la base n'est
 * jamais touchée). Comme PostgREST, le simulateur ne rend les lignes touchées
 * QUE si la requête les demande (`.select`) : un refus RLS se lit alors
 * 0 ligne, sans erreur.
 */

const sim = vi.hoisted(() => ({ lignes: 0 }))

vi.mock('#/lib/supabase.ts', () => {
  const from = () => {
    let select = false
    const q = {
      update: () => q,
      eq: () => q,
      select() {
        select = true
        return q
      },
      then(resolve: (r: { data: unknown; error: null }) => void) {
        const data = select
          ? Array.from({ length: sim.lignes }, () => ({ room: 101 }))
          : null
        resolve({ data, error: null })
      },
    }
    return q
  }
  return { supabase: { from } }
})

const { toggleBedding } = await import('#/lib/literie/service.ts')

beforeEach(() => {
  sim.lignes = 1
})

describe('toggleBedding', () => {
  it('une ligne modifiée : succès', async () => {
    await expect(toggleBedding(101, true)).resolves.toBeUndefined()
  })

  it('0 ligne (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    await expect(toggleBedding(101, true)).rejects.toThrow(/droit insuffisant/)
  })
})
