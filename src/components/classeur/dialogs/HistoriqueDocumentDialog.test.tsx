// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import type { DbDocument, DbDocumentVersion } from '#/lib/classeur/types.ts'

/*
 * Le modal d'historique contre un service simulé : la base n'est pas
 * touchée. Oracle : les lignes affichées sont celles que les versions
 * imposent (ajout / retrait), et « Reprendre » rend la version choisie.
 */

const V = (
  id: number,
  content: string,
  extra: Partial<DbDocumentVersion> = {},
): DbDocumentVersion => ({
  id,
  document_id: 17,
  title: 'Check-in',
  description: '',
  content,
  origine: 'enregistrement',
  auteur: 'Camille Martin',
  created_at: `2026-09-2${String(id)}T08:00:00Z`,
  ...extra,
})

const versions = [
  V(3, 'a\nB\nc'),
  V(2, 'a\nb\nc'),
  V(1, 'a\nb', { origine: 'etat_initial', auteur: '' }),
]

vi.mock('#/lib/classeur/service.ts', () => ({
  fetchVersionsDocument: vi.fn(() => Promise.resolve(versions)),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { HistoriqueDocumentDialog } =
  await import('#/components/classeur/dialogs/HistoriqueDocumentDialog.tsx')

const doc = {
  id: 17,
  title: 'Check-in',
  description: '',
  content: 'a\nB\nc',
  updated_at: '2026-09-23T08:00:00Z',
} as DbDocument

afterEach(cleanup)

function ouvrir(onReprendre = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <HistoriqueDocumentDialog
          open
          onOpenChange={() => {}}
          doc={doc}
          peutReprendre
          onReprendre={onReprendre}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return onReprendre
}

const lignesAffichees = () =>
  Array.from(document.querySelectorAll('.font-mono .grid')).map((l) =>
    l.textContent.replace(/^\d*\d*/, '').trim(),
  )

describe('HistoriqueDocumentDialog', () => {
  it('liste les versions, la plus récente choisie : ce qu’a changé cet enregistrement', async () => {
    ouvrir()
    await waitFor(() => screen.getByText('la plus récente'))
    expect(screen.getByText("État avant l'historique")).toBeTruthy()
    expect(screen.getAllByText('Camille Martin')).toHaveLength(2)
    // v2 → v3 : « b » retiré, « B » ajouté.
    expect(screen.getByText('1 ligne ajoutée, 1 ligne retirée.')).toBeTruthy()
    expect(lignesAffichees()).toEqual(['a', '−b', '+B', 'c'])
  })
  it('par rapport au document actuel : identique pour la plus récente', async () => {
    ouvrir()
    await waitFor(() => screen.getByText('la plus récente'))
    fireEvent.click(
      screen.getByRole('radio', { name: 'Par rapport au document actuel' }),
    )
    expect(screen.getByText('Identique au document actuel.')).toBeTruthy()
  })
  it('choisir une autre version, puis la reprendre dans l’éditeur', async () => {
    const onReprendre = ouvrir()
    await waitFor(() => screen.getByText('la plus récente'))
    fireEvent.click(screen.getByText("État avant l'historique"))
    fireEvent.click(
      screen.getByRole('radio', { name: 'Par rapport au document actuel' }),
    )
    // état initial « a b » → actuel « a B c ».
    expect(lignesAffichees()).toEqual(['a', '−b', '+B', '+c'])
    fireEvent.click(
      screen.getByRole('button', { name: /Reprendre cette version/ }),
    )
    expect(onReprendre).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'a\nb' }),
    )
  })
})
