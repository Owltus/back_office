import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Écritures de la gestion des données : un `update` refusé par la RLS répond
 * SANS erreur et 0 ligne. Il ne doit jamais passer pour un succès.
 */

const reponse: { data: unknown[] | null; error: Error | null } = {
  data: [],
  error: null,
}
const appels: { table: string; select?: string }[] = []

vi.mock('#/lib/supabase.ts', () => ({
  supabase: {
    from(table: string) {
      const appel: { table: string; select?: string } = { table }
      appels.push(appel)
      return {
        update: () => ({
          eq: () => ({
            select(cols: string) {
              appel.select = cols
              return Promise.resolve(reponse)
            },
          }),
        }),
      }
    },
  },
}))

const { updateReport, updateForecast } =
  await import('#/lib/repjour/services/data.ts')

const prevision = { occ: 1, rev_ht: 1, rev_ttc: 1, adr_ttc: 1, occ_percent: 1 }

beforeEach(() => {
  appels.length = 0
  reponse.data = []
  reponse.error = null
})

describe('updateReport / updateForecast', () => {
  it('0 ligne (refus RLS silencieux) : erreur, jamais un succès', async () => {
    await expect(updateReport(1, { rj_nuitees: 3 })).rejects.toThrow(
      /Rien n'a été enregistré/,
    )
    await expect(updateForecast(1, prevision)).rejects.toThrow(
      /Rien n'a été enregistré/,
    )
  })

  it('1 ligne écrite : succès, et la ligne est bien relue', async () => {
    reponse.data = [{ id: 1 }]
    await expect(updateReport(1, { rj_nuitees: 3 })).resolves.toBeUndefined()
    await expect(updateForecast(1, prevision)).resolves.toBeUndefined()
    expect(appels).toEqual([
      { table: 'daily_reports', select: 'id' },
      { table: 'forecast_days', select: 'id' },
    ])
  })

  it('une erreur de la base remonte telle quelle', async () => {
    reponse.error = new Error('boum')
    await expect(updateReport(1, {})).rejects.toThrow('boum')
  })
})
