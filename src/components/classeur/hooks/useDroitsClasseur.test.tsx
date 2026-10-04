// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

import { classeurKeys } from '#/lib/classeur/keys.ts'

/*
 * `useDroitsClasseur` échoue FERMÉ : tant que mes exceptions d'accès n'ont
 * pas été lues avec succès (chargement OU erreur), tout est `false`. Une
 * exception peut RETIRER l'écriture d'un classeur ouvert à tous : la
 * supposer absente parce que sa lecture a échoué donnerait l'écriture à
 * tort (relecture adverse du 2026-10-04).
 */

const service = vi.hoisted(() => ({ fetchMesAcces: vi.fn() }))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchMesAcces: service.fetchMesAcces,
}))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'moi' },
    // Écriture sur la page, pas gestion.
    can: (_page: string, niveau: string) => niveau !== 'gestion',
  }),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseur: () => ({
    data: { id: 24, created_by: 'autre', acces_tous: 'ecriture' },
    isPending: false,
    isError: false,
  }),
  useClasseurs: () => ({ data: [], isPending: false, isError: false }),
}))

const { useDroitsClasseur } =
  await import('#/components/classeur/hooks/useDroitsClasseur.ts')

function monter(client = nouveauClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useDroitsClasseur(24), { wrapper }).result
}

function nouveauClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useDroitsClasseur — exceptions illisibles', () => {
  it('lecture des exceptions en ERREUR : aucune écriture, erreur exposée', async () => {
    service.fetchMesAcces.mockRejectedValue(new Error('panne'))
    const result = monter()
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.canWrite).toBe(false)
    expect(result.current.niveau).toBe('aucun')
    expect(result.current.pret).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('exceptions lues, aucune pour ce classeur : écriture (ouvert à tous)', async () => {
    service.fetchMesAcces.mockResolvedValue([])
    const result = monter()
    await waitFor(() => {
      expect(result.current.pret).toBe(true)
    })
    expect(result.current.canWrite).toBe(true)
    expect(result.current.isError).toBe(false)
  })

  it('exception « lecture » lue : écriture retirée', async () => {
    service.fetchMesAcces.mockResolvedValue([
      { classeur_id: 24, niveau: 'lecture' },
    ])
    const result = monter()
    await waitFor(() => {
      expect(result.current.pret).toBe(true)
    })
    expect(result.current.canWrite).toBe(false)
  })

  it('rafraîchissement raté après une lecture réussie : la dernière liste sert', async () => {
    const client = nouveauClient()
    service.fetchMesAcces.mockResolvedValue([
      { classeur_id: 24, niveau: 'lecture' },
    ])
    const result = monter(client)
    await waitFor(() => {
      expect(result.current.pret).toBe(true)
    })
    service.fetchMesAcces.mockRejectedValue(new Error('panne'))
    await client
      .refetchQueries({ queryKey: classeurKeys.mesAcces('moi') })
      .catch(() => {})
    await waitFor(() => {
      expect(client.getQueryState(classeurKeys.mesAcces('moi'))?.status).toBe(
        'error',
      )
    })
    expect(result.current.pret).toBe(true)
    expect(result.current.canWrite).toBe(false)
    expect(result.current.isError).toBe(false)
  })
})
