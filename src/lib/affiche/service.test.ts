import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Écritures des modèles d'affiche contre un client SIMULÉ (la base n'est
 * jamais touchée). Comme PostgREST, le simulateur ne rend les lignes touchées
 * d'une écriture QUE si la requête les demande (`.select`) : un refus RLS se
 * lit alors 0 ligne, sans erreur. C'est ce qui faisait afficher « Enregistré »
 * pour une écriture refusée.
 */

const sim = vi.hoisted(() => ({ lignes: 1, selects: [] as string[] }))

vi.mock('#/lib/supabase.ts', () => {
  const from = () => {
    let select: string | null = null
    const q = {
      update: () => q,
      delete: () => q,
      eq: () => q,
      select(cols: string) {
        select = cols
        sim.selects.push(cols)
        return q
      },
      then(resolve: (r: { data: unknown; error: null }) => void) {
        const data =
          select === null
            ? null
            : Array.from({ length: sim.lignes }, (_, i) => ({ id: `t${i}` }))
        resolve({ data, error: null })
      },
    }
    return q
  }
  return { supabase: { from } }
})

const { AfficheNonModifiee, deleteTemplate, updateTemplate } =
  await import('#/lib/affiche/service.ts')

beforeEach(() => {
  sim.lignes = 1
  sim.selects = []
})

describe('updateTemplate', () => {
  it('une ligne modifiée : succès, et les lignes touchées sont demandées', async () => {
    await expect(updateTemplate('t1', { name: 'x' })).resolves.toBeUndefined()
    expect(sim.selects).toEqual(['id'])
  })

  it('0 ligne (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    await expect(updateTemplate('t1', { name: 'x' })).rejects.toBeInstanceOf(
      AfficheNonModifiee,
    )
  })
})

describe('deleteTemplate', () => {
  it('une ligne supprimée : succès', async () => {
    await expect(deleteTemplate('t1')).resolves.toBeUndefined()
    expect(sim.selects).toEqual(['id'])
  })

  it('0 ligne (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    await expect(deleteTemplate('t1')).rejects.toThrow(/pas été supprimé/)
  })
})
