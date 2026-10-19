// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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
 * Export JSON du classeur complet (demandes à cocher retirées le
 * 2026-10-19). Oracle : le fichier téléchargé comme le texte copié sont
 * exactement `construireExport` (au `generated_at` près).
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

const A = chapitre({ id: 10, label: 'Accueil' })
const local = etat([A], {
  documents: [
    document({ id: 1, chapter_id: 10, title: 'Check-in', content: 'x' }),
  ],
})
const sujet = { classeur: classeur(), chapters: [A], content: local.content }

const ecrit = vi.fn<(t: string) => Promise<void>>()
afterEach(cleanup)
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

describe('ExportJsonClasseurDialog', () => {
  it('rien de coché : le fichier téléchargé est l’export d’avant, sans demande', () => {
    render(dialogue(true))
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }))
    const [nom, contenu] = telecharge.mock.calls[0] as [string, string]
    expect(nom).toBe('Registre de sécurité.json')
    const attendu = JSON.stringify(
      construireExport(classeur(), [A], local.content, PERIODICITES),
      null,
      2,
    )
    expect(sansDate(contenu)).toEqual(sansDate(attendu))
    expect('demande' in sansDate(contenu)._metadata).toBe(false)
  })

  it('Copier : le presse-papiers reçoit le JSON seul, sans demande', async () => {
    render(dialogue(true))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /Copier le JSON/ }))
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const texte = ecrit.mock.calls[0][0]
    expect(texte.startsWith('{')).toBe(true)
    const attendu = JSON.stringify(
      construireExport(classeur(), [A], local.content, PERIODICITES),
      null,
      2,
    )
    expect(sansDate(texte)).toEqual(sansDate(attendu))
    expect('demande' in sansDate(texte)._metadata).toBe(false)
    await screen.findByText('Copié')
  })
})
