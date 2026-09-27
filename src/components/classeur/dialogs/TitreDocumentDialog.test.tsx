// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TitreDocumentDialog } from '#/components/classeur/dialogs/TitreDocumentDialog.tsx'

afterEach(cleanup)

function ouvrir() {
  const onAppliquer = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <TitreDocumentDialog
      open
      onOpenChange={onOpenChange}
      titre="Check-in"
      description="Mise à jour : 01/2026"
      onAppliquer={onAppliquer}
    />,
  )
  return { onAppliquer, onOpenChange }
}

describe('TitreDocumentDialog', () => {
  it('Appliquer reporte les valeurs saisies dans le brouillon et ferme', () => {
    const { onAppliquer, onOpenChange } = ouvrir()
    fireEvent.change(screen.getByLabelText('Titre'), {
      target: { value: 'Check-in client' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))
    expect(onAppliquer).toHaveBeenCalledWith(
      'Check-in client',
      'Mise à jour : 01/2026',
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('Annuler ne reporte rien', () => {
    const { onAppliquer, onOpenChange } = ouvrir()
    fireEvent.change(screen.getByLabelText('Titre'), {
      target: { value: 'autre' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onAppliquer).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
