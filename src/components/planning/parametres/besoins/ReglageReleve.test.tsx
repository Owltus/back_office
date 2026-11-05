// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

/*
 * Passation entre les équipes (relecture du 2026-11-05) : la case
 * « Aucun trou entre deux équipes » n'envoie qu'elle-même. Elle renvoyait
 * aussi la relève lue par la page, qui pouvait écraser une relève changée
 * entre-temps.
 */

const service = vi.hoisted(() => ({ enregistrerReglages: vi.fn() }))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/planning/service.ts', () => service)
vi.mock('#/components/planning/hooks/usePlanning.ts', () => ({
  useEcriture: () => async (action: () => Promise<unknown>) => {
    await action()
    return { ok: true }
  },
}))

const { ReglageReleve } =
  await import('#/components/planning/parametres/besoins/ReglageReleve.tsx')
const { monter } =
  await import('#/components/planning/parametres/reglages/test/monter.tsx')

afterEach(cleanup)

describe('ReglageReleve', () => {
  it('la case de continuité n’envoie que la continuité', async () => {
    service.enregistrerReglages.mockReset().mockResolvedValue(undefined)
    monter(<ReglageReleve minutes={45} continuite modifiable />)
    fireEvent.click(
      screen.getByRole('switch', { name: 'Aucun trou entre deux équipes' }),
    )
    await waitFor(() =>
      expect(service.enregistrerReglages).toHaveBeenCalledTimes(1),
    )
    expect(service.enregistrerReglages.mock.calls[0][0]).toEqual({
      continuite_obligatoire: false,
    })
  })
})
