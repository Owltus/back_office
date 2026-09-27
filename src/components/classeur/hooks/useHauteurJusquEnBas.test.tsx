// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

import { useHauteurJusquEnBas } from '#/components/classeur/hooks/useHauteurJusquEnBas.ts'

/*
 * La hauteur de l'éditeur : place visible du conteneur qui défile, moins la
 * position de la zone, moins les rembourrages bas des ancêtres. jsdom ne
 * fait aucune mise en page : positions et tailles sont simulées.
 */
function Zone() {
  const { ref, hauteur } = useHauteurJusquEnBas()
  return <div ref={ref} data-testid="zone" data-hauteur={hauteur ?? 'aucune'} />
}

function monter(largeur: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: largeur,
    configurable: true,
  })
  const defileur = document.createElement('main')
  defileur.className = 'app-scroll'
  Object.defineProperty(defileur, 'clientHeight', { value: 900 })
  defileur.getBoundingClientRect = () => ({ top: 60 }) as DOMRect
  const page = document.createElement('div')
  page.style.paddingBottom = '24px'
  defileur.appendChild(page)
  document.body.appendChild(defileur)
  const rendu = render(<Zone />, { container: page })
  const zone = screen.getByTestId('zone')
  zone.getBoundingClientRect = () => ({ top: 260 }) as DOMRect
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
  return { zone, rendu, defileur }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('useHauteurJusquEnBas', () => {
  it('descend jusqu’au bas visible, marge de page gardée', () => {
    const { zone } = monter(1440)
    // 900 visibles − (260 − 60) de position − 24 de rembourrage − 1.
    expect(zone.dataset.hauteur).toBe('675')
  })
  it('sous la largeur deux colonnes : pas de hauteur imposée', () => {
    const { zone } = monter(800)
    expect(zone.dataset.hauteur).toBe('aucune')
  })
})
