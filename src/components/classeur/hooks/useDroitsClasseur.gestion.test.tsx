// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

/*
 * La GESTION de la page gère les publics et les classeurs de gestion, mais
 * ne voit PAS le privé d'un autre (2026-11-16). L'admin a tout, partout
 * (`useMoiClasseur` lit `role === 'admin'`).
 */

const etat = vi.hoisted(
  (): {
    role: 'admin' | 'utilisateur'
    classeur: {
      id: number
      created_by: string | null
      visibilite: 'public' | 'prive' | 'gestion'
    }
  } => ({
    role: 'utilisateur',
    classeur: { id: 24, created_by: 'autre', visibilite: 'prive' },
  }),
)

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchPersonnesClasseur: vi.fn(),
}))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'moi' },
    role: etat.role,
    // Gestion de la page (l'admin l'a aussi).
    can: () => true,
  }),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseur: () => ({
    data: etat.classeur,
    isPending: false,
    isError: false,
  }),
  useClasseurs: () => ({ data: [], isPending: false, isError: false }),
}))

const { useDroitsClasseur, useDroitsPageClasseur, useMoiClasseur } =
  await import('#/components/classeur/hooks/useDroitsClasseur.ts')

function monter<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(hook, { wrapper }).result
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  etat.role = 'utilisateur'
  etat.classeur = { id: 24, created_by: 'autre', visibilite: 'prive' }
})

describe('useDroitsClasseur — gestion et admin', () => {
  it('gestion : le privé d’un autre reste invisible', () => {
    const result = monter(() => useDroitsClasseur(24))
    expect(result.current.niveau).toBe('aucun')
    expect(result.current.lire).toBe(false)
    expect(result.current.canWrite).toBe(false)
    expect(result.current.canManage).toBe(false)
    expect(result.current.canRanger).toBe(false)
  })

  it('admin : le privé d’un autre, en gestion entière', () => {
    etat.role = 'admin'
    const result = monter(() => useDroitsClasseur(24))
    expect(result.current.niveau).toBe('gestion')
    expect(result.current.canWrite).toBe(true)
    expect(result.current.canManage).toBe(true)
    expect(result.current.canRanger).toBe(true)
  })

  it('gestion : un public d’un autre, géré et rangeable', () => {
    etat.classeur = { id: 24, created_by: 'autre', visibilite: 'public' }
    const result = monter(() => useDroitsClasseur(24))
    expect(result.current.niveau).toBe('gestion')
    expect(result.current.canManage).toBe(true)
    expect(result.current.canRanger).toBe(true)
  })

  it('gestion : un classeur de gestion', () => {
    etat.classeur = { id: 24, created_by: 'autre', visibilite: 'gestion' }
    const result = monter(() => useDroitsClasseur(24))
    expect(result.current.niveau).toBe('gestion')
  })

  it('useMoiClasseur et useDroitsPageClasseur : admin lu sur le rôle', () => {
    const gestion = monter(() => useMoiClasseur())
    expect(gestion.current).toEqual({
      page: 'gestion',
      userId: 'moi',
      admin: false,
    })
    etat.role = 'admin'
    const admin = monter(() => useDroitsPageClasseur())
    expect(admin.current.moi.admin).toBe(true)
    expect(admin.current.typesCreables).toEqual(['public', 'prive', 'gestion'])
    expect(admin.current.canReorderList).toBe(true)
  })
})
