import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Accès Supabase des lits bébé contre un client SIMULÉ (la base n'est jamais
 * touchée). Comme PostgREST, le simulateur ne rend les lignes touchées d'une
 * écriture QUE si la requête les demande (`.select`) : un refus RLS se lit
 * alors 0 ligne, sans erreur.
 */

const sim = vi.hoisted(() => ({
  lignes: 0,
  selects: [] as string[],
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
      lte: () => q,
      gte: () => q,
      order: () => q,
      range: () => q,
      select(cols: string) {
        select = cols
        sim.selects.push(cols)
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
            : Array.from({ length: sim.lignes }, (_, i) => ({ id: `a${i}` }))
        resolve({ data, error: null })
      },
    }
    return q
  }
  return { supabase: { from } }
})

const { deleteAssignment, fetchAssignments, updateAssignment } =
  await import('#/lib/baby-cots/service.ts')

beforeEach(() => {
  sim.lignes = 1
  sim.selects = []
  sim.presente = true
  sim.relectureErreur = null
})

describe('updateAssignment', () => {
  it('une ligne modifiée : succès', async () => {
    await expect(
      updateAssignment('a1', { label: 'x' }),
    ).resolves.toBeUndefined()
  })

  it('0 ligne (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    await expect(updateAssignment('a1', { label: 'x' })).rejects.toThrow(
      /Rien n'a été enregistré/,
    )
  })
})

describe('deleteAssignment', () => {
  it('une ligne supprimée : succès', async () => {
    await expect(deleteAssignment('a1')).resolves.toBeUndefined()
  })

  it('0 ligne et ligne encore là (refus RLS silencieux) : erreur', async () => {
    sim.lignes = 0
    sim.presente = true
    await expect(deleteAssignment('a1')).rejects.toThrow(
      /Rien n'a été supprimé/,
    )
  })

  it('0 ligne et ligne absente (déjà supprimée ailleurs) : succès', async () => {
    sim.lignes = 0
    sim.presente = false
    await expect(deleteAssignment('a1')).resolves.toBeUndefined()
  })

  it('0 ligne et relecture en échec : erreur (le board restaure)', async () => {
    sim.lignes = 0
    sim.relectureErreur = { message: 'réseau' }
    await expect(deleteAssignment('a1')).rejects.toEqual({ message: 'réseau' })
  })
})

describe('fetchAssignments', () => {
  it('lit des colonnes explicites, sans l’auteur', async () => {
    await fetchAssignments('2026-09-01', '2026-09-30')
    const cols = sim.selects[0].split(',').map((c) => c.trim())
    expect(cols).toEqual([
      'id',
      'cot_id',
      'label',
      'start_date',
      'end_date',
      'comment',
    ])
  })
})
