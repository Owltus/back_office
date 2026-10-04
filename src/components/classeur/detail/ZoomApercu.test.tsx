// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ZoomApercu } from '#/components/classeur/detail/ZoomApercu.tsx'
import { useZoomApercu } from '#/components/classeur/hooks/useZoomApercu.ts'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'

/*
 * Étape 8 : contrôle de zoom de l'aperçu et gestes (D28). jsdom ne fait pas
 * de mise en page : la colonne est mesurée à 448 × 600 px par un bouchon de
 * `getBoundingClientRect`, soit une place utile de 400 × 568 px (marges 48
 * et 32) ; « ajusté » vaut alors 400 ÷ 793,7 ≈ 50 %.
 */

const CLE = 'bo.classeur.zoomApercu.v1'

function Banc() {
  const zoom = useZoomApercu()
  return (
    <TooltipProvider>
      <div data-testid="zone" ref={zoom.zoneRef}>
        <div data-testid="defilement" ref={zoom.defilementRef}>
          <div data-testid="pages" style={{ zoom: zoom.echelle }} />
        </div>
        <ZoomApercu
          mode={zoom.mode}
          echelle={zoom.echelle}
          onMode={zoom.definirMode}
          onZoomer={zoom.zoomer}
        />
      </div>
      <button type="button" data-testid="ailleurs">
        ailleurs
      </button>
    </TooltipProvider>
  )
}

function libelle(): string {
  return screen.getByRole('button', { name: /^Zoom de l'aperçu/ }).textContent
}

function molette(cible: Element, init: WheelEventInit): WheelEvent {
  const e = new WheelEvent('wheel', {
    cancelable: true,
    bubbles: true,
    ...init,
  })
  act(() => {
    cible.dispatchEvent(e)
  })
  return e
}

function touche(init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    cancelable: true,
    bubbles: true,
    ...init,
  })
  act(() => {
    window.dispatchEvent(e)
  })
  return e
}

beforeEach(() => {
  window.localStorage.clear()
  // Absent de jsdom ; l'infobulle (Radix) en a besoin au focus.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 448,
    bottom: 600,
    width: 448,
    height: 600,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ZoomApercu', () => {
  it('« Ajusté » par défaut, échelle mesurée sur la colonne', () => {
    render(<Banc />)
    expect(libelle()).toBe('Ajusté')
    const pages = screen.getByTestId('pages')
    expect(Number(pages.style.zoom)).toBeCloseTo(400 / ((210 * 96) / 25.4), 6)
    // L'infobulle d'accessibilité donne le pourcentage réel.
    expect(
      screen.getByRole('button', { name: "Zoom de l'aperçu : Ajusté (50 %)" }),
    ).toBeTruthy()
  })

  it('« + » et « − » vont au palier voisin de l’échelle effective', () => {
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: "Agrandir l'aperçu" }))
    expect(libelle()).toBe('75 %')
    fireEvent.click(screen.getByRole('button', { name: "Agrandir l'aperçu" }))
    expect(libelle()).toBe('100 %')
    fireEvent.click(screen.getByRole('button', { name: "Réduire l'aperçu" }))
    expect(libelle()).toBe('75 %')
    expect(window.localStorage.getItem(CLE)).toBe('0.75')
  })

  it('le menu propose les modes et les pourcentages, et le libellé suit', () => {
    render(<Banc />)
    const declencheur = screen.getByRole('button', {
      name: /^Zoom de l'aperçu/,
    })
    fireEvent.keyDown(declencheur, { key: 'Enter' })
    const items = screen.getAllByRole('menuitemradio').map((i) => i.textContent)
    expect(items).toEqual([
      'Ajuster à la largeur',
      'Page entière',
      '50 %',
      '75 %',
      '100 %',
      '125 %',
      '150 %',
      '200 %',
    ])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Page entière' }))
    expect(libelle()).toBe('Page entière')
    expect(window.localStorage.getItem(CLE)).toBe('page')

    fireEvent.keyDown(
      screen.getByRole('button', { name: /^Zoom de l'aperçu/ }),
      {
        key: 'Enter',
      },
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: '150 %' }))
    expect(libelle()).toBe('150 %')
    expect(screen.getByTestId('pages').style.zoom).toBe('1.5')
  })

  it('le mode est mémorisé par poste, une valeur illisible est ignorée', () => {
    window.localStorage.setItem(CLE, '1.25')
    render(<Banc />)
    expect(libelle()).toBe('125 %')
    cleanup()
    window.localStorage.setItem(CLE, 'n’importe quoi')
    render(<Banc />)
    expect(libelle()).toBe('Ajusté')
  })

  it('stockage refusé : rien ne casse', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refusé')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refusé')
    })
    render(<Banc />)
    expect(libelle()).toBe('Ajusté')
    fireEvent.click(screen.getByRole('button', { name: "Agrandir l'aperçu" }))
    expect(libelle()).toBe('75 %')
  })

  it('molette SANS Ctrl : défilement normal, jamais de preventDefault', () => {
    render(<Banc />)
    const e = molette(screen.getByTestId('defilement'), { deltaY: -100 })
    expect(e.defaultPrevented).toBe(false)
    expect(libelle()).toBe('Ajusté')
  })

  it('Ctrl + molette au-dessus de l’aperçu : zoom, preventDefault', () => {
    render(<Banc />)
    const e = molette(screen.getByTestId('defilement'), {
      deltaY: -100,
      ctrlKey: true,
    })
    expect(e.defaultPrevented).toBe(true)
    // 50,4 % × e^0,2 ≈ 61,6 %.
    expect(libelle()).toBe('62 %')
    const m = molette(screen.getByTestId('defilement'), {
      deltaY: 100,
      metaKey: true,
    })
    expect(m.defaultPrevented).toBe(true)
    expect(libelle()).toBe('50 %')
  })

  it('Ctrl + molette AILLEURS : le zoom du navigateur reste', () => {
    render(<Banc />)
    const e = molette(screen.getByTestId('ailleurs'), {
      deltaY: -100,
      ctrlKey: true,
    })
    expect(e.defaultPrevented).toBe(false)
    expect(libelle()).toBe('Ajusté')
  })

  it('Ctrl + « + » / « − » / 0 seulement pointeur sur l’aperçu', () => {
    render(<Banc />)
    // Pointeur ailleurs, focus ailleurs : le navigateur garde ses raccourcis.
    const dehors = touche({ key: '+', ctrlKey: true })
    expect(dehors.defaultPrevented).toBe(false)
    expect(libelle()).toBe('Ajusté')

    fireEvent.pointerEnter(screen.getByTestId('zone'))
    expect(touche({ key: '=', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(libelle()).toBe('75 %')
    expect(touche({ key: '-', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(libelle()).toBe('50 %')
    expect(touche({ key: '+', ctrlKey: true }).defaultPrevented).toBe(true)
    // Ctrl + 0 (clavier AZERTY : la touche 0 rend « à » sans Maj).
    expect(
      touche({ key: 'à', code: 'Digit0', ctrlKey: true }).defaultPrevented,
    ).toBe(true)
    expect(libelle()).toBe('Ajusté')
    // Sans Ctrl : rien.
    expect(touche({ key: '+' }).defaultPrevented).toBe(false)

    fireEvent.pointerLeave(screen.getByTestId('zone'))
    expect(touche({ key: '0', ctrlKey: true }).defaultPrevented).toBe(false)
  })

  it('le focus dans l’aperçu suffit pour Ctrl + 0', () => {
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: "Agrandir l'aperçu" }))
    expect(libelle()).toBe('75 %')
    screen.getByRole('button', { name: "Agrandir l'aperçu" }).focus()
    expect(touche({ key: '0', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(libelle()).toBe('Ajusté')
  })

  it('bornes : « − » grisé à 25 %, « + » grisé à 400 %', () => {
    window.localStorage.setItem(CLE, '0.25')
    render(<Banc />)
    expect(
      screen
        .getByRole('button', {
          name: "Réduire l'aperçu",
        })
        .hasAttribute('disabled'),
    ).toBe(true)
    cleanup()
    window.localStorage.setItem(CLE, '4')
    render(<Banc />)
    expect(
      screen
        .getByRole('button', {
          name: "Agrandir l'aperçu",
        })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
})
