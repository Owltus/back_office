// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { ChapterItem, DbClasseur } from '#/lib/classeur/types.ts'

/*
 * Relecture adverse du transfert (étape 7c) : mes EXCEPTIONS d'accès
 * illisibles. Une exception peut RETIRER l'écriture d'un classeur ouvert à
 * tous en écriture ; si la lecture de mes exceptions échoue, la liste des
 * cibles ne doit pas les supposer absentes (elle proposerait un classeur
 * où la base refusera tout) : elle doit le dire, comme pour la liste des
 * classeurs.
 */

const USER = 'u-moi'

const classeur = (
  id: number,
  name: string,
  acces_tous: DbClasseur['acces_tous'],
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
  acces_tous,
})

const fetchClasseurs = vi.fn(() =>
  Promise.resolve([
    classeur(5, 'Courant', 'ecriture'),
    classeur(10, 'Fermé à moi', 'ecriture'),
  ]),
)
const fetchMesAcces = vi.fn(() =>
  Promise.reject(new Error('Failed to fetch')),
)

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/auth/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: USER },
    can: (_page: string, niveau: string) => niveau !== 'gestion',
  }),
}))
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchClasseurs: () => fetchClasseurs(),
  fetchMesAcces: () => fetchMesAcces(),
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

describe('TransfertDialog — exceptions d’accès illisibles', () => {
  it('ne propose aucun classeur et le dit, au lieu d’ignorer les exceptions', async () => {
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
    expect(screen.queryByRole('radio', { name: 'Fermé à moi' })).toBeNull()
  })
})
