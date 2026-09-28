import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setRoom, setStatus } from '#/lib/rapro/service.ts'

// Client simulé : on capte le payload de chaque upsert.
const upsert = vi.fn()
const del = vi.fn()
vi.mock('#/lib/supabase.ts', () => ({
  supabase: {
    from: () => ({
      upsert: (row: unknown, opts: unknown) => {
        upsert(row, opts)
        return Promise.resolve({ error: null })
      },
      delete: () => {
        del()
        const chain = {
          eq: () => chain,
          then: (ok: (v: { error: null }) => unknown) => ok({ error: null }),
        }
        return chain
      },
    }),
  },
}))

/*
 * Une action MANUELLE ne doit jamais laisser une ligne marquée
 * « matérialisée » : la réouverture suivante la purgerait et effacerait la
 * correction posée à la main.
 */
describe('écritures manuelles : materialized remis à false', () => {
  beforeEach(() => {
    upsert.mockClear()
    del.mockClear()
  })

  it('setStatus pose materialized: false', async () => {
    await setStatus('2026-09-28', 101, 'refus')
    expect(upsert).toHaveBeenCalledOnce()
    expect(upsert.mock.calls[0][0]).toMatchObject({
      report_date: '2026-09-28',
      room: 101,
      status: 'refus',
      materialized: false,
    })
  })

  it('setRoom pose materialized: false (couleur ou liseré seul)', async () => {
    await setRoom('2026-09-28', 102, 'non_nettoyee', false)
    await setRoom('2026-09-28', 103, null, true)
    expect(upsert).toHaveBeenCalledTimes(2)
    for (const [row] of upsert.mock.calls)
      expect(row).toMatchObject({ materialized: false })
  })

  it('setRoom sans couleur ni liseré efface la ligne', async () => {
    await setRoom('2026-09-28', 104, null, false)
    expect(del).toHaveBeenCalledOnce()
    expect(upsert).not.toHaveBeenCalled()
  })
})
