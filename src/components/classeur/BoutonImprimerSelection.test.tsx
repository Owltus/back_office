// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { BoutonImprimerSelection } from '#/components/classeur/BoutonImprimerSelection.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'

afterEach(cleanup)

function rendre(count: number) {
  const onClick = vi.fn()
  const vue = render(
    <TooltipProvider>
      <BoutonImprimerSelection count={count} onClick={onClick} />
    </TooltipProvider>,
  )
  const relire = (n: number) =>
    vue.rerender(
      <TooltipProvider>
        <BoutonImprimerSelection count={n} onClick={onClick} />
      </TooltipProvider>,
    )
  return { onClick, relire }
}

const bouton = () =>
  screen.getByRole('button', { name: /Imprimer la sélection/ })

describe('BoutonImprimerSelection', () => {
  it('désactivé à 0 : aucun aperçu ne peut s’ouvrir', () => {
    const { onClick } = rendre(0)
    expect(bouton()).toHaveProperty('disabled', true)
    expect(bouton().textContent).toBe('Imprimer (0)')
    fireEvent.click(bouton())
    expect(onClick).not.toHaveBeenCalled()
  })
  it('actif dès un élément, le clic ouvre l’aperçu', () => {
    const { onClick } = rendre(1)
    expect(bouton()).toHaveProperty('disabled', false)
    fireEvent.click(bouton())
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it('le compteur suit la sélection', () => {
    const { relire } = rendre(3)
    expect(bouton().textContent).toBe('Imprimer (3)')
    expect(bouton().getAttribute('aria-label')).toBe(
      'Imprimer la sélection (3)',
    )
    relire(5)
    expect(bouton().textContent).toBe('Imprimer (5)')
    relire(0)
    expect(bouton()).toHaveProperty('disabled', true)
  })
})
