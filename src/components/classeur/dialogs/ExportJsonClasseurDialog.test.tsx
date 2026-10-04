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
 * Export JSON du classeur complet avec les demandes pour un LLM (D25
 * renversée par l'audit du 2026-10-04). Oracles : sans demande, le fichier
 * est celui de `construireExport` d'avant (au `generated_at` près) ; avec,
 * le texte copié commence par la demande et le JSON la porte ; rien n'est
 * mémorisé d'une ouverture à l'autre.
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
const caseDe = (nom: RegExp) => screen.getByLabelText<HTMLInputElement>(nom)
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

  it('« Corriger » + champ libre : copié en tête et porté par le JSON', async () => {
    render(dialogue(true))
    fireEvent.click(caseDe(/^Corriger/))
    fireEvent.change(screen.getByLabelText('Autre demande'), {
      target: { value: 'Tutoyer' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Copier le JSON/ }))
    await waitFor(() => expect(ecrit).toHaveBeenCalledTimes(1))
    const texte = ecrit.mock.calls[0][0]
    expect(texte.startsWith('Demande :\n- Corrige l')).toBe(true)
    const json = texte.slice(texte.indexOf('\n\n{') + 2)
    const meta = (JSON.parse(json) as { _metadata: { demande?: string } })
      ._metadata
    expect(meta.demande).toMatch(/^- Corrige l[\s\S]*\n- Tutoyer$/)
    await screen.findByText('Copié')
  })

  it('rien n’est mémorisé : fermer puis rouvrir décoche tout', () => {
    const { rerender } = render(dialogue(true))
    fireEvent.click(caseDe(/^Traduire/))
    expect(screen.getByText(/version majeure/)).toBeTruthy()
    rerender(dialogue(false))
    rerender(dialogue(true))
    expect(caseDe(/^Traduire/).checked).toBe(false)
  })
})
