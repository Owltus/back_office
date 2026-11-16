// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { ItemCardCommonProps } from '#/components/classeur/cards/ItemCardShell.tsx'
import { chapitre, document } from '#/lib/classeur/merge/fixtures.ts'
import type { ChapterItem, DbDocument } from '#/lib/classeur/types.ts'

/*
 * « Documents modifiés » en cartes (demande utilisateur du 2026-11-16) :
 * Tout imprimer par défaut, Sélectionner pour en choisir, Déjà à jour.
 * Les cartes sont simulées (leur miniature pagine dans un navigateur) ;
 * elles exposent ce que la fenêtre leur passe.
 */

const carte = ({
  doc,
  isSelected,
  selectionMode,
  onOpen,
  onToggleSelect,
}: ItemCardCommonProps & { doc: DbDocument }) => (
  <button
    type="button"
    aria-pressed={selectionMode ? isSelected : undefined}
    onClick={() => (selectionMode ? onToggleSelect?.() : onOpen?.())}
  >
    {doc.title}
  </button>
)
vi.mock('#/components/classeur/cards/DocumentCard.tsx', () => ({
  DocumentCard: carte,
}))

const { DocumentsModifiesDialog } =
  await import('#/components/classeur/dialogs/DocumentsModifiesDialog.tsx')

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })
const B = chapitre({ id: 20, label: 'Sécurité', sort_order: 2 })
const el = (id: number, chapter_id: number, title: string): ChapterItem => ({
  kind: 'document',
  data: document({ id, chapter_id, title }),
})
const d1 = el(1, 10, 'Check-in')
const d2 = el(2, 10, 'Check-out')
const d3 = el(3, 20, 'Extincteur')

const onImprimer = vi.fn()
const onDejaAJour = vi.fn()

function ouvrir() {
  render(
    <DocumentsModifiesDialog
      open
      onOpenChange={() => {}}
      classeurId={1}
      groupes={[
        { chapitre: A, items: [d1, d2] },
        { chapitre: B, items: [d3] },
      ]}
      periodicites={[]}
      onImprimer={onImprimer}
      onDejaAJour={onDejaAJour}
    />,
  )
}

const bouton = (nom: string | RegExp) =>
  screen.getByRole('button', { name: nom })
const titres = (items: ChapterItem[]) => items.map((it) => it.data.title)

afterEach(() => {
  cleanup()
  onImprimer.mockReset()
  onDejaAJour.mockReset()
})

describe('DocumentsModifiesDialog', () => {
  it('les cartes rangées par chapitre ; Tout imprimer envoie tout, dans l’ordre', () => {
    ouvrir()
    expect(screen.getByRole('region', { name: 'Accueil' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Sécurité' })).toBeTruthy()
    fireEvent.click(bouton(/Tout imprimer/))
    expect(titres(onImprimer.mock.calls[0][0] as ChapterItem[])).toEqual([
      'Check-in',
      'Check-out',
      'Extincteur',
    ])
  })

  it('Sélectionner, puis choisir deux cartes : seule la sélection part, dans l’ordre', () => {
    ouvrir()
    fireEvent.click(bouton(/^Sélectionner/))
    expect(bouton(/Imprimer la sélection/).hasAttribute('disabled')).toBe(true)
    fireEvent.click(bouton('Extincteur'))
    fireEvent.click(bouton('Check-in'))
    expect(screen.getByText(/2 éléments sélectionnés/)).toBeTruthy()
    fireEvent.click(bouton(/Imprimer la sélection/))
    expect(titres(onImprimer.mock.calls[0][0] as ChapterItem[])).toEqual([
      'Check-in',
      'Extincteur',
    ])
  })

  it('un clic sur une carte commence la sélection avec elle', () => {
    ouvrir()
    fireEvent.click(bouton('Check-out'))
    expect(bouton('Check-out').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(bouton(/Imprimer la sélection/))
    expect(titres(onImprimer.mock.calls[0][0] as ChapterItem[])).toEqual([
      'Check-out',
    ])
  })

  it('Annuler la sélection revient à Tout imprimer ; Déjà à jour retient sans imprimer', () => {
    ouvrir()
    fireEvent.click(bouton('Check-out'))
    fireEvent.click(bouton(/Annuler la sélection/))
    expect(bouton(/Tout imprimer/)).toBeTruthy()
    fireEvent.click(bouton(/Déjà à jour/))
    expect(onDejaAJour).toHaveBeenCalledTimes(1)
    expect(onImprimer).not.toHaveBeenCalled()
  })
})
