// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

/*
 * La GESTION de la page a tout sur tout classeur, quelles que soient les
 * exceptions d'accès (`niveauEffectif`, miroir de la base). Échouer fermé
 * quand les exceptions sont illisibles (74a5f2b) ne doit donc pas la priver
 * de ses droits : ses exceptions ne changent rien à son niveau.
 */

const etat = vi.hoisted(
  (): { fetchMesAcces: Mock; page: 'gestion' | 'ecriture' } => ({
    fetchMesAcces: vi.fn(),
    page: 'gestion',
  }),
)

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchMesAcces: etat.fetchMesAcces,
}))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'moi' },
    can: (_page: string, niveau: string) =>
      etat.page === 'gestion' || niveau !== 'gestion',
  }),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseur: () => ({
    data: { id: 24, created_by: 'autre', acces_tous: 'aucun' },
    isPending: false,
    isError: false,
  }),
  useClasseurs: () => ({ data: [], isPending: false, isError: false }),
}))

const { useDroitsClasseur } =
  await import('#/components/classeur/hooks/useDroitsClasseur.ts')

function monter() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useDroitsClasseur(24), { wrapper }).result
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  etat.page = 'gestion'
})

describe('useDroitsClasseur — gestion et exceptions illisibles', () => {
  it('gestion, exceptions en ERREUR : gestion entière, aucune erreur', async () => {
    etat.fetchMesAcces.mockRejectedValue(new Error('panne'))
    const result = monter()
    await waitFor(() => {
      expect(etat.fetchMesAcces).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(result.current.niveau).toBe('gestion')
    })
    expect(result.current.canWrite).toBe(true)
    expect(result.current.canManage).toBe(true)
    expect(result.current.pret).toBe(true)
    expect(result.current.isError).toBe(false)
  })

  it('gestion, exceptions en cours de lecture : gestion sans attendre', () => {
    etat.fetchMesAcces.mockReturnValue(new Promise(() => {}))
    const result = monter()
    expect(result.current.niveau).toBe('gestion')
    expect(result.current.canWrite).toBe(true)
  })

  it('écriture (pas gestion), exceptions en ERREUR : toujours fermé', async () => {
    etat.page = 'ecriture'
    etat.fetchMesAcces.mockRejectedValue(new Error('panne'))
    const result = monter()
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.canWrite).toBe(false)
    expect(result.current.niveau).toBe('aucun')
  })
})
