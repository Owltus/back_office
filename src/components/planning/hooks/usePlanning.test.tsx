// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

import type * as ModSemaine from '#/lib/planning/semaine.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'

/*
 * Horaires fixes posés à l'ouverture d'une semaine, contre un service simulé.
 * Oracles : la pose marque la page occupée (`pendant`), et un refus « le
 * planning a changé » (PL409) est réessayé une fois, après relecture, au lieu
 * de faire échouer la pose pour de bon.
 */

const service = vi.hoisted(() => ({
  fetchEtatSemaine: vi.fn(() => Promise.resolve('etat')),
  fetchReferentiel: vi.fn(() => Promise.resolve({ verrous: [] })),
  fetchSemaine: vi.fn(() =>
    Promise.resolve({ affectations: [], absences: [] }),
  ),
  appliquerGeneration: vi.fn(() => Promise.resolve(1)),
}))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({ useAuth: () => ({}) }))
vi.mock('#/lib/planning/service.ts', () => service)
vi.mock('#/lib/planning/solveur.ts', () => ({
  resoudre: () => Promise.resolve({ statut: 'optimal' }),
}))
vi.mock('#/lib/planning/semaine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ModSemaine>()),
  aPoserFixes: () => new Set([3]),
  analyser: () => ({}),
  preparerGeneration: () => ({
    probleme: {},
    depuis: 0,
    traduire: () => [],
  }),
}))

const { usePoserFixes } =
  await import('#/components/planning/hooks/usePlanning.ts')

function enveloppe({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const donnees = {} as DonneesSemaine

describe('usePoserFixes', () => {
  it('marque la page occupée et réessaie une fois après un PL409', async () => {
    service.appliquerGeneration.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error('le planning a changé'), { code: 'PL409' }),
      ),
    )
    const surMessage = vi.fn()
    let occupations = 0
    const pendant = <T,>(action: () => Promise<T>) => {
      occupations++
      return action()
    }
    renderHook(
      () =>
        usePoserFixes(
          '2026-11-09',
          donnees,
          true,
          '2026-11-04',
          surMessage,
          pendant,
        ),
      { wrapper: enveloppe },
    )
    await waitFor(() =>
      expect(service.appliquerGeneration).toHaveBeenCalledTimes(2),
    )
    expect(occupations).toBe(1)
    // Relu avant le second essai.
    expect(service.fetchEtatSemaine).toHaveBeenCalledTimes(2)
    expect(surMessage).not.toHaveBeenCalled()
  })

  it('un autre refus est signalé, sans second essai', async () => {
    service.appliquerGeneration.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error('refus'), { code: 'PL423' })),
    )
    const surMessage = vi.fn()
    renderHook(
      () =>
        usePoserFixes('2026-11-09', donnees, true, '2026-11-04', surMessage),
      { wrapper: enveloppe },
    )
    await waitFor(() => expect(surMessage).toHaveBeenCalledTimes(1))
    expect(service.appliquerGeneration).toHaveBeenCalledTimes(1)
  })
})
