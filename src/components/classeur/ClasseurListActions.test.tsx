// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/*
 * « Copier pour une IA » depuis le menu de la liste des classeurs (étape 3
 * du plan `classeur-echange-ia-2026-10-19`). Oracles : le texte copié est
 * exactement l'export du classeur ; un double clic ne lit le contenu qu'une
 * fois ; un refus du navigateur télécharge le fichier et le dit en une
 * phrase ; « Copié » s'affiche après une copie réussie.
 */

const A = chapitre({ id: 10, label: 'Accueil' })
const local = etat([A], {
  documents: [document({ id: 1, chapter_id: 10, title: 'Check-in' })],
})
const C = classeur()

const lectures = vi.fn()
let finirLecture: (() => void) | null = null
vi.mock('#/lib/classeur/service.ts', () => ({
  fetchClasseurContent: () => {
    lectures()
    return new Promise((r) => {
      finirLecture = () => r({ chapters: [A], content: local.content })
    })
  },
  fetchPeriodicites: () => Promise.resolve(PERIODICITES),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/classeur/hooks/useMerge.ts', () => ({
  useImporterNouveauClasseur: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
const telecharge = vi.fn()
vi.mock('#/lib/classeur/download.ts', () => ({
  telechargerTexte: (...args: unknown[]) => telecharge(...args),
}))
// La liste elle-même est testée ailleurs : ici, un bouton par action.
vi.mock('#/components/classeur/ClasseurList.tsx', () => ({
  ClasseurList: ({
    onCopierJson,
    onExporterJson,
  }: {
    onCopierJson: (c: DbClasseur) => void
    onExporterJson: (c: DbClasseur) => void
  }) => (
    <>
      <button onClick={() => onCopierJson(C)}>Copier pour une IA</button>
      <button onClick={() => onExporterJson(C)}>Exporter en JSON</button>
    </>
  ),
}))

const { ClasseurListActions } =
  await import('#/components/classeur/ClasseurListActions.tsx')
const { MESSAGE_COPIE_REFUSEE } =
  await import('#/components/classeur/hooks/useCopieExport.ts')

const ecrit = vi.fn<(t: string) => Promise<void>>()
afterEach(cleanup)
beforeEach(() => {
  lectures.mockReset()
  telecharge.mockReset()
  ecrit.mockReset()
  ecrit.mockResolvedValue(undefined)
  finirLecture = null
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: ecrit },
    configurable: true,
  })
})

function rendre() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ClasseurListActions />
    </QueryClientProvider>,
  )
}
const sansDate = (t: string) => {
  const o = JSON.parse(t) as { _metadata: Record<string, unknown> }
  delete o._metadata.generated_at
  return o
}
async function lectureFinie() {
  await waitFor(() => expect(finirLecture).not.toBeNull())
  await act(async () => {
    finirLecture?.()
    await Promise.resolve()
  })
}

describe('ClasseurListActions — Copier pour une IA', () => {
  it('le texte copié est exactement l’export du classeur ; « Copié » s’affiche', async () => {
    rendre()
    fireEvent.click(screen.getByText('Copier pour une IA'))
    await lectureFinie()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const attendu = JSON.stringify(
      construireExport(C, [A], local.content, PERIODICITES),
      null,
      2,
    )
    expect(sansDate(ecrit.mock.calls[0][0])).toEqual(sansDate(attendu))
    expect((await screen.findByRole('status')).textContent).toBe('Copié')
    expect(telecharge).not.toHaveBeenCalled()
  })

  it('double clic : le contenu n’est lu qu’une fois, une seule copie', async () => {
    rendre()
    fireEvent.click(screen.getByText('Copier pour une IA'))
    fireEvent.click(screen.getByText('Copier pour une IA'))
    await lectureFinie()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    expect(lectures).toHaveBeenCalledTimes(1)
  })

  it('copie refusée : une phrase, le fichier téléchargé, aucune erreur affichée', async () => {
    ecrit.mockRejectedValue(new Error('NotAllowedError'))
    rendre()
    fireEvent.click(screen.getByText('Copier pour une IA'))
    await lectureFinie()
    await screen.findByText(MESSAGE_COPIE_REFUSEE)
    expect(telecharge).toHaveBeenCalledTimes(1)
    expect(telecharge.mock.calls[0][0]).toBe('Registre de sécurité.json')
    expect(screen.queryByText(/Copie impossible/)).toBeNull()
  })

  it('Exporter en JSON : même texte, téléchargé', async () => {
    rendre()
    fireEvent.click(screen.getByText('Exporter en JSON'))
    await lectureFinie()
    await waitFor(() => expect(telecharge).toHaveBeenCalledTimes(1))
    const [nom, contenu] = telecharge.mock.calls[0] as [string, string]
    expect(nom).toBe('Registre de sécurité.json')
    expect(sansDate(contenu)).toEqual(
      sansDate(
        JSON.stringify(
          construireExport(C, [A], local.content, PERIODICITES),
          null,
          2,
        ),
      ),
    )
    expect(ecrit).not.toHaveBeenCalled()
  })
})
