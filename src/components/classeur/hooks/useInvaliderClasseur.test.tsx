// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'

import { classeurKeys } from '#/lib/classeur/keys.ts'

/*
 * Audit du 2026-10-04 (base Nano) : chaque écriture du Classeur invalide
 * `classeurKeys.all` — déplacement, transfert, restauration depuis la
 * corbeille, import. Les images des documents (Blob du bucket privé) sont
 * IMMUABLES (UUID dans le chemin) et lues en `staleTime: Infinity`, mais une
 * invalidation par préfixe relance quand même toute requête ACTIVE : sur la
 * page d'un chapitre, chaque image des miniatures repartait au stockage
 * (lecture + contrôle RLS en base) après chaque écriture. Elles sont exclues ;
 * tout le reste du classeur est toujours relu.
 */

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/lib/classeur/service.ts', () => ({}))

const { useInvaliderClasseur } =
  await import('#/components/classeur/hooks/useClasseur.ts')

afterEach(() => cleanup())

describe('useInvaliderClasseur', () => {
  it('relit le classeur, jamais une image déjà téléchargée', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const lireImage = vi.fn(async () => ({ octets: 3 }))
    const lireChapitres = vi.fn(async () => [{ id: 1 }])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => {
        const image = useQuery({
          queryKey: classeurKeys.image('24/a.webp'),
          queryFn: lireImage,
          staleTime: Infinity,
        })
        const chapitres = useQuery({
          queryKey: classeurKeys.chapters(24),
          queryFn: lireChapitres,
          staleTime: 60_000,
        })
        return { image, chapitres, invalider: useInvaliderClasseur() }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.image.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.chapitres.isSuccess).toBe(true))
    expect(lireImage).toHaveBeenCalledTimes(1)
    expect(lireChapitres).toHaveBeenCalledTimes(1)

    await act(() => result.current.invalider())

    expect(lireChapitres).toHaveBeenCalledTimes(2)
    expect(lireImage).toHaveBeenCalledTimes(1)
  })
})
