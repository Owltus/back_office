// @vitest-environment jsdom
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

/*
 * Export JSON du classeur complet : deux gestes, aucun choix (étape 3 du plan
 * `classeur-echange-ia-2026-10-19`). Oracles : le fichier téléchargé comme
 * le texte copié sont exactement `construireExport` (au `generated_at`
 * près) ; « Copié » dure deux secondes ; un refus du navigateur télécharge
 * le fichier et le dit en une phrase ; un double clic ne copie qu'une fois.
 */

vi.mock('#/components/classeur/hooks/useClasseur.ts', () => ({
  usePeriodicites: () => ({ data: PERIODICITES, isError: false }),
}))
vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
const telecharge = vi.fn()
vi.mock('#/lib/classeur/download.ts', () => ({
  telechargerTexte: (...args: unknown[]) => telecharge(...args),
}))

const { ExportJsonClasseurDialog } =
  await import('#/components/classeur/dialogs/ExportJsonClasseurDialog.tsx')
const { DUREE_COPIE_MS, MESSAGE_COPIE_REFUSEE } =
  await import('#/components/classeur/hooks/useCopieExport.ts')

const A = chapitre({ id: 10, label: 'Accueil' })
const local = etat([A], {
  documents: [
    document({ id: 1, chapter_id: 10, title: 'Check-in', content: 'x' }),
  ],
})
const sujet = { classeur: classeur(), chapters: [A], content: local.content }

const ecrit = vi.fn<(t: string) => Promise<void>>()
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  telecharge.mockReset()
  ecrit.mockReset()
  ecrit.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: ecrit },
    configurable: true,
  })
})

const dialogue = (open: boolean) => (
  <ExportJsonClasseurDialog open={open} onOpenChange={() => {}} sujet={sujet} />
)
const sansDate = (texte: string) => {
  const o = JSON.parse(texte) as { _metadata: Record<string, unknown> }
  delete o._metadata.generated_at
  return o
}
const attendu = () =>
  JSON.stringify(
    construireExport(classeur(), [A], local.content, PERIODICITES),
    null,
    2,
  )
const copier = () =>
  fireEvent.click(screen.getByRole('button', { name: /^Copier$/ }))

describe('ExportJsonClasseurDialog', () => {
  it('deux gestes seulement, aucune case à cocher, une phrase', () => {
    render(dialogue(true))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /^Copier$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Télécharger/ })).toBeTruthy()
    expect(screen.getByText(/Collez-le dans une IA : elle vous guide\./))
  })

  it('Télécharger : le fichier est exactement l’export, nommé d’après le classeur', () => {
    render(dialogue(true))
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }))
    const [nom, contenu] = telecharge.mock.calls[0] as [string, string]
    expect(nom).toBe('Registre de sécurité.json')
    expect(sansDate(contenu)).toEqual(sansDate(attendu()))
  })

  it('Copier : tout le JSON, mode d’emploi compris (D3), puis « Copié » deux secondes', async () => {
    render(dialogue(true))
    copier()
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const texte = ecrit.mock.calls[0][0]
    expect(texte.startsWith('{')).toBe(true)
    expect(sansDate(texte)).toEqual(sansDate(attendu()))
    expect(
      (JSON.parse(texte) as { _metadata: { instructions: string[] } })._metadata
        .instructions.length,
    ).toBeGreaterThan(5)
    await screen.findByRole('button', { name: /Copié/ })
    expect(telecharge).not.toHaveBeenCalled()
    await waitFor(
      () => expect(screen.getByRole('button', { name: /^Copier$/ })),
      { timeout: DUREE_COPIE_MS + 1000 },
    )
  })

  it('« Copié » est encore là juste avant deux secondes, parti juste après', async () => {
    vi.useFakeTimers()
    render(dialogue(true))
    copier()
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: /Copié/ })).toBeTruthy()
    act(() => vi.advanceTimersByTime(DUREE_COPIE_MS - 50))
    expect(screen.getByRole('button', { name: /Copié/ })).toBeTruthy()
    act(() => vi.advanceTimersByTime(100))
    expect(screen.getByRole('button', { name: /^Copier$/ })).toBeTruthy()
  })

  it('copie refusée : une phrase, le fichier est téléchargé, aucune exception', async () => {
    ecrit.mockRejectedValue(new Error('NotAllowedError'))
    render(dialogue(true))
    copier()
    await screen.findByText(MESSAGE_COPIE_REFUSEE)
    expect(telecharge).toHaveBeenCalledTimes(1)
    const [nom, contenu] = telecharge.mock.calls[0] as [string, string]
    expect(nom).toBe('Registre de sécurité.json')
    expect(sansDate(contenu)).toEqual(sansDate(attendu()))
    expect(screen.queryByRole('button', { name: /Copié/ })).toBeNull()
  })

  it('double clic sur Copier : une seule copie', async () => {
    let finir: () => void = () => {}
    ecrit.mockImplementation(
      () =>
        new Promise<void>((r) => {
          finir = r
        }),
    )
    render(dialogue(true))
    copier()
    copier()
    await act(async () => {
      await Promise.resolve()
    })
    copier()
    expect(ecrit).toHaveBeenCalledTimes(1)
    await act(async () => {
      finir()
      await Promise.resolve()
    })
    await screen.findByRole('button', { name: /Copié/ })
    expect(ecrit).toHaveBeenCalledTimes(1)
  })

  it('rien n’est mémorisé : fermer puis rouvrir efface le message de refus', async () => {
    ecrit.mockRejectedValue(new Error('NotAllowedError'))
    const { rerender } = render(dialogue(true))
    copier()
    await screen.findByText(MESSAGE_COPIE_REFUSEE)
    rerender(dialogue(false))
    rerender(dialogue(true))
    expect(screen.queryByText(MESSAGE_COPIE_REFUSEE)).toBeNull()
  })
})
