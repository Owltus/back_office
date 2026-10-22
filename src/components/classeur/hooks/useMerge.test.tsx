// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'

/*
 * Double clic sur Importer (trouvé au navigateur le 2026-10-22) : le fichier
 * était appliqué DEUX fois, deux points de restauration et chaque feuille
 * ajoutée en double. Deux `mutate` lancés dans le même rendu ne doivent
 * écrire qu'une fois ; une fois la première réglée, un nouvel import part.
 */

const appliquerImport = vi.fn()
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({}))
vi.mock('#/lib/classeur/merge/apply.ts', () => ({
  appliquerImport: (...args: unknown[]) => appliquerImport(...args),
  importerCommeNouveauClasseur: vi.fn(),
}))
vi.mock('#/lib/classeur/merge/history.ts', () => ({
  restaurerInstantane: vi.fn(),
  supprimerEntreeHistorique: vi.fn(),
}))
vi.mock('#/lib/classeur/restauration.ts', () => ({ creerPoint: vi.fn() }))

const { useAppliquerImport } =
  await import('#/components/classeur/hooks/useMerge.ts')

afterEach(() => {
  cleanup()
  appliquerImport.mockReset()
})

function monter() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useAppliquerImport(), { wrapper })
}

const ARGS = {
  classeurId: 34,
  fichier: { format_version: 2, classeur: {}, chapters: [] },
  contexte: { type: 'classeur' },
  sourceName: 'Réponse collée',
  exclus: new Set<string>(),
} as never

describe('useAppliquerImport', () => {
  it('un double clic n’importe qu’une fois', async () => {
    let finir: (v: unknown) => void = () => {}
    appliquerImport.mockImplementation(() => new Promise((r) => (finir = r)))
    const { result } = monter()
    const succes = vi.fn()
    act(() => {
      // Même rendu : `isPending` est encore faux pour le second clic.
      result.current.mutate(ARGS, { onSuccess: succes })
      result.current.mutate(ARGS, { onSuccess: succes })
    })
    await waitFor(() => expect(appliquerImport).toHaveBeenCalled())
    await act(async () => finir({ inserted: 1 }))
    await waitFor(() => expect(succes).toHaveBeenCalledTimes(1))
    expect(appliquerImport).toHaveBeenCalledTimes(1)
  })

  it('un nouvel import part une fois le premier réglé, même en échec', async () => {
    appliquerImport.mockRejectedValueOnce(new Error('panne'))
    appliquerImport.mockResolvedValueOnce({ inserted: 1 })
    const { result } = monter()
    act(() => result.current.mutate(ARGS))
    await waitFor(() => expect(result.current.isError).toBe(true))
    act(() => result.current.mutate(ARGS))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appliquerImport).toHaveBeenCalledTimes(2)
  })
})
