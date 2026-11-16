// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { ChapterItem, DbClasseur } from '#/lib/classeur/types.ts'

/*
 * Relecture adverse du transfert (étape 7c) : la LISTE des classeurs
 * illisible. Les exceptions d'accès par personne n'existent plus
 * (2026-11-16) : le niveau ne dépend que du type, de l'auteur et de la page.
 * Si la liste échoue, le dialogue ne propose rien et le dit.
 */

const USER = 'u-moi'

const classeur = (
  id: number,
  name: string,
  visibilite: DbClasseur['visibilite'],
): DbClasseur => ({
  id,
  uuid: `c${String(id)}`,
  name,
  icon: 'Book',
  etablissement: '',
  etablissement_complement: '',
  sort_order: id,
  deleted_at: null,
  created_at: '',
  updated_at: '',
  created_by: 'u-autre',
  visibilite,
})

// Gardé pour la forme des données : jamais rendu, la lecture échoue.
void [classeur(5, 'Courant', 'public'), classeur(10, 'Ailleurs', 'public')]
const fetchClasseurs = vi.fn(() => Promise.reject(new Error('Failed to fetch')))

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: USER },
    role: 'utilisateur',
    can: (_page: string, niveau: string) => niveau !== 'gestion',
  }),
}))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchClasseurs: () => fetchClasseurs(),
  fetchChapters: () => Promise.resolve([]),
}))
vi.mock('#/lib/classeur/transfertExecution.ts', () => ({
  transfererItems: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

const { TransfertDialog } =
  await import('#/components/classeur/dialogs/TransfertDialog.tsx')

function avecClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TransfertDialog — liste des classeurs illisible', () => {
  it('ne propose aucun classeur et le dit', async () => {
    render(
      avecClient(
        <TransfertDialog
          open
          onOpenChange={() => {}}
          origineId={5}
          elements={[] as ChapterItem[]}
          niveauOrigine="ecriture"
          onTransfere={() => {}}
        />,
      ),
    )
    expect(
      await screen.findByText(/Liste des classeurs indisponible/),
    ).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Ailleurs' })).toBeNull()
  })
})
