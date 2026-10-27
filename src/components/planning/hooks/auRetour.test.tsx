// @vitest-environment jsdom
import type { ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'

import {
  ECART_RETOUR_MS,
  useRelireAuRetour,
} from '#/components/planning/hooks/auRetour.ts'

/*
 * Relecture au retour sur l'onglet (prototype `useAuRetour`). Oracles :
 * visibilitychange et focus ensemble = UNE relecture, même avec plusieurs
 * hooks montés ; pas une deuxième avant 2 s ; seules les lectures
 * `planning` sont relues.
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function monter() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const planning = vi.fn(() => Promise.resolve(1))
  const autre = vi.fn(() => Promise.resolve(2))
  const enveloppe = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  renderHook(
    () => {
      // Deux hooks du planning montés : l'écart est tenu pour le client.
      useRelireAuRetour()
      useRelireAuRetour()
      useQuery({ queryKey: ['planning', 'essai'], queryFn: planning })
      useQuery({ queryKey: ['parking', 'essai'], queryFn: autre })
    },
    { wrapper: enveloppe },
  )
  return { planning, autre }
}

const revenir = () =>
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })

describe('useRelireAuRetour', () => {
  it('une relecture par retour, au plus toutes les 2 s, planning seulement', async () => {
    let maintenant = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => maintenant)
    const { planning, autre } = monter()
    await waitFor(() => expect(planning).toHaveBeenCalledTimes(1))
    expect(autre).toHaveBeenCalledTimes(1)

    revenir()
    await waitFor(() => expect(planning).toHaveBeenCalledTimes(2))

    maintenant += ECART_RETOUR_MS - 1
    revenir()
    await new Promise((r) => setTimeout(r, 20))
    expect(planning).toHaveBeenCalledTimes(2)

    maintenant += 2
    revenir()
    await waitFor(() => expect(planning).toHaveBeenCalledTimes(3))
    // Le réglage des autres pages ne change pas.
    expect(autre).toHaveBeenCalledTimes(1)
  })

  it('onglet caché : rien', async () => {
    const { planning } = monter()
    await waitFor(() => expect(planning).toHaveBeenCalledTimes(1))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    revenir()
    await new Promise((r) => setTimeout(r, 20))
    expect(planning).toHaveBeenCalledTimes(1)
  })
})
