// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import type { DbChapter } from '#/lib/classeur/types.ts'

/*
 * Suppression d'un chapitre avec sauvegarde : services et lectures
 * simulés, la base n'est pas touchée. Oracle : l'ORDRE des appels — le
 * point de restauration est écrit AVANT la suppression, et son échec
 * empêche la suppression.
 */

const appels: string[] = []
const creerPoint = vi.fn(async (_id: number, _o: { label?: string }) => {
  appels.push('point')
  return 1
})
const softDeleteChapter = vi.fn(async () => {
  appels.push('suppression')
})

vi.mock('#/lib/classeur/restauration.ts', () => ({
  creerPoint: (id: number, o: { label?: string }) => creerPoint(id, o),
}))
vi.mock('#/lib/classeur/service.ts', () => ({
  softDeleteChapter: () => softDeleteChapter(),
}))
vi.mock('#/lib/classeur/exportMarkdown.ts', () => ({
  exporterChapitreZip: vi.fn(),
}))
vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  useChapterContent: () => ({
    data: {
      documents: [{ id: 1 }, { id: 2 }],
      tracking_sheets: [],
      signature_sheets: [],
      intercalaires: [],
    },
  }),
  useClasseur: () => ({ data: { name: 'Classeur' } }),
  usePeriodicites: () => ({ data: [] }),
  useInvaliderClasseur: () => () => Promise.resolve(),
}))
vi.mock('#/lib/classeur/types.ts', () => ({
  flattenItems: (c: { documents: unknown[] }) => c.documents,
}))

const { SuppressionChapitreDialog } =
  await import('#/components/classeur/dialogs/SuppressionChapitreDialog.tsx')

const chapitre = { id: 9, classeur_id: 5, label: 'Sécurité' } as DbChapter

beforeEach(() => {
  appels.length = 0
  creerPoint.mockClear()
  softDeleteChapter.mockClear()
})
afterEach(cleanup)

function ouvrir() {
  const onSupprime = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SuppressionChapitreDialog
        chapter={chapitre}
        onClose={() => {}}
        onSupprime={onSupprime}
      />
    </QueryClientProvider>,
  )
  return onSupprime
}

describe('SuppressionChapitreDialog', () => {
  it('par défaut : point de restauration nommé, PUIS suppression', async () => {
    const onSupprime = ouvrir()
    expect(screen.getByText(/et ses 2 éléments/)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Sauvegarder et supprimer' }),
    )
    await waitFor(() => expect(onSupprime).toHaveBeenCalled())
    expect(appels).toEqual(['point', 'suppression'])
    expect(creerPoint.mock.calls[0][1].label).toBe(
      'Avant suppression du chapitre « Sécurité »',
    )
  })
  it('sauvegarde décochée : suppression seule, avec avertissement', async () => {
    const onSupprime = ouvrir()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText(/ne pourra pas être retrouvé/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(onSupprime).toHaveBeenCalled())
    expect(appels).toEqual(['suppression'])
  })
  it('la sauvegarde échoue : RIEN n’est supprimé, erreur affichée', async () => {
    creerPoint.mockImplementationOnce(async () => {
      throw new Error('réseau')
    })
    const onSupprime = ouvrir()
    fireEvent.click(
      screen.getByRole('button', { name: 'Sauvegarder et supprimer' }),
    )
    await waitFor(() =>
      screen.getByText(/Sauvegarde ou suppression impossible/),
    )
    expect(softDeleteChapter).not.toHaveBeenCalled()
    expect(onSupprime).not.toHaveBeenCalled()
  })
})
