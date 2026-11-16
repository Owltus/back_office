// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TemplateEditDialog } from '#/components/affiche/TemplateEditDialog.tsx'

/*
 * Modale « Modifier le modèle » de l'affichage (2026-11-16) : renommer, ou
 * supprimer après une confirmation dans la même modale.
 */

afterEach(cleanup)

function monter() {
  const onRename = vi.fn()
  const onDelete = vi.fn()
  render(
    <TemplateEditDialog
      open
      onOpenChange={() => {}}
      name="Piscine fermée"
      onRename={onRename}
      onDelete={onDelete}
    />,
  )
  return { onRename, onDelete }
}

describe('TemplateEditDialog', () => {
  it('renomme le modèle', () => {
    const { onRename } = monter()
    const champ = screen.getByPlaceholderText('Nom affiché dans la liste')
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer' })
    // Nom inchangé ou vide : rien à enregistrer.
    expect(enregistrer).toHaveProperty('disabled', true)
    fireEvent.change(champ, { target: { value: '  ' } })
    expect(enregistrer).toHaveProperty('disabled', true)
    fireEvent.change(champ, { target: { value: ' Piscine ouverte ' } })
    fireEvent.click(enregistrer)
    expect(onRename).toHaveBeenCalledWith('Piscine ouverte')
  })

  it('ne supprime qu’après confirmation', () => {
    const { onDelete } = monter()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Supprimer le modèle ?')).toBeTruthy()
    // Annuler revient au renommage sans rien supprimer.
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByText('Modifier le modèle')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
