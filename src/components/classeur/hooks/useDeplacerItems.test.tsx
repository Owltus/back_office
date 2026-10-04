// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'

import { classeurKeys } from '#/lib/classeur/keys.ts'

/*
 * Déplacement d'éléments entre chapitres (glisser-déposer) : `moveItems`
 * écrit élément par élément, une panne au milieu laisse les premiers
 * déplacés. Le cache doit être invalidé à l'issue, réussie OU NON — sinon
 * l'affichage reste sur l'état d'avant (relecture adverse du 2026-10-04).
 */

const service = vi.hoisted(() => ({ moveItems: vi.fn() }))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  moveItems: service.moveItems,
}))

const { useDeplacerItems } =
  await import('#/components/classeur/hooks/useClasseur.ts')

function monter(onDeplace = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const invalidation = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useDeplacerItems(onDeplace), {
    wrapper,
  })
  return { result, invalidation, onDeplace }
}

const demande = {
  refs: [
    { kind: 'document' as const, id: 1 },
    { kind: 'document' as const, id: 2 },
  ],
  cible: 7,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useDeplacerItems', () => {
  it('ÉCHEC partiel : le cache du classeur est invalidé, la sélection gardée', async () => {
    service.moveItems.mockRejectedValue(new Error('panne au 2e élément'))
    const { result, invalidation, onDeplace } = monter()
    await act(async () => {
      result.current.mutate(demande)
    })
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(invalidation).toHaveBeenCalledWith({ queryKey: classeurKeys.all })
    expect(onDeplace).not.toHaveBeenCalled()
  })

  it('succès : invalidation et sélection vidée', async () => {
    service.moveItems.mockResolvedValue(undefined)
    const { result, invalidation, onDeplace } = monter()
    await act(async () => {
      result.current.mutate(demande)
    })
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(service.moveItems).toHaveBeenCalledWith(demande.refs, 7)
    expect(invalidation).toHaveBeenCalledWith({ queryKey: classeurKeys.all })
    expect(onDeplace).toHaveBeenCalledTimes(1)
  })
})
