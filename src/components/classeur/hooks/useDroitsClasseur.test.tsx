// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

/*
 * `useDroitsClasseur` échoue FERMÉ : tant que le classeur n'est pas chargé,
 * tout est `false`. Une fois chargé, le niveau vient de `niveauEffectif`
 * (type du classeur, auteur, niveau de page) : plus aucune exception par
 * personne à lire (2026-11-16).
 */

const etat = vi.hoisted(
  (): {
    classeur: {
      id: number
      created_by: string | null
      visibilite: 'public' | 'prive' | 'gestion'
    } | null
    isPending: boolean
  } => ({
    classeur: { id: 24, created_by: 'autre', visibilite: 'public' },
    isPending: false,
  }),
)

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchPersonnesClasseur: vi.fn(),
}))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'moi' },
    role: 'utilisateur',
    // Écriture sur la page, pas gestion.
    can: (_page: string, niveau: string) => niveau !== 'gestion',
  }),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useClasseur: () => ({
    data: etat.classeur,
    isPending: etat.isPending,
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
  etat.classeur = { id: 24, created_by: 'autre', visibilite: 'public' }
  etat.isPending = false
})

describe('useDroitsClasseur — compte en écriture', () => {
  it('classeur en cours de lecture : tout fermé', () => {
    etat.isPending = true
    const result = monter()
    expect(result.current.pret).toBe(false)
    expect(result.current.niveau).toBe('aucun')
    expect(result.current.canWrite).toBe(false)
    expect(result.current.canManage).toBe(false)
    expect(result.current.canRanger).toBe(false)
    // La création ne dépend que de la page.
    expect(result.current.canCreate).toBe(true)
  })

  it('public d’un autre : écriture, sans le gérer ni le ranger', () => {
    const result = monter()
    expect(result.current.pret).toBe(true)
    expect(result.current.niveau).toBe('ecriture')
    expect(result.current.canWrite).toBe(true)
    expect(result.current.canManage).toBe(false)
    expect(result.current.canRanger).toBe(false)
    expect(result.current.estCreateur).toBe(false)
  })

  it('mon public : écriture, et je peux le ranger', () => {
    etat.classeur = { id: 24, created_by: 'moi', visibilite: 'public' }
    const result = monter()
    expect(result.current.niveau).toBe('ecriture')
    expect(result.current.canRanger).toBe(true)
    expect(result.current.estCreateur).toBe(true)
  })

  it('mon privé : je le gère', () => {
    etat.classeur = { id: 24, created_by: 'moi', visibilite: 'prive' }
    const result = monter()
    expect(result.current.niveau).toBe('gestion')
    expect(result.current.canWrite).toBe(true)
    expect(result.current.canManage).toBe(true)
    expect(result.current.canRanger).toBe(true)
  })

  it('privé d’un autre : rien', () => {
    etat.classeur = { id: 24, created_by: 'autre', visibilite: 'prive' }
    const result = monter()
    expect(result.current.niveau).toBe('aucun')
    expect(result.current.lire).toBe(false)
    expect(result.current.canWrite).toBe(false)
    expect(result.current.canRanger).toBe(false)
  })

  it('classeur de gestion, même le mien : rien', () => {
    etat.classeur = { id: 24, created_by: 'moi', visibilite: 'gestion' }
    const result = monter()
    expect(result.current.niveau).toBe('aucun')
    expect(result.current.canRanger).toBe(false)
  })

  it('classeur introuvable une fois lu : rien', () => {
    etat.classeur = null
    const result = monter()
    expect(result.current.pret).toBe(true)
    expect(result.current.niveau).toBe('aucun')
    expect(result.current.canRanger).toBe(false)
  })
})
